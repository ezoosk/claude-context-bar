# Changelog

All notable changes to the Claude Context Bar extension will be documented in this file.

## [1.4.1] - 2025-12-29

### Fixed
- Added compact mode documentation to README

## [1.4.0] - 2025-12-29

### Added
- **Compact Mode**: Shorten project names to save status bar space
  - Multi-word names become acronyms (my-cool-project → MCP)
  - Single words become abbreviated (typescript → Tscript)
  - Names 5 characters or less stay unchanged
  - Session numbers preserved (MCP-2, MCP-3)
- **Custom Short Names**: Define your own abbreviations via `shortNames` setting
- **Instant Settings Refresh**: All settings now apply immediately without waiting for next refresh cycle

## [1.3.0] - 2025-12-24

### Added
- **Click to Hide**: Click any status bar item to temporarily hide it
  - Hidden sessions automatically reappear when there's new activity
  - Great for dismissing stale sessions you're not actively using
- **Configurable Idle Timeout**: New `idleTimeout` setting (default: 180 seconds / 3 minutes)
  - Sessions inactive longer than this are automatically hidden
  - Reduced from previous hardcoded 5 minutes
  - Range: 10-600 seconds

### Fixed
- **Project Name Display**: Fixed deeply nested paths showing full folder chain
  - Now correctly shows last 3 path segments (e.g., "claude-context-bar" instead of "Tools-extensions-vscode-claude-context-bar")

## [1.2.2] - 2025-12-23

### Fixed
- Documentation updates

## [1.2.1] - 2025-12-23

### Fixed
- **Project Name Display**: Fixed issue where parent folder (e.g., "dev") was incorrectly included in project names
  - Now correctly shows "my-project" instead of "dev-my-project"
- **Tooltip Cleanup**: Removed confusing "New Input" row (always showed ~8 tokens)

## [1.2.0] - 2025-12-22

### Added
- **Smart Session Detection**: Automatically detects and hides "ghost" sessions
  - Sessions are hidden immediately when superseded by a newer session
  - Properly handles `/clear` command scenarios
  - No more lingering status bar items from closed tabs
- **First Message in Tooltip**: Shows the first message of each session to help identify which Claude Code tab it corresponds to

### Fixed
- Ghost sessions no longer appear after running `/clear` and continuing work
- Improved session lifecycle tracking using creation timestamps

## [1.1.3] - 2025-12-22

### Added
- **Fuzzy Emoji Matching**: Icons automatically match project type based on name keywords
  - Music projects (🎵), games (🎮), web (🌐), mobile (📱), AI (🤖), and more
- `showEmoji` setting to toggle emoji display on/off (default: on)

## [1.1.2] - 2025-12-22

### Added
- Now available on [Open VSX Registry](https://open-vsx.org/extension/ezoosk/claude-context-bar) for Antigravity, VSCodium, and other VS Code forks
- Automated dual-publishing to both VS Code Marketplace and Open VSX

## [1.1.0] - 2025-12-22

### Added
- **Auto Color Mode**: Pastel color palette assigns different colors to each project automatically
- **Base Color Selection**: When auto-color is off, choose a base color with subtle variations per project
- **Auto Context Limit Detection**: Automatically detects model (Sonnet 4.5 1M vs others) and adjusts context limit
- Model name now displayed in tooltip

### Changed
- Color palette changed to softer pastel colors for better readability

## [1.0.0] - 2025-12-22

### Added
- Real-time context window usage monitoring for Claude Code sessions
- Status bar indicators for each active Claude Code tab
- Color-coded warnings: yellow at 50%, red at 75%
- Detailed tooltip with token breakdown (cache read, cache creation, new input)
- Configurable context limit, thresholds, and refresh interval
- Auto-refresh on file changes and periodic polling
- Automatic cleanup of stale sessions (5-minute timeout)
- Excludes Claude Memory background processes from display
