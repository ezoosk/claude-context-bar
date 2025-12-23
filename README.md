# Claude Context Bar

**Real-time context window monitor for Claude Code sessions in VS Code**

## Features

🧠 **Live Context Tracking** — See your Claude Code context usage percentage right in the status bar

⚡ **Per-Tab Monitoring** — Each Claude Code tab gets its own context indicator

🎯 **Fuzzy Emoji Matching** — Icons automatically match your project type based on name keywords:
- 🎵 Music/audio projects
- 🎮 Games
- 🌐 Web/frontend
- 📱 Mobile apps
- 🤖 AI/ML projects
- 🔧 Tools/extensions
- And many more...

🎨 **Auto Color Mode** — Each project automatically gets a unique pastel color for easy identification

🔍 **Smart Context Detection** — Automatically detects your model (Sonnet 4.5 1M vs others) and adjusts the context limit accordingly

⚠️ **Color-Coded Warnings**:
- Normal: Under 50% usage
- Warning (yellow background): 50-75% usage
- Danger (red background): Over 75% usage

📊 **Detailed Tooltips** — Hover to see:
- First message (matches Claude Code tab name)
- Model name
- Cache Read / Cache Creation tokens
- Total context used vs limit
- Last updated time

🔄 **Auto-Refresh** — Updates automatically when sessions change or every 30 seconds

🧹 **Smart Session Detection** — Automatically hides "ghost" sessions when you close tabs or run `/clear`

## Requirements

- VS Code 1.74.0 or later
- [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) extension installed and active

**Install:**
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ezoosk.claude-context-bar)
- [Open VSX Registry](https://open-vsx.org/extension/ezoosk/claude-context-bar) (for Antigravity, VSCodium, etc.)

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeContextBar.showEmoji` | `true` | Show emoji icons based on project name keywords |
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

Sessions inactive for more than 5 minutes are automatically hidden. The extension also detects when sessions have been superseded by newer ones (e.g., after running `/clear` and opening a new tab), hiding ghost sessions immediately.

## License

MIT © 2025 [Ed Zisk](https://github.com/ezoosk)
