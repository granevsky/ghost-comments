# Change Log

All notable changes to the "Ghost Comments" extension will be documented in this file.

## [1.1.0] - 2026-02-22

**Massive Feature and Stability Update!**

### Added
- **Comment Manager**: A dedicated sidebar Tree View panel allowing you to see all localized comments grouped by files at a glance.
- **Sorting & Filtering**: Quickly filter comments globally by author, text, or filename. Sort comments alphabetically or by modification date.
- **Internationalization (i18n)**: Out of the box English and Russian UI support for settings, commands, and inner dialogs/tooltips.
- **Dynamic Language Selection**: Added command `Ghost Comments: Change Language` to switch language strings safely on the fly without restarting your IDE.
- **Toggle Visibility**: Added `ghost-comments.showCommentManager` setting to hide the sidebar if you prefer a minimalist workspace.

### Fixed
- **VS Code File Renaming Bug**: Fixed issue where comments lose their bindings when renaming a source file in the IDE Explorer. Comments now migrate automatically.
- **Security - Path Traversal**: Patched a vulnerability where configuring out-of-bounds `ghost-comments.filename` could write files outside the workspace.
- **Security - Race Conditions**: Implemented asynchronous lock-safety in the `CommentManager` file-saving layer to completely avoid data wipeout on race conditions.
- **JSON Safety**: Hardened parsing logic to gracefully catch corruption or permission errors in `.ghost-comments.json` rather than wiping out user data.
- **Memory Management**: Fixed global resource memory leaks during extension deactivation events.

## [1.0.1] - 2026-02-13

### Fixed
- **Context Validation**: Improved comment validation logic. Comments created with a partial selection (e.g., a single word) are now correctly identified as valid if that text exists within the line. Previously, they were marked as "broken context".

## [1.0.0] - 2026-02-06

### Added
- **Core Functionality**: Ability to add comments to any line of code without modifying the file content.
- **Smart Context Search**: Comments track their code context even if lines are moved or inserted above.
- **Storage**: JSON-based storage (`.ghost-comments.json`) in the project root for easy Git sharing.
- **Display Modes**:
  - `right`: Comments shown at the end of the line.
  - `left`: Comments shown as a gutter badge (hover to read).
  - `codelens`: Comments shown above the code line (CodeLens).
- **Commands**:
  - `Ghost Comments: Add/Edit Note` (`Ctrl+Alt+C` / `Cmd+Alt+C`)
  - `Ghost Comments: Sync Line Numbers`
- **Configuration**:
  - Customizable comment color.
  - Configurable search range for moved code.
  - Auto-sync on save option.
  - Author name signature.
