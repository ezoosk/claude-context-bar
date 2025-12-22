# Claude Context Bar

**Real-time context window monitor for Claude Code sessions in VS Code**

## Features

🧠 **Live Context Tracking** — See your Claude Code context usage percentage right in the status bar

⚡ **Per-Tab Monitoring** — Each Claude Code tab gets its own context indicator

🎨 **Color-Coded Warnings**:
- Normal (green): Under 50% usage
- Warning (yellow): 50-75% usage
- Danger (red): Over 75% usage

📊 **Detailed Tooltips** — Hover to see token breakdown:
- Cache Read tokens
- Cache Creation tokens
- New Input tokens
- Total context used

🔄 **Auto-Refresh** — Updates automatically when sessions change or every 30 seconds

## Requirements

- VS Code 1.74.0 or later
- [Claude Code](https://claude.ai/code) extension installed and active
- Install Extension(https://marketplace.visualstudio.com/items?itemName%3Dezoosk.claude-context-bar)

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeContextBar.contextLimit` | `200000` | Maximum context window size in tokens |
| `claudeContextBar.warningThreshold` | `50` | Percentage for yellow warning |
| `claudeContextBar.dangerThreshold` | `75` | Percentage for red danger |
| `claudeContextBar.refreshInterval` | `30` | Refresh interval in seconds |

## How It Works

The extension reads Claude Code's session files from `~/.claude/projects/` and calculates token usage from the JSONL logs. Sessions inactive for more than 5 minutes are automatically hidden.

## License

MIT © [Ed Zisk](https://github.com/ezoosk)
