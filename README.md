# Claude Context Bar

**Real-time context window monitor for Claude Code sessions in VS Code**

## Features

🧠 **Live Context Tracking** — See your Claude Code context usage percentage right in the status bar

⚡ **Per-Tab Monitoring** — Each Claude Code tab gets its own context indicator

🎨 **Auto Color Mode** — Each project automatically gets a unique pastel color for easy identification

🔍 **Smart Context Detection** — Automatically detects your model (Sonnet 4.5 1M vs others) and adjusts the context limit accordingly

⚠️ **Color-Coded Warnings**:
- Normal: Under 50% usage
- Warning (yellow background): 50-75% usage
- Danger (red background): Over 75% usage

📊 **Detailed Tooltips** — Hover to see:
- Model name
- Cache Read / Cache Creation / New Input tokens
- Total context used vs limit
- Last updated time

🔄 **Auto-Refresh** — Updates automatically when sessions change or every 30 seconds

## Requirements

- VS Code 1.74.0 or later
- [Claude Code](https://claude.ai/code) extension installed and active

**[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=ezoosk.claude-context-bar)**

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeContextBar.autoColor` | `true` | Automatically assign unique pastel colors to each project |
| `claudeContextBar.baseColor` | `White` | Base color when Auto Color is off (subtle variations per project) |
| `claudeContextBar.contextLimit` | `200000` | Fallback context limit (auto-detected for most models) |
| `claudeContextBar.warningThreshold` | `50` | Percentage for yellow warning |
| `claudeContextBar.dangerThreshold` | `75` | Percentage for red danger |
| `claudeContextBar.refreshInterval` | `30` | Refresh interval in seconds |

## How It Works

The extension reads Claude Code's session files from `~/.claude/projects/` and calculates token usage from the JSONL logs. It automatically detects which model you're using and adjusts the context limit:

- **Claude Sonnet 4.5 1M**: 1,000,000 tokens
- **All other models** (Sonnet 4.5, Opus 4.5, Haiku): 200,000 tokens

Sessions inactive for more than 5 minutes are automatically hidden.

## License

MIT © [Ed Zisk](https://github.com/ezoosk)
