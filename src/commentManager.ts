import * as vscode from 'vscode';
import { CommentData, FileComments } from './contracts';
import { getConfig } from './configuration';

export class CommentManager {
    private fileLock: Promise<void> = Promise.resolve();

    private async acquireLock(): Promise<() => void> {
        let unlockNext!: () => void;
        const nextLock = new Promise<void>(resolve => unlockNext = resolve);
        const currentLock = this.fileLock;
        this.fileLock = currentLock.then(() => nextLock);
        await currentLock;
        return unlockNext;
    }

    public async loadCommentsAsync(resourceUri: vscode.Uri): Promise<FileComments> {
        const fileUri = await this.getCommentsFileUri(resourceUri);
        if (!fileUri) { return {}; }
        try {
            const stat = await vscode.workspace.fs.stat(fileUri);
            if (stat.size > getConfig().maxFileSize) { return {}; }
            const arr = await vscode.workspace.fs.readFile(fileUri);
            return JSON.parse(new TextDecoder().decode(arr));
        } catch (e: any) {
            if (e.code === 'FileNotFound' || e.name === 'EntryNotFound (FileSystemError)') {
                return {};
            }
            vscode.window.showErrorMessage(`Ghost Comments: Failed to parse the comments file. Error: ${e.message}`);
            throw e;
        }
    }

    public async saveComment(document: vscode.TextDocument, line: number, text: string, author: string, contextSnapshot: string) {
        const fileUri = await this.getCommentsFileUri(document.uri);
        if (!fileUri) { return; }

        const unlock = await this.acquireLock();
        try {
            const comments = await this.loadCommentsAsync(document.uri);
            const relativePath = vscode.workspace.asRelativePath(document.uri);

            if (!comments[relativePath]) { comments[relativePath] = {}; }

            if (text === "") {
                delete comments[relativePath][line];
                if (Object.keys(comments[relativePath]).length === 0) { delete comments[relativePath]; }
            } else {
                comments[relativePath][line] = {
                    text: text,
                    author: author,
                    updatedAt: Date.now(),
                    context: contextSnapshot
                };
            }

            await this.writeCommentsFile(fileUri, comments);
        } finally {
            unlock();
        }
    }

    private async writeCommentsFile(fileUri: vscode.Uri, comments: FileComments) {
        const content = JSON.stringify(comments, null, 2);
        await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));
    }

    public async getCommentsFileUri(resourceUri: vscode.Uri): Promise<vscode.Uri | undefined> {
        const ws = vscode.workspace.getWorkspaceFolder(resourceUri);
        if (!ws) { return undefined; }

        const filename = getConfig().filename;
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            vscode.window.showErrorMessage(`Ghost Comments: Invalid filename configuration: "${filename}". Using subdirectories is not supported for security reasons.`);
            return undefined;
        }

        return vscode.Uri.joinPath(ws.uri, filename);
    }

    public async renameFileComments(oldUri: vscode.Uri, newUri: vscode.Uri) {
        const fileUri = await this.getCommentsFileUri(oldUri);
        if (!fileUri) { return; }

        const unlock = await this.acquireLock();
        try {
            const commentsData = await this.loadCommentsAsync(oldUri);
            const oldRelativePath = vscode.workspace.asRelativePath(oldUri, false);
            const newRelativePath = vscode.workspace.asRelativePath(newUri, false);

            if (commentsData[oldRelativePath]) {
                commentsData[newRelativePath] = commentsData[oldRelativePath];
                delete commentsData[oldRelativePath];
                await this.writeCommentsFile(fileUri, commentsData);
            }
        } finally {
            unlock();
        }
    }

    public async syncFileComments(document: vscode.TextDocument): Promise<boolean> {
        const config = getConfig();

        const unlock = await this.acquireLock();
        try {
            const commentsData = await this.loadCommentsAsync(document.uri);
            const relativePath = vscode.workspace.asRelativePath(document.uri);
            const fileComments = commentsData[relativePath];

            if (!fileComments) { return false; }

            let updatedCount = 0;
            const newFileComments: { [lineNumber: string]: CommentData } = {};

            for (const [originalLineStr, data] of Object.entries(fileComments)) {
                const originalLine = parseInt(originalLineStr);
                const { line: actualLine, isMatch } = this.findActualLine(document, originalLine, data.context, config.searchRange);

                if (isMatch && actualLine !== originalLine) { updatedCount++; }
                const targetLine = isMatch ? actualLine : originalLine;
                newFileComments[targetLine.toString()] = data;
            }

            if (updatedCount > 0) {
                commentsData[relativePath] = newFileComments;
                const fileUri = await this.getCommentsFileUri(document.uri);
                if (fileUri) {
                    await this.writeCommentsFile(fileUri, commentsData);
                    return true;
                }
            }
            return false;
        } finally {
            unlock();
        }
    }

    public findActualLine(document: vscode.TextDocument, originalLine: number, contextSnapshot: string, range: number): { line: number, isMatch: boolean } {
        if (!contextSnapshot) { return { line: originalLine, isMatch: true }; }

        if (originalLine < document.lineCount) {
            if (this.matchContext(this.getContextAtLine(document, originalLine, contextSnapshot), contextSnapshot)) {
                return { line: originalLine, isMatch: true };
            }
        }

        let startLine = 0;
        let endLine = document.lineCount - 1;

        if (range > 0) {
            startLine = Math.max(0, originalLine - range);
            endLine = Math.min(document.lineCount - 1, originalLine + range);
        }

        for (let i = startLine; i <= endLine; i++) {
            if (i === originalLine) { continue; }
            if (this.matchContext(this.getContextAtLine(document, i, contextSnapshot), contextSnapshot)) {
                return { line: i, isMatch: true };
            }
        }

        return { line: originalLine, isMatch: false };
    }

    public getContextAtLine(document: vscode.TextDocument, line: number, snapshot: string): string {
        const snapshotLinesCount = snapshot.split('\n').length;
        if (line + snapshotLinesCount > document.lineCount) { return ""; }
        const range = new vscode.Range(line, 0, line + snapshotLinesCount - 1, document.lineAt(line + snapshotLinesCount - 1).text.length);
        return document.getText(range).trim();
    }

    public matchContext(textA: string, textB: string): boolean {
        const normA = textA.replace(/\s/g, '');
        const normB = textB.replace(/\s/g, '');
        return normA.includes(normB);
    }
}
