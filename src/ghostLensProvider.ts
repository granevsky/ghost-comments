import * as vscode from 'vscode';
import { CommentManager } from './commentManager';
import { getConfig } from './configuration';
import { CommentData } from './contracts';
import { t } from './i18n';

export class GhostLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
    private commentManager: CommentManager;

    constructor(commentManager: CommentManager) {
        this.commentManager = commentManager;
    }

    public refresh(): void { this._onDidChangeCodeLenses.fire(); }

    public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        const commentsData = await this.commentManager.loadCommentsAsync(document.uri);
        const relativePath = vscode.workspace.asRelativePath(document.uri);
        const fileComments = commentsData[relativePath];
        if (!fileComments) { return []; }

        const codeLenses: vscode.CodeLens[] = [];
        const config = getConfig();

        for (const [originalLineStr, data] of Object.entries(fileComments)) {
            const originalLine = parseInt(originalLineStr);
            const { line: actualLine, isMatch } = this.commentManager.findActualLine(document, originalLine, data.context, config.searchRange);

            if (actualLine !== -1) {
                const range = new vscode.Range(actualLine, 0, actualLine, 0);
                const label = this.formatCommentText(data, isMatch);

                codeLenses.push(new vscode.CodeLens(range, {
                    title: t('lens.title', label),
                    tooltip: isMatch ? t('lens.tooltip.match') : t('lens.tooltip.broken'),
                    command: "ghost-comments.addComment",
                    arguments: [actualLine]
                }));
            }
        }
        return codeLenses;
    }

    private formatCommentText(data: CommentData, isMatch: boolean): string {
        const date = new Date(data.updatedAt);
        const dateStr = date.toLocaleDateString();
        let text = `${data.text} • [${data.author}, ${dateStr}]`;
        if (!isMatch) { text = t('decoration.format.broken', text); }
        return text;
    }
}
