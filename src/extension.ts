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
}

async function getLatestTokenCount(jsonlPath: string): Promise<TokenUsage> {
    return new Promise((resolve) => {
        try {
            const stats = fs.statSync(jsonlPath);
            if (stats.size === 0) {
                resolve({ inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0 });
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
                    if (usage) {
                        const inputTokens = usage.input_tokens || 0;
                        const cacheRead = usage.cache_read_input_tokens || 0;
                        const cacheCreation = usage.cache_creation_input_tokens || 0;
                        // Total context = all input tokens combined
                        resolve({
                            inputTokens,
                            cacheReadTokens: cacheRead,
                            cacheCreationTokens: cacheCreation,
                            totalTokens: inputTokens + cacheRead + cacheCreation
                        });
                        return;
                    }
                } catch (e) {
                    // Skip invalid JSON lines
                    continue;
                }
            }
            resolve({ inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0 });
        } catch (e) {
            resolve({ inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0 });
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
                    sessions.push({
                        projectName: name,
                        projectPath: fullPath,
                        sessionId,
                        sessionFile: file.path,
                        inputTokens: usage.inputTokens,
                        cacheReadTokens: usage.cacheReadTokens,
                        cacheCreationTokens: usage.cacheCreationTokens,
                        totalTokens: usage.totalTokens,
                        percentage: Math.round((usage.totalTokens / contextLimit) * 100),
                        lastUpdated: file.mtime
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

        // Detailed tooltip with full token breakdown
        entry.item.tooltip = new vscode.MarkdownString(
            `**${session.projectName}** (${session.sessionId})\n\n` +
            `📁 \`${session.projectPath}\`\n\n` +
            `📊 **Context Usage: ${session.percentage}%**\n\n` +
            `| Type | Tokens |\n|------|--------|\n` +
            `| Cache Read | ${formatTokens(session.cacheReadTokens)} |\n` +
            `| Cache Creation | ${formatTokens(session.cacheCreationTokens)} |\n` +
            `| New Input | ${formatTokens(session.inputTokens)} |\n` +
            `| **Total** | **${formatTokens(session.totalTokens)}** / ${formatTokens(contextLimit)} |\n\n` +
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
