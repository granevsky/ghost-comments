import * as vscode from 'vscode';
import * as path from 'path';

export interface CommentData {
    text: string;
    author: string;
    updatedAt: number;
    context: string;
}

interface FileComments {
    [relativePath: string]: { [lineNumber: string]: CommentData };
}

function getConfig() {
    const config = vscode.workspace.getConfiguration('ghost-comments');
    return {
        filename: config.get<string>('filename') || '.ghost-comments.json',
        maxFileSize: config.get<number>('maxFileSize') || 5242880,
        maxLength: config.get<number>('maxCommentLength') || 500,
        author: config.get<string>('author'),
        displayMode: config.get<string>('displayMode') || 'right',
        searchRange: config.get<number>('searchRange') ?? 15,
        autoSync: config.get<boolean>('autoSyncOnSave') || false,
        colors: {
            text: config.get<string>('colors.textColor') || '#6a9953',
            error: config.get<string>('colors.errorColor') || '#ff9900'
        }
    };
}

let decorationType: vscode.TextEditorDecorationType | undefined;
let codeLensProviderDisposable: vscode.Disposable | undefined;
let ghostLensProvider: GhostLensProvider | undefined;

class GhostLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    public refresh(): void { this._onDidChangeCodeLenses.fire(); }

    public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        const commentsData = await loadCommentsAsync(document.uri);
        const relativePath = vscode.workspace.asRelativePath(document.uri);
        const fileComments = commentsData[relativePath];
        if (!fileComments) { return []; }

        const codeLenses: vscode.CodeLens[] = [];
        const config = getConfig();

        for (const [originalLineStr, data] of Object.entries(fileComments)) {
            const originalLine = parseInt(originalLineStr);
            const { line: actualLine, isMatch } = findActualLine(document, originalLine, data.context, config.searchRange);

            if (actualLine !== -1) {
                const range = new vscode.Range(actualLine, 0, actualLine, 0);
                const label = formatCommentText(data, isMatch);
                
                codeLenses.push(new vscode.CodeLens(range, {
                    title: `👻: ${label}`,
                    tooltip: isMatch ? "Изменить комментарий" : "Код был изменен или не найден (⚠️)",
                    command: "ghost-comments.addComment",
                    arguments: [actualLine]
                }));
            }
        }
        return codeLenses;
    }
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('Ghost Comments Active');

    await ensureAuthorName();
    await reloadDisplayMode(context);

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('ghost-comments')) {
            await reloadDisplayMode(context);
        }
    }));

    let cmdDisposable = vscode.commands.registerCommand('ghost-comments.addComment', async (lineArg?: number) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const author = await ensureAuthorName();
        if (!author) { return; }

        const config = getConfig();
        let targetLine = lineArg !== undefined ? lineArg : editor.selection.active.line;
        
        const allComments = await loadCommentsAsync(editor.document.uri);
        const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
        
        let existingKey: string | undefined;
        let existingData: CommentData | undefined;

        if (allComments[relativePath]) {
            for (const [keyLine, data] of Object.entries(allComments[relativePath])) {
                const { line: actualLine } = findActualLine(editor.document, parseInt(keyLine), data.context, config.searchRange);
                if (actualLine === targetLine) {
                    existingKey = keyLine;
                    existingData = data;
                    break;
                }
            }
        }

        const initialValue = existingData ? existingData.text : "";
        const commentText = await vscode.window.showInputBox({
            placeHolder: 'Ваш комментарий...',
            prompt: `Автор: ${author}. ${existingData ? '(Редактирование)' : '(Новый)'}`,
            value: initialValue,
            validateInput: (text) => text.length > config.maxLength ? `Лимит ${config.maxLength}` : null
        });

        if (commentText !== undefined) {
            const safeText = sanitizeInput(commentText);
            
            let contextSnapshot = "";
            if (!editor.selection.isEmpty) {
                contextSnapshot = editor.document.getText(editor.selection);
            } else {
                contextSnapshot = editor.document.lineAt(targetLine).text;
            }
            contextSnapshot = contextSnapshot.trim();

            if (existingKey && parseInt(existingKey) !== targetLine) {
                 delete allComments[relativePath][existingKey];
            }

            await saveComment(editor.document, targetLine, safeText, author, contextSnapshot, allComments);
            refreshView(editor);
        }
    });

    let syncDisposable = vscode.commands.registerCommand('ghost-comments.syncFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const changed = await syncFileComments(editor.document);
            vscode.window.showInformationMessage(changed ? 'Комментарии синхронизированы.' : 'Синхронизация не требуется.');
            if (changed) { refreshView(editor); }
        }
    });

    context.subscriptions.push(cmdDisposable, syncDisposable);

    vscode.window.onDidChangeActiveTextEditor(e => e && refreshView(e), null, context.subscriptions);
    
    vscode.workspace.onDidSaveTextDocument(async document => {
        const editor = vscode.window.activeTextEditor;
        if (getConfig().autoSync) {
            await syncFileComments(document);
        }
        if (editor && editor.document === document) {
            refreshView(editor);
        }
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeTextDocument(e => {
        if (vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) {
            refreshView(vscode.window.activeTextEditor);
        }
    }, null, context.subscriptions);
}


export function findActualLine(document: vscode.TextDocument, originalLine: number, contextSnapshot: string, range: number): { line: number, isMatch: boolean } {
    if (!contextSnapshot) { return { line: originalLine, isMatch: true }; }

    if (originalLine < document.lineCount) {
        if (matchContext(getContextAtLine(document, originalLine, contextSnapshot), contextSnapshot)) {
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
        if (matchContext(getContextAtLine(document, i, contextSnapshot), contextSnapshot)) {
            return { line: i, isMatch: true };
        }
    }

    return { line: originalLine, isMatch: false };
}

function getContextAtLine(document: vscode.TextDocument, line: number, snapshot: string): string {
    const snapshotLinesCount = snapshot.split('\n').length;
    if (line + snapshotLinesCount > document.lineCount) { return ""; }
    const range = new vscode.Range(line, 0, line + snapshotLinesCount - 1, document.lineAt(line + snapshotLinesCount - 1).text.length);
    return document.getText(range).trim();
}

export function matchContext(textA: string, textB: string): boolean {
    return textA.replace(/\s/g, '') === textB.replace(/\s/g, '');
}

async function updateDecorationsAsync(editor: vscode.TextEditor, mode: string) {
    if (!decorationType) { return; }
    const config = getConfig();

    const commentsData = await loadCommentsAsync(editor.document.uri);
    const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
    const fileComments = commentsData[relativePath];

    if (!fileComments) {
        editor.setDecorations(decorationType, []);
        return;
    }

    const decorations: vscode.DecorationOptions[] = [];

    for (const [originalLineStr, data] of Object.entries(fileComments)) {
        const originalLine = parseInt(originalLineStr);
        const { line: actualLine, isMatch } = findActualLine(editor.document, originalLine, data.context, config.searchRange);

        if (actualLine < editor.document.lineCount) {
            const label = formatCommentText(data, isMatch);
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
                    : new vscode.MarkdownString(`⚠️ **Контекст потерян**\n\nКод изменен.\n\n\`\`\`\n${data.context}\n\`\`\``)
            };
            decorations.push(decoration);
        }
    }
    
    if (vscode.window.activeTextEditor === editor) {
        editor.setDecorations(decorationType, decorations);
    }
}

async function syncFileComments(document: vscode.TextDocument): Promise<boolean> {
    const config = getConfig();
    const commentsData = await loadCommentsAsync(document.uri);
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    const fileComments = commentsData[relativePath];

    if (!fileComments) { return false; }

    let updatedCount = 0;
    const newFileComments: { [lineNumber: string]: CommentData } = {};

    for (const [originalLineStr, data] of Object.entries(fileComments)) {
        const originalLine = parseInt(originalLineStr);
        const { line: actualLine, isMatch } = findActualLine(document, originalLine, data.context, config.searchRange);

        if (isMatch && actualLine !== originalLine) { updatedCount++; }
        const targetLine = isMatch ? actualLine : originalLine;
        newFileComments[targetLine.toString()] = data;
    }

    if (updatedCount > 0) {
        commentsData[relativePath] = newFileComments;
        const fileUri = getCommentsFileUri(document.uri);
        if (fileUri) {
            const content = JSON.stringify(commentsData, null, 2);
            await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));
            return true;
        }
    }
    return false;
}

function sanitizeInput(input: string): string {
    // eslint-disable-next-line no-control-regex
    return input.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');
}

async function ensureAuthorName(): Promise<string | undefined> {
    const config = getConfig();
    if (config.author && config.author.trim()) { return sanitizeInput(config.author); }
    const author = await vscode.window.showInputBox({ title: "Настройка", prompt: "Введите имя автора", ignoreFocusOut: true });
    if (author && author.trim()) {
        const safe = sanitizeInput(author);
        await vscode.workspace.getConfiguration('ghost-comments').update('author', safe, vscode.ConfigurationTarget.Global);
        return safe;
    }
    return undefined;
}

function getCommentsFileUri(resourceUri: vscode.Uri): vscode.Uri | undefined {
    const ws = vscode.workspace.getWorkspaceFolder(resourceUri);
    return ws ? vscode.Uri.joinPath(ws.uri, getConfig().filename) : undefined;
}

async function loadCommentsAsync(resourceUri: vscode.Uri): Promise<FileComments> {
    const fileUri = getCommentsFileUri(resourceUri);
    if (!fileUri) { return {}; }
    try {
        const stat = await vscode.workspace.fs.stat(fileUri);
        if (stat.size > getConfig().maxFileSize) { return {}; }
        const arr = await vscode.workspace.fs.readFile(fileUri);
        return JSON.parse(new TextDecoder().decode(arr));
    } catch { return {}; }
}

async function saveComment(document: vscode.TextDocument, line: number, text: string, author: string, contextSnapshot: string, existingCommentsInfo?: FileComments) {
    const fileUri = getCommentsFileUri(document.uri);
    if (!fileUri) { return; }

    const comments = existingCommentsInfo || await loadCommentsAsync(document.uri);
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
    const content = JSON.stringify(comments, null, 2);
    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));
}

async function reloadDisplayMode(context: vscode.ExtensionContext) {
    const config = getConfig();
    const mode = config.displayMode;

    if (decorationType) { decorationType.dispose(); decorationType = undefined; }
    if (codeLensProviderDisposable) { codeLensProviderDisposable.dispose(); codeLensProviderDisposable = undefined; ghostLensProvider = undefined; }

    if (mode === 'codelens') {
        ghostLensProvider = new GhostLensProvider();
        codeLensProviderDisposable = vscode.languages.registerCodeLensProvider({ scheme: 'file', language: '*' }, ghostLensProvider);
        context.subscriptions.push(codeLensProviderDisposable);
    } else {
        const isRight = mode === 'right';
        
        decorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            after: isRight ? { margin: '0 0 0 5px', fontStyle: 'italic' } : undefined,
            before: !isRight ? { margin: '0 5px 0 0', fontWeight: 'italic' } : undefined
        });
        if (vscode.window.activeTextEditor) { refreshView(vscode.window.activeTextEditor); }
    }
}

function refreshView(editor: vscode.TextEditor) {
    const mode = getConfig().displayMode;
    if (mode === 'codelens') { ghostLensProvider?.refresh(); }
    else { updateDecorationsAsync(editor, mode); }
}

export function formatCommentText(data: CommentData, isMatch: boolean): string {
    const date = new Date(data.updatedAt);
    const dateStr = date.toLocaleDateString();
    let text = `${data.text} • [${data.author}, ${dateStr}]`;
    if (!isMatch) { text = `(BROKEN LINK) ${text}`; }
    return text;
}

export function deactivate() {}