# Change Log

All notable changes to the "Ghost Comments" extension will be documented in this file.

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
