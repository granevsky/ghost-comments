import * as vscode from 'vscode';
import { CommentManager } from './commentManager';
import { getConfig } from './configuration';
import { CommentData } from './contracts';
import { t } from './i18n';

export class DecorationManager {
    private decorationType: vscode.TextEditorDecorationType | undefined;
    private commentManager: CommentManager;

    constructor(commentManager: CommentManager) {
        this.commentManager = commentManager;
    }

    public async updateDecorationsAsync(editor: vscode.TextEditor) {
        const config = getConfig();
        const mode = config.displayMode;

        if (mode === 'codelens') {
            this.dispose();
            return;
        }

        if (!this.decorationType) {
            const isRight = mode === 'right';
            this.decorationType = vscode.window.createTextEditorDecorationType({
                isWholeLine: true,
                after: isRight ? { margin: '0 0 0 5px', fontStyle: 'italic' } : undefined,
                before: !isRight ? { margin: '0 5px 0 0', fontWeight: 'italic' } : undefined
            });
        }

        const commentsData = await this.commentManager.loadCommentsAsync(editor.document.uri);
        const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
        const fileComments = commentsData[relativePath];

        if (!fileComments) {
            editor.setDecorations(this.decorationType!, []);
            return;
        }

        const decorations: vscode.DecorationOptions[] = [];

        for (const [originalLineStr, data] of Object.entries(fileComments)) {
            const originalLine = parseInt(originalLineStr);
            const { line: actualLine, isMatch } = this.commentManager.findActualLine(editor.document, originalLine, data.context, config.searchRange);

            if (actualLine < editor.document.lineCount) {
                const label = this.formatCommentText(data, isMatch);
                const range = new vscode.Range(actualLine, 0, actualLine, 0);

                const textColor = config.colors.text
                    ? config.colors.text
                    : new vscode.ThemeColor('editorCodeLens.foreground');

                const errorColor = config.colors.error;
                const isRight = mode === 'right';
                const textDecoration = {
                    contentText: `${isMatch ? '👻:' : '⚠️'} ${label}`,
                    color: isMatch ? textColor : errorColor
                };

                const decoration: vscode.DecorationOptions = {
                    range,
                    renderOptions: {
                        after: isRight ? textDecoration : undefined,
                        before: !isRight ? textDecoration : undefined
                    },
                    hoverMessage: isMatch
                        ? new vscode.MarkdownString(`**${data.author}**\n\n${data.text}`)
                        : new vscode.MarkdownString(t('decoration.broken.hover', data.context))
                };
                decorations.push(decoration);
            }
        }

        editor.setDecorations(this.decorationType!, decorations);
    }

    public formatCommentText(data: CommentData, isMatch: boolean): string {
        const date = new Date(data.updatedAt);
        const dateStr = date.toLocaleDateString();
        let text = `${data.text} • [${data.author}, ${dateStr}]`;
        if (!isMatch) { text = t('decoration.format.broken', text); }
        return text;
    }

    public dispose() {
        if (this.decorationType) {
            this.decorationType.dispose();
            this.decorationType = undefined;
        }
    }
}
