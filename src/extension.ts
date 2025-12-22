import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

interface SessionInfo {
    projectName: string;
    projectPath: string;
    sessionId: string;
    sessionFile: string;
    inputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalTokens: number;
    percentage: number;
    lastUpdated: Date;
    model: string;
    contextLimit: number;
    firstMessage: string;
    sessionCreated: Date | null;
    wasCleared: boolean;
}

interface StatusBarEntry {
    item: vscode.StatusBarItem;
    sessionFile: string;
}

const statusBarItems: Map<string, StatusBarEntry> = new Map();
let fileWatcher: fs.FSWatcher | null = null;
let refreshInterval: NodeJS.Timeout | null = null;

export function activate(context: vscode.ExtensionContext) {
    console.log('Claude Context Bar is now active');

    // Initial scan
    refreshAllSessions();

    // Set up file watcher
    const claudeProjectsDir = getClaudeProjectsDir();
    if (fs.existsSync(claudeProjectsDir)) {
        try {
            fileWatcher = fs.watch(claudeProjectsDir, { recursive: true }, (event, filename) => {
                if (filename?.endsWith('.jsonl')) {
                    refreshAllSessions();
                }
            });
        } catch (e) {
            console.error('Failed to set up file watcher:', e);
        }
    }

    // Set up periodic refresh
    const config = vscode.workspace.getConfiguration('claudeContextBar');
    const intervalSeconds = config.get<number>('refreshInterval', 30);
    refreshInterval = setInterval(refreshAllSessions, intervalSeconds * 1000);

    // Clean up on deactivation
    context.subscriptions.push({
        dispose: () => {
            if (fileWatcher) {
                fileWatcher.close();
            }
            if (refreshInterval) {
                clearInterval(refreshInterval);
            }
            statusBarItems.forEach(entry => entry.item.dispose());
            statusBarItems.clear();
        }
    });
}

export function deactivate() {
    if (fileWatcher) {
        fileWatcher.close();
    }
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    statusBarItems.forEach(entry => entry.item.dispose());
    statusBarItems.clear();
}

function getClaudeProjectsDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.claude', 'projects');
}

function decodeProjectPath(encodedName: string): { name: string; fullPath: string } {
    // Claude encodes paths like: -c-dev-amaran-light-bot or -Users-Ed-work-my-project
    // The dashes represent path separators, BUT folder names can also contain dashes
    // 
    // Strategy: Detect OS from the pattern and reconstruct path
    let decoded = encodedName;

    // Remove leading dash
    if (decoded.startsWith('-')) {
        decoded = decoded.substring(1);
    }

    // Split by dashes
    const parts = decoded.split('-');
    let fullPath: string;
    let projectName: string;

    // Check if Windows pattern (first part is single drive letter like 'c', 'd', etc.)
    if (parts.length > 0 && parts[0].length === 1 && /[a-zA-Z]/.test(parts[0])) {
        // Windows path: C:\dev\amaran-light-bot
        // Claude typically encodes as: -c-dev-amaran-light-bot
        // We need at least 2 parts for drive + first folder
        fullPath = parts[0].toUpperCase() + ':\\' + parts.slice(1).join('\\');

        // Project name: use last 3 parts joined with dashes (handles names like amaran-light-bot)
        // This is a heuristic - most project names are 1-3 dash-separated words
        if (parts.length >= 3) {
            // Take everything after drive + first folder (usually 'dev' or 'Users')
            const projectParts = parts.slice(2);
            projectName = projectParts.join('-');
        } else {
            projectName = parts[parts.length - 1] || 'Unknown';
        }
    } else {
        // Unix path: /Users/Ed/work/my-project
        fullPath = '/' + parts.join('/');

        // Similar heuristic for Unix
        if (parts.length >= 3) {
            // Skip common prefixes like Users, home, etc.
            const projectParts = parts.slice(Math.max(2, parts.length - 3));
            projectName = projectParts.join('-');
        } else {
            projectName = parts[parts.length - 1] || 'Unknown';
        }
    }

    return { name: projectName, fullPath };
}

interface TokenUsage {
    inputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalTokens: number;
    model: string;
    firstMessage: string;
    sessionCreated: Date | null;
    wasCleared: boolean;  // True if session ended with /clear command
}

// Determine context limit based on model
function getContextLimitForModel(model: string, userLimit: number): number {
    // Sonnet 4.5 1M has 1 million token context
    if (model.toLowerCase().includes('sonnet') && model.toLowerCase().includes('1m')) {
        return 1000000;
    }
    // All other models (Sonnet 4.5, Opus 4.5, Haiku) have 200K
    return userLimit;
}

// Fuzzy emoji matching based on project name
function getEmojiForProject(projectName: string): string {
    const name = projectName.toLowerCase();

    // Emoji mappings with keywords
    const emojiMap: [string[], string][] = [
        // Music & Audio
        [['music', 'audio', 'sound', 'song', 'beat', 'dj', 'ableton', 'daw', 'synth', 'midi', 'tone', 'rhythm'], '🎵'],
        // Games
        [['game', 'play', 'unity', 'unreal', 'godot', 'arcade', 'puzzle'], '🎮'],
        // Web & Frontend
        [['web', 'website', 'frontend', 'react', 'vue', 'angular', 'html', 'css', 'ui', 'ux'], '🌐'],
        // Backend & API
        [['api', 'backend', 'server', 'rest', 'graphql', 'microservice'], '⚙️'],
        // Mobile
        [['mobile', 'ios', 'android', 'app', 'flutter', 'react-native', 'swift', 'kotlin'], '📱'],
        // Data & ML
        [['data', 'ml', 'ai', 'machine', 'learning', 'model', 'train', 'neural', 'tensor'], '🤖'],
        // Database
        [['database', 'db', 'sql', 'mongo', 'postgres', 'mysql', 'redis'], '🗄️'],
        // DevOps & Cloud
        [['devops', 'cloud', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'k8s', 'deploy'], '☁️'],
        // Security
        [['security', 'auth', 'crypto', 'encrypt', 'password', 'oauth'], '🔐'],
        // Testing
        [['test', 'spec', 'jest', 'mocha', 'cypress', 'selenium'], '🧪'],
        // Documentation
        [['doc', 'docs', 'readme', 'wiki', 'guide', 'tutorial'], '📚'],
        // Tools & Extensions
        [['tool', 'extension', 'plugin', 'vscode', 'editor'], '🔧'],
        // Chat & Communication
        [['chat', 'message', 'slack', 'discord', 'bot'], '💬'],
        // Finance
        [['finance', 'money', 'payment', 'bank', 'crypto', 'trade'], '💰'],
        // Health
        [['health', 'medical', 'fitness', 'workout'], '❤️'],
        // E-commerce
        [['shop', 'store', 'ecommerce', 'cart', 'product'], '🛒'],
        // Media & Video
        [['video', 'stream', 'youtube', 'media', 'film', 'movie'], '🎬'],
        // Art & Design
        [['art', 'design', 'draw', 'paint', 'sketch', 'creative', 'graphic'], '🎨'],
    ];

    for (const [keywords, emoji] of emojiMap) {
        for (const keyword of keywords) {
            if (name.includes(keyword)) {
                return emoji;
            }
        }
    }

    // Default brain emoji for coding/AI projects
    return '🧠';
}

async function getLatestTokenCount(jsonlPath: string): Promise<TokenUsage> {
    return new Promise((resolve) => {
        try {
            const stats = fs.statSync(jsonlPath);
            if (stats.size === 0) {
                resolve({ inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, model: '', firstMessage: '', sessionCreated: null, wasCleared: false });
                return;
            }

            // Read the file
            const content = fs.readFileSync(jsonlPath, 'utf-8');
            const lines = content.trim().split('\n');

            // Scan backwards to find the last /clear command AND check for user activity after it
            let lastClearIndex = -1;
            let userMessagesAfterClear = 0;

            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i];
                if (!line.trim()) continue;
                try {
                    const entry = JSON.parse(line);

                    // Check for User message
                    if (entry.type === 'user' && entry.message?.content) {
                        const msgContent = entry.message.content;

                        // Check for /clear command
                        if (typeof msgContent === 'string' && msgContent.includes('<command-name>/clear</command-name>')) {
                            lastClearIndex = i;
                            break; // Found the latest clear, stop scanning
                        }

                        // If not clear, it's a user message after the clear point (since we're going backwards)
                        userMessagesAfterClear++;
                    }
                } catch (e) {
                    continue;
                }
            }

            // Determine if session is effectively cleared
            // It is cleared IF:
            // 1. We found a /clear command
            // 2. AND there are NO user messages after it (meaning the user hasn't continued the session yet)
            const wasCleared = (lastClearIndex !== -1 && userMessagesAfterClear === 0);

            // Calculate usage and finding first message starting from AFTER the clear
            const startIndex = lastClearIndex >= 0 ? lastClearIndex + 1 : 0;

            let firstMessage = '';
            let sessionCreated: Date | null = null;
            let model = '';
            let finalUsage = { inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0 };

            // Forward pass from start index to find metadata and latest usage
            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i];
                if (!line.trim()) continue;
                try {
                    const entry = JSON.parse(line);

                    // Get session creation timestamp (first valid timestamp after clear)
                    if (!sessionCreated && entry.timestamp) {
                        sessionCreated = new Date(entry.timestamp);
                    }

                    // Look for first user message (for display)
                    if (!firstMessage && entry.type === 'user' && entry.message?.content) {
                        const msgContent = entry.message.content;
                        // Skip command-related messages
                        if (typeof msgContent === 'string' &&
                            !msgContent.includes('<command-name>') &&
                            !msgContent.includes('<local-command-') &&
                            !msgContent.includes('Caveat:')) {
                            firstMessage = msgContent.substring(0, 60);
                        } else if (Array.isArray(msgContent) && msgContent[0]?.text) {
                            firstMessage = msgContent[0].text.substring(0, 60);
                        }
                    }

                    // Update latest usage/model as we go (capturing the last valid usage report)
                    if (entry.message?.model) {
                        model = entry.message.model;
                    }
                    if (entry.message?.usage || entry.usage) {
                        const u = entry.message?.usage || entry.usage;
                        finalUsage = {
                            inputTokens: u.input_tokens || 0,
                            cacheReadTokens: u.cache_read_input_tokens || 0,
                            cacheCreationTokens: u.cache_creation_input_tokens || 0,
                            totalTokens: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
                        };
                    }
                } catch (e) {
                    continue;
                }
            }

            resolve({
                inputTokens: finalUsage.inputTokens,
                cacheReadTokens: finalUsage.cacheReadTokens,
                cacheCreationTokens: finalUsage.cacheCreationTokens,
                totalTokens: finalUsage.totalTokens,
                model,
                firstMessage: firstMessage ? firstMessage + '...' : '',
                sessionCreated,
                wasCleared
            });

        } catch (e) {
            resolve({ inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, model: '', firstMessage: '', sessionCreated: null, wasCleared: false });
        }
    });
}

async function findActiveSessions(): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];
    const claudeDir = getClaudeProjectsDir();

    if (!fs.existsSync(claudeDir)) {
        return sessions;
    }

    const config = vscode.workspace.getConfiguration('claudeContextBar');
    const contextLimit = config.get<number>('contextLimit', 200000);

    // Only look at sessions modified in the last 5 minutes (active sessions)
    const cutoffTime = Date.now() - (5 * 60 * 1000);

    try {
        const projectDirs = fs.readdirSync(claudeDir);

        for (const projectDir of projectDirs) {
            const projectPath = path.join(claudeDir, projectDir);
            const stat = fs.statSync(projectPath);

            if (!stat.isDirectory()) continue;

            // Skip Claude Memory and plugin directories (background agents, not interactive sessions)
            if (projectDir.includes('claude-plugins') || projectDir.includes('claude-mem')) continue;

            // Find JSONL files modified within cutoff time
            const files = fs.readdirSync(projectPath)
                .filter(f => f.endsWith('.jsonl'))
                // Skip agent files (claude-mem background processes)
                .filter(f => !f.startsWith('agent-'))
                .map(f => ({
                    name: f,
                    path: path.join(projectPath, f),
                    mtime: fs.statSync(path.join(projectPath, f)).mtime
                }))
                .filter(f => f.mtime.getTime() > cutoffTime)
                .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

            if (files.length === 0) continue;

            // Get token count from EACH active session file (1 per Claude Code tab)
            for (const file of files) {
                const usage = await getLatestTokenCount(file.path);

                if (usage.totalTokens > 0) {
                    const { name, fullPath } = decodeProjectPath(projectDir);
                    // Extract short session ID from filename
                    const sessionId = file.name.replace('.jsonl', '').substring(0, 8);
                    // Auto-detect context limit based on model
                    const sessionContextLimit = getContextLimitForModel(usage.model, contextLimit);
                    sessions.push({
                        projectName: name,
                        projectPath: fullPath,
                        sessionId,
                        sessionFile: file.path,
                        inputTokens: usage.inputTokens,
                        cacheReadTokens: usage.cacheReadTokens,
                        cacheCreationTokens: usage.cacheCreationTokens,
                        totalTokens: usage.totalTokens,
                        percentage: Math.round((usage.totalTokens / sessionContextLimit) * 100),
                        lastUpdated: file.mtime,
                        model: usage.model,
                        contextLimit: sessionContextLimit,
                        firstMessage: usage.firstMessage,
                        sessionCreated: usage.sessionCreated,
                        wasCleared: usage.wasCleared
                    });
                }
            }
        }
    } catch (e) {
        console.error('Error scanning Claude projects:', e);
    }

    // Group sessions by base project name
    const projectGroups = new Map<string, SessionInfo[]>();
    for (const session of sessions) {
        const base = session.projectName;
        if (!projectGroups.has(base)) {
            projectGroups.set(base, []);
        }
        projectGroups.get(base)!.push(session);
    }

    // Process each project group: filter superseded sessions and apply stable numbering
    const finalSessions: SessionInfo[] = [];
    for (const [baseName, group] of projectGroups) {
        // Sort by session CREATION time (newest first) to identify supersession
        group.sort((a, b) => {
            const aTime = a.sessionCreated?.getTime() || 0;
            const bTime = b.sessionCreated?.getTime() || 0;
            return bTime - aTime;  // Newest first
        });

        // Filter out superseded sessions
        // A session is "superseded" if:
        // 1. A newer session exists that was created AFTER this session's last update
        //    (meaning the user started a new session after abandoning this one)
        // 2. OR it has wasCleared=true (ended with /clear, no activity after)

        const activeSessions: SessionInfo[] = [];

        for (let i = 0; i < group.length; i++) {
            const session = group[i];

            // Check if cleared
            if (session.wasCleared) {
                continue; // Skip cleared sessions
            }

            // Check if superseded by a newer session
            let isSuperseded = false;
            for (let j = 0; j < i; j++) {
                const newerSession = group[j];
                const newerCreated = newerSession.sessionCreated?.getTime() || 0;
                const thisLastUpdated = session.lastUpdated.getTime();

                // If a newer session was CREATED after this session's LAST UPDATE,
                // then this session was abandoned and shouldn't be shown
                if (newerCreated > thisLastUpdated) {
                    isSuperseded = true;
                    break;
                }
            }

            if (!isSuperseded) {
                activeSessions.push(session);
            }
        }

        // Re-sort by creation time for stable numbering (oldest first)
        activeSessions.sort((a, b) => {
            const aTime = a.sessionCreated?.getTime() || 0;
            const bTime = b.sessionCreated?.getTime() || 0;
            return aTime - bTime;
        });

        // Apply stable numbering
        for (let i = 0; i < activeSessions.length; i++) {
            if (i === 0) {
                activeSessions[i].projectName = baseName;
            } else {
                activeSessions[i].projectName = `${baseName}-${i + 1}`;
            }
        }

        finalSessions.push(...activeSessions);
    }

    // Sort by mtime for display order (most recent first)
    finalSessions.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());

    return finalSessions.slice(0, 5);
}

function formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
        return (tokens / 1000000).toFixed(1) + 'M';
    } else if (tokens >= 1000) {
        return Math.round(tokens / 1000) + 'K';
    }
    return tokens.toString();
}

async function refreshAllSessions() {
    const sessions = await findActiveSessions();
    const config = vscode.workspace.getConfiguration('claudeContextBar');
    const warningThreshold = config.get<number>('warningThreshold', 50);
    const dangerThreshold = config.get<number>('dangerThreshold', 75);
    const contextLimit = config.get<number>('contextLimit', 200000);
    const autoColor = config.get<boolean>('autoColor', true);
    const baseColor = config.get<string>('baseColor', 'White');
    const showEmoji = config.get<boolean>('showEmoji', true);

    // Pastel color palette for auto-coloring
    const pastelPalette = [
        '#a8d8ea', // Soft blue
        '#d4a5a5', // Dusty rose
        '#b5d8c7', // Sage green
        '#e8d5b7', // Warm beige
        '#c9b1ff', // Lavender
        '#ffd6a5', // Peach
        '#caffbf', // Mint
        '#bdb2ff', // Periwinkle
        '#ffc6ff', // Pink
    ];

    // Base color variations (subtle shifts from user's chosen color)
    const baseColorVariations: Record<string, string[]> = {
        'White': ['#ffffff', '#f5f5f5', '#ebebeb', '#e0e0e0', '#d5d5d5'],
        'Blue': ['#a8d8ea', '#9ecfe0', '#94c6d6', '#8abccc', '#80b2c2'],
        'Purple': ['#c9b1ff', '#bfa7f5', '#b59deb', '#ab93e1', '#a189d7'],
        'Cyan': ['#a0e7e5', '#96ddd9', '#8cd3cd', '#82c9c1', '#78bfb5'],
        'Green': ['#b5d8c7', '#abcebd', '#a1c4b3', '#97baa9', '#8db09f'],
        'Yellow': ['#ffeaa7', '#f5e09d', '#ebd693', '#e1cc89', '#d7c27f'],
        'Orange': ['#ffd6a5', '#f5cc9b', '#ebc291', '#e1b887', '#d7ae7d'],
        'Pink': ['#ffc6ff', '#f5bcf5', '#ebb2eb', '#e1a8e1', '#d79ed7'],
    };

    // Track project names to assign consistent colors
    const projectColorMap = new Map<string, string>();
    let colorIndex = 0;

    if (autoColor) {
        // Auto mode: use pastel palette
        for (const session of sessions) {
            if (!projectColorMap.has(session.projectName)) {
                projectColorMap.set(session.projectName, pastelPalette[colorIndex % pastelPalette.length]);
                colorIndex++;
            }
        }
    } else {
        // Manual mode: use variations of the base color
        const variations = baseColorVariations[baseColor] || baseColorVariations['White'];
        for (const session of sessions) {
            if (!projectColorMap.has(session.projectName)) {
                projectColorMap.set(session.projectName, variations[colorIndex % variations.length]);
                colorIndex++;
            }
        }
    }

    // Track which sessions we've seen
    const seenPaths = new Set<string>();

    // Sessions are sorted newest-first, so reverse for oldest-left display
    // For Left alignment: higher priority = further left
    for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        seenPaths.add(session.sessionFile);

        let entry = statusBarItems.get(session.sessionFile);

        if (!entry) {
            // Create new status bar item - Right align, very high priority to appear LEFT of Claude's items
            // Higher priority = further left on right-aligned items
            const priority = 900 + (sessions.length - i); // Very high = leftmost in right section
            const item = vscode.window.createStatusBarItem(
                vscode.StatusBarAlignment.Right,
                priority
            );
            entry = { item, sessionFile: session.sessionFile };
            statusBarItems.set(session.sessionFile, entry);
        }

        // Update the status bar item with fuzzy emoji matching
        const icon = showEmoji ? getEmojiForProject(session.projectName) : '';
        const iconSpace = showEmoji ? ' ' : '';
        entry.item.text = `${icon}${iconSpace}${session.projectName}: ${session.percentage}%`;

        // Set background color based on thresholds
        if (session.percentage >= dangerThreshold) {
            entry.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (session.percentage >= warningThreshold) {
            entry.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            entry.item.backgroundColor = undefined;
        }

        // Set text color from project color map
        entry.item.color = projectColorMap.get(session.projectName) || '#ffffff';

        // Detailed tooltip with full token breakdown and first message
        const firstMsgLine = session.firstMessage ? `💬 *"${session.firstMessage}"*\n\n` : '';
        entry.item.tooltip = new vscode.MarkdownString(
            `**${session.projectName}** (${session.sessionId})\n\n` +
            firstMsgLine +
            `📁 \`${session.projectPath}\`\n\n` +
            `🤖 Model: \`${session.model || 'Unknown'}\`\n\n` +
            `📊 **Context Usage: ${session.percentage}%**\n\n` +
            `| Type | Tokens |\n|------|--------|\n` +
            `| Cache Read | ${formatTokens(session.cacheReadTokens)} |\n` +
            `| Cache Creation | ${formatTokens(session.cacheCreationTokens)} |\n` +
            `| New Input | ${formatTokens(session.inputTokens)} |\n` +
            `| **Total** | **${formatTokens(session.totalTokens)}** / ${formatTokens(session.contextLimit)} |\n\n` +
            `🕐 Last updated: ${session.lastUpdated.toLocaleTimeString()}`
        );

        entry.item.show();
    }

    // Remove status bar items for sessions that are no longer active
    for (const [sessionFile, entry] of statusBarItems) {
        if (!seenPaths.has(sessionFile)) {
            entry.item.dispose();
            statusBarItems.delete(sessionFile);
        }
    }
}
