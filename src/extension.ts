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
    // Claude encodes paths like: -c-dev-Abletron or -Users-Ed-work-MyApp
    // Convert back to readable path
    let decoded = encodedName;

    // Replace leading dash and subsequent dashes with path separators
    if (decoded.startsWith('-')) {
        decoded = decoded.substring(1);
    }

    // Split by dashes, but be smart about drive letters on Windows
    const parts = decoded.split('-');
    let fullPath: string;

    if (parts.length > 0 && parts[0].length === 1 && /[a-zA-Z]/.test(parts[0])) {
        // Windows path: first part is drive letter
        fullPath = parts[0].toUpperCase() + ':\\' + parts.slice(1).join('\\');
    } else {
        // Unix path
        fullPath = '/' + parts.join('/');
    }

    // Get just the project folder name (last segment)
    const projectName = parts[parts.length - 1] || 'Unknown';

    return { name: projectName, fullPath };
}

interface TokenUsage {
    inputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalTokens: number;
    model: string;
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

async function getLatestTokenCount(jsonlPath: string): Promise<TokenUsage> {
    return new Promise((resolve) => {
        try {
            const stats = fs.statSync(jsonlPath);
            if (stats.size === 0) {
                resolve({ inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, model: '' });
                return;
            }

            // Read the file and get the last line with input_tokens
            const content = fs.readFileSync(jsonlPath, 'utf-8');
            const lines = content.trim().split('\n').reverse();

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const entry = JSON.parse(line);
                    // Look for usage in message.usage (Claude API response format)
                    const usage = entry.message?.usage || entry.usage;
                    const model = entry.message?.model || '';
                    if (usage) {
                        const inputTokens = usage.input_tokens || 0;
                        const cacheRead = usage.cache_read_input_tokens || 0;
                        const cacheCreation = usage.cache_creation_input_tokens || 0;
                        // Total context = all input tokens combined
                        resolve({
                            inputTokens,
                            cacheReadTokens: cacheRead,
                            cacheCreationTokens: cacheCreation,
                            totalTokens: inputTokens + cacheRead + cacheCreation,
                            model
                        });
                        return;
                    }
                } catch (e) {
                    // Skip invalid JSON lines
                    continue;
                }
            }
            resolve({ inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, model: '' });
        } catch (e) {
            resolve({ inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, model: '' });
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
                        contextLimit: sessionContextLimit
                    });
                }
            }
        }
    } catch (e) {
        console.error('Error scanning Claude projects:', e);
    }

    // Sort by most recently active and limit to top 5
    return sessions.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime()).slice(0, 5);
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

        // Update the status bar item
        const icon = '🧠';
        entry.item.text = `${icon} ${session.projectName}: ${session.percentage}%`;

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

        // Detailed tooltip with full token breakdown
        entry.item.tooltip = new vscode.MarkdownString(
            `**${session.projectName}** (${session.sessionId})\n\n` +
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
