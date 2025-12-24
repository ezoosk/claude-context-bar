# What's Next - Claude Context Bar

## Current Version: 1.3.0

## Recently Completed (v1.3.0)

### Click to Hide
- Click any status bar item to temporarily hide it
- Hidden sessions auto-reappear when there's new activity (file modified after hide)
- Stored in memory (resets on extension reload)

### Configurable Idle Timeout
- New `idleTimeout` setting (default: 180 seconds / 3 minutes, was hardcoded 5 minutes)
- Range: 10-600 seconds
- Sessions inactive longer than this are automatically filtered out

## Potential Future Features

### Persistent Hidden Sessions
If users want hidden sessions to stay hidden across VS Code restarts, could store in:
- `context.globalState` (per-user, across workspaces)
- `context.workspaceState` (per-workspace)

### Terminal Close Detection
VS Code has `onDidCloseTerminal` but matching terminals to Claude session files is tricky since there's no direct mapping. Current approach (shorter idle timeout) works well enough.

## Technical Notes

- Session files: `~/.claude/projects/{encoded-path}/{session-id}.jsonl`
- No "session ended" marker written by Claude Code
- Hidden sessions tracked in-memory via `hiddenSessions: Map<string, number>`
- Click triggers `claudeContextBar.hideSession` command with session file path

## Decisions

- Project is small scope - no need for full Kanban/task board infrastructure
- Click to hide (VS Code status bar API only supports left-click, no middle-click)
- Default idle timeout: 180 seconds / 3 minutes (was 5 minutes)
