import * as vscode from 'vscode';
import * as path from 'path';
import { CommentManager } from './commentManager';
import { CommentData } from './contracts';
import { getConfig } from './configuration';
import { t } from './i18n';

export class CommentsProvider implements vscode.TreeDataProvider<CommentItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CommentItem | undefined | void> = new vscode.EventEmitter<CommentItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<CommentItem | undefined | void> = this._onDidChangeTreeData.event;

    private filterString: string = '';

    constructor(private commentManager: CommentManager) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setFilter(filter: string) {
        this.filterString = filter.toLowerCase();
        vscode.commands.executeCommand('setContext', 'ghost-comments:isFiltered', !!this.filterString);
        this.refresh();
    }

    clearFilter() {
        this.filterString = '';
        vscode.commands.executeCommand('setContext', 'ghost-comments:isFiltered', false);
        this.refresh();
    }

    getTreeItem(element: CommentItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CommentItem): Promise<CommentItem[]> {
        if (!element) {
            return this.getFiles();
        } else if (element.contextValue === 'file') {
            return this.getCommentsForFile(element);
        }
        return [];
    }

    private async getFiles(): Promise<CommentItem[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { return []; }

        const folder = workspaceFolders[0];
        const commentsData = await this.commentManager.loadCommentsAsync(folder.uri);

        const items: CommentItem[] = [];
        for (const relativePath of Object.keys(commentsData)) {
            const fileComments = commentsData[relativePath];
            if (Object.keys(fileComments).length > 0) {
                if (this.filterString) {
                    const pathMatches = relativePath.toLowerCase().includes(this.filterString);
                    const commentMatches = Object.values(fileComments).some(data => data.text.toLowerCase().includes(this.filterString));
                    if (!pathMatches && !commentMatches) {
                        continue;
                    }
                }
                items.push(new CommentItem(relativePath, vscode.TreeItemCollapsibleState.Expanded, 'file', undefined, undefined, folder.uri));
            }
        }
        const config = getConfig();
        if (config.sortOrder === 'date') {
            const statPromises = items.map(async item => {
                try {
                    const stat = await vscode.workspace.fs.stat(item.resourceUri!);
                    return { item, mtime: stat.mtime };
                } catch {
                    return { item, mtime: 0 };
                }
            });
            const stats = await Promise.all(statPromises);
            stats.sort((a, b) => b.mtime - a.mtime);
            return stats.map(s => s.item);
        } else {
            return items.sort((a, b) => (a.label as string).localeCompare(b.label as string));
        }
    }

    private async getCommentsForFile(fileItem: CommentItem): Promise<CommentItem[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { return []; }
        const folder = workspaceFolders[0];
 
        const commentsData = await this.commentManager.loadCommentsAsync(folder.uri);
        const relativePath = fileItem.label as string;
        const fileComments = commentsData[relativePath];

        if (!fileComments) { return []; }

        const items: CommentItem[] = [];

        const openDoc = vscode.workspace.textDocuments.find(d => vscode.workspace.asRelativePath(d.uri) === relativePath);
        const config = getConfig();

        for (const [originalLineStr, data] of Object.entries(fileComments)) {
            let line = parseInt(originalLineStr);
            let isMatch = true;

            if (this.filterString && !data.text.toLowerCase().includes(this.filterString) && !relativePath.toLowerCase().includes(this.filterString)) {
                continue;
            }

            if (openDoc) {
                const result = this.commentManager.findActualLine(openDoc, line, data.context, config.searchRange);
                line = result.line;
                isMatch = result.isMatch;
            }

            items.push(new CommentItem(
                data.text,
                vscode.TreeItemCollapsibleState.None,
                'comment',
                { line, isMatch, data },
                undefined,
                folder.uri,
                relativePath
            ));
        }

        return items.sort((a, b) => (a.command?.arguments?.[0] || 0) - (b.command?.arguments?.[0] || 0));
    }

    dispose() {
        this._onDidChangeTreeData.dispose();
    }
}

class CommentItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly commentInfo?: { line: number, isMatch: boolean, data: CommentData },
        public readonly resourceUri?: vscode.Uri,
        public readonly rootUri?: vscode.Uri,
        public readonly relativePath?: string
    ) {
        super(label, collapsibleState);

        if (contextValue === 'file') {
            this.resourceUri = vscode.Uri.joinPath(rootUri!, label);
            this.iconPath = vscode.ThemeIcon.File;
            this.tooltip = label;
        } else {
            const { line, isMatch, data } = commentInfo!;
            this.description = `[${t('tree.line', (line + 1).toString())}] ${data.author}`;
            this.tooltip = new vscode.MarkdownString(`**${data.author}**\n\n${data.text}\n\n\`${t('tree.line', (line + 1).toString())}\``);
            this.iconPath = isMatch ? new vscode.ThemeIcon('comment') : new vscode.ThemeIcon('warning');

            this.command = {
                command: 'vscode.open',
                title: t('tree.openFile'),
                arguments: [
                    vscode.Uri.joinPath(rootUri!, relativePath!),
                    { selection: new vscode.Range(line, 0, line, 0) }
                ]
            };
        }
    }
}
