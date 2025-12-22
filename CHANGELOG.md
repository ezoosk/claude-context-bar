# Changelog

All notable changes to the Claude Context Bar extension will be documented in this file.

## [1.2.0] - 2025-12-22

### Added
- **Smart Session Detection**: Automatically detects and hides "ghost" sessions
  - Sessions are hidden immediately when superseded by a newer session
  - Properly handles `/clear` command scenarios
  - No more lingering status bar items from closed tabs

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
