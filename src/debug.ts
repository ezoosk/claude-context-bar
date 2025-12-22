/**
 * Debug harness for Claude Context Bar extension
 * 
 * This script replicates the extension's session detection logic and outputs
 * detailed diagnostics to help debug ghost session issues.
 * 
 * Run with: npm run compile && node out/debug.js
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// TYPES (copied from extension.ts)
// ============================================================================

interface TokenUsage {
    inputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalTokens: number;
    model: string;
    firstMessage: string;
    sessionCreated: Date | null;
    wasCleared: boolean;
}

interface SessionInfo {
    projectName: string;
    projectPath: string;
    sessionId: string;
    sessionFile: string;
    totalTokens: number;
    lastUpdated: Date;
    sessionCreated: Date | null;
    wasCleared: boolean;
}

// ============================================================================
// LOGIC (copied from extension.ts - keep in sync!)
// ============================================================================

function getClaudeProjectsDir(): string {
    return path.join(os.homedir(), '.claude', 'projects');
}

async function getLatestTokenCount(jsonlPath: string): Promise<TokenUsage> {
    return new Promise((resolve) => {
        try {
            const stats = fs.statSync(jsonlPath);
            if (stats.size === 0) {
                resolve({ inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, model: '', firstMessage: '', sessionCreated: null, wasCleared: false });
                return;
            }

            const content = fs.readFileSync(jsonlPath, 'utf-8');
            const lines = content.trim().split('\n');

            let lastClearIndex = -1;
            let userMessagesAfterClear = 0;

            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i];
                if (!line.trim()) continue;
                try {
                    const entry = JSON.parse(line);
                    if (entry.type === 'user' && entry.message?.content) {
                        const msgContent = entry.message.content;
                        if (typeof msgContent === 'string' && msgContent.includes('<command-name>/clear</command-name>')) {
                            lastClearIndex = i;
                            break;
                        }
                        userMessagesAfterClear++;
                    }
                } catch (e) {
                    continue;
                }
            }

            const wasCleared = (lastClearIndex !== -1 && userMessagesAfterClear === 0);
            const startIndex = lastClearIndex >= 0 ? lastClearIndex + 1 : 0;

            let firstMessage = '';
            let sessionCreated: Date | null = null;
            let model = '';
            let finalUsage = { inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0 };

            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i];
                if (!line.trim()) continue;
                try {
                    const entry = JSON.parse(line);
                    if (!sessionCreated && entry.timestamp) {
                        sessionCreated = new Date(entry.timestamp);
                    }
                    if (!firstMessage && entry.type === 'user' && entry.message?.content) {
                        const msgContent = entry.message.content;
                        if (typeof msgContent === 'string' &&
                            !msgContent.includes('<command-name>') &&
                            !msgContent.includes('<local-command-') &&
                            !msgContent.includes('Caveat:')) {
                            firstMessage = msgContent.substring(0, 60);
                        }
                    }
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

// ============================================================================
// DEBUG RUNNER
// ============================================================================

async function debugSessions(projectFilter?: string) {
    const claudeDir = getClaudeProjectsDir();
    console.log(`\n========== CLAUDE CONTEXT BAR DEBUG ==========`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Claude dir: ${claudeDir}\n`);

    if (!fs.existsSync(claudeDir)) {
        console.log("Claude projects directory not found!");
        return;
    }

    const cutoffTime = Date.now() - (5 * 60 * 1000);
    const projectDirs = fs.readdirSync(claudeDir);

    // Collect all sessions
    const allSessions: SessionInfo[] = [];

    for (const projectDir of projectDirs) {
        if (projectFilter && !projectDir.includes(projectFilter)) continue;
        if (projectDir.includes('claude-plugins') || projectDir.includes('claude-mem')) continue;

        const projectPath = path.join(claudeDir, projectDir);
        try {
            if (!fs.statSync(projectPath).isDirectory()) continue;
        } catch (e) { continue; }

        const files = fs.readdirSync(projectPath)
            .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
            .map(f => ({
                name: f,
                path: path.join(projectPath, f),
                mtime: fs.statSync(path.join(projectPath, f)).mtime
            }))
            .filter(f => f.mtime.getTime() > cutoffTime)
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

        if (files.length === 0) continue;

        console.log(`\n--- Project: ${projectDir} ---`);
        console.log(`Found ${files.length} active session files\n`);

        for (const file of files) {
            const usage = await getLatestTokenCount(file.path);

            console.log(`  📄 ${file.name.substring(0, 8)}...`);
            console.log(`     Created: ${usage.sessionCreated?.toISOString() || 'unknown'}`);
            console.log(`     LastUpd: ${file.mtime.toISOString()}`);
            console.log(`     Tokens:  ${usage.totalTokens}`);
            console.log(`     Cleared: ${usage.wasCleared}`);
            console.log(`     FirstMsg: "${usage.firstMessage}"`);
            console.log('');

            if (usage.totalTokens > 0) {
                allSessions.push({
                    projectName: projectDir,
                    projectPath: projectPath,
                    sessionId: file.name.replace('.jsonl', '').substring(0, 8),
                    sessionFile: file.path,
                    totalTokens: usage.totalTokens,
                    lastUpdated: file.mtime,
                    sessionCreated: usage.sessionCreated,
                    wasCleared: usage.wasCleared
                });
            }
        }
    }

    // Group by project and apply supersession logic
    console.log(`\n========== SUPERSESSION ANALYSIS ==========\n`);

    const projectGroups = new Map<string, SessionInfo[]>();
    for (const session of allSessions) {
        const base = session.projectName;
        if (!projectGroups.has(base)) {
            projectGroups.set(base, []);
        }
        projectGroups.get(base)!.push(session);
    }

    for (const [baseName, group] of projectGroups) {
        console.log(`Project: ${baseName}`);

        // Sort by creation time (newest first)
        group.sort((a, b) => {
            const aTime = a.sessionCreated?.getTime() || 0;
            const bTime = b.sessionCreated?.getTime() || 0;
            return bTime - aTime;
        });

        for (let i = 0; i < group.length; i++) {
            const session = group[i];
            let status = "✅ SHOW";
            let reason = "";

            if (session.wasCleared) {
                status = "❌ HIDE";
                reason = "wasCleared=true (ended with /clear)";
            } else {
                for (let j = 0; j < i; j++) {
                    const newerSession = group[j];
                    const newerCreated = newerSession.sessionCreated?.getTime() || 0;
                    const thisLastUpdated = session.lastUpdated.getTime();

                    if (newerCreated > thisLastUpdated) {
                        status = "❌ HIDE";
                        reason = `superseded by ${newerSession.sessionId} (newer created after this one's last update)`;
                        break;
                    }
                }
            }

            console.log(`  [${status}] ${session.sessionId}`);
            if (reason) console.log(`      Reason: ${reason}`);
            console.log(`      Created: ${session.sessionCreated?.toISOString()}`);
            console.log(`      LastUpd: ${session.lastUpdated.toISOString()}`);
        }
        console.log('');
    }

    // Summary
    const totalShown = allSessions.filter(s => !s.wasCleared).length;
    console.log(`========== SUMMARY ==========`);
    console.log(`Total sessions found: ${allSessions.length}`);
    console.log(`Would be shown (before supersession): ${totalShown}`);
}

// Run with optional project filter
const projectFilter = process.argv[2] || undefined;
debugSessions(projectFilter);
