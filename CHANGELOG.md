# Changelog

All notable changes to the Claude Context Bar extension will be documented in this file.

## [1.1.0] - 2024-12-22

### Added
- **Auto Color Mode**: Pastel color palette assigns different colors to each project automatically
- **Base Color Selection**: When auto-color is off, choose a base color with subtle variations per project
- **Auto Context Limit Detection**: Automatically detects model (Sonnet 4.5 1M vs others) and adjusts context limit
- Model name now displayed in tooltip

### Changed
- Color palette changed to softer pastel colors for better readability

## [1.0.0] - 2024-12-22

### Added
- Real-time context window usage monitoring for Claude Code sessions
- Status bar indicators for each active Claude Code tab
- Color-coded warnings: yellow at 50%, red at 75%
- Detailed tooltip with token breakdown (cache read, cache creation, new input)
- Configurable context limit, thresholds, and refresh interval
- Auto-refresh on file changes and periodic polling
- Automatic cleanup of stale sessions (5-minute timeout)
- Excludes Claude Memory background processes from display
