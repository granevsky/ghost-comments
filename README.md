# Ghost Comments 👻

**Ghost Comments** allows you to leave notes, reviews, or reminders directly in your code without modifying the source file itself. Comments are stored in a separate JSON file, keeping your production code clean while enabling team collaboration via Git.

## Key Features

*   **Non-intrusive**: Comments are not part of your source code files. They "float" near the code.
*   **Git Friendly**: All comments are stored in `.ghost-comments.json`. Commit this file to share notes with your team.
*   **Smart Context Search**: If you add lines above a comment or move a function, the comment follows the code! The extension remembers the code context, not just the line number.
*   **Multiple Display Modes**: Choose how you want to see comments (Right, Left, or CodeLens).
*   **Customizable**: Configure colors, authors, and behavior.

## How to Use

1.  **Add a Comment**: 
    *   Place your cursor on a line of code.
    *   Press `Ctrl+Alt+C` (Windows/Linux) or `Cmd+Alt+C` (Mac).
    *   (Or use the command palette: `Ghost Comments: Add/Edit Note`).
    *   Enter your text.
2.  **View Comments**: Comments appear automatically in the editor.
3.  **Edit**: Just run the "Add Comment" command again on a line with an existing comment.
4.  **Delete**: Clear the text in the input box to delete the comment.

## Smart Context & Sync

Ghost Comments remembers the code snippet where you left a comment.
*   **Moved Code**: If code moves (e.g., you insert new lines), the comment will visually "jump" to the correct line automatically.
*   **Sync**: To permanently update the `.ghost-comments.json` file with the new line numbers, run the command `Ghost Comments: Sync Line Numbers` or enable `ghost-comments.autoSyncOnSave`.
*   **Broken Context**: If the code line is drastically changed or deleted, the comment will be marked as "broken" (⚠️), letting you know the context is lost.

## Extension Settings

This extension contributes the following settings:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `ghost-comments.displayMode` | `"right"` | How comments are shown: `"right"` (end of line), `"left"` (gutter badge), or `"codelens"` (above the line). |
| `ghost-comments.author` | `""` | Your name/nickname. Will be asked on first use. |
| `ghost-comments.filename` | `".ghost-comments.json"` | Name of the file where comments are stored. |
| `ghost-comments.autoSyncOnSave`| `false` | Automatically update line numbers in the JSON file when you save a source file. (Note: This creates changes in file for git). |
| `ghost-comments.searchRange` | `15` | How far (in lines) to search up/down if code has moved. `0` searches the whole file. |
| `ghost-comments.colors.textColor`| `#6a9953` | Color of the comment text. |
| `ghost-comments.colors.errorColor`| `#ff9900` | Color used when the original code context cannot be found. |

## Commands

*   `Ghost Comments: Add/Edit Note` (`ctrl+alt+c` / `cmd+alt+c`): Open input box to add or modify a comment.
*   `Ghost Comments: Sync Line Numbers`: Scans the current file and updates the stored line numbers in `.ghost-comments.json` to match the current code positions.

## Team Collaboration

To share comments with your team:
1.  Make sure `.ghost-comments.json` is **NOT** invalid in your `.gitignore` (unless you want private notes).
2.  Commit the JSON file along with your code changes.
3.  Your teammates will see your comments when they pull the changes (and have the extension installed).

## Known Issues
*   Renaming a source file will detach comments associated with the old filename. You need to manually rename the key in `.ghost-comments.json`.

---
**Enjoy clearer code reviews!**
