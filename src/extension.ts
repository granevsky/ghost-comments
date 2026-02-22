import * as vscode from 'vscode';
import { CommentManager } from './commentManager';
import { DecorationManager } from './decorationManager';
import { GhostLensProvider } from './ghostLensProvider';
import { CommentsProvider } from './commentsTreeProvider';
import { getConfig } from './configuration';
import { CommentData } from './contracts';
import { initI18n, t } from './i18n';

export { CommentManager, CommentData };
export const commentManagerForTests = new CommentManager();
export const findActualLine = commentManagerForTests.findActualLine.bind(commentManagerForTests);
export const matchContext = commentManagerForTests.matchContext.bind(commentManagerForTests);

const decorationManagerForTests = new DecorationManager(commentManagerForTests);
export const formatCommentText = decorationManagerForTests.formatCommentText.bind(decorationManagerForTests);


let commentManager: CommentManager;
let decorationManager: DecorationManager;
let ghostLensProvider: GhostLensProvider;
let commentsProvider: CommentsProvider;
let codeLensProviderDisposable: vscode.Disposable | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Ghost Comments Active');

    commentManager = new CommentManager();
    decorationManager = new DecorationManager(commentManager);
    commentsProvider = new CommentsProvider(commentManager);

    initI18n(context, getConfig().language);

    vscode.window.registerTreeDataProvider('ghost-comments-view', commentsProvider);

    context.subscriptions.push(commentsProvider, decorationManager);

    await ensureAuthorName();
    await reloadDisplayMode(context);

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('ghost-comments')) {
            if (e.affectsConfiguration('ghost-comments.language')) {
                initI18n(context, getConfig().language);
            }
            await reloadDisplayMode(context);
            refreshView(vscode.window.activeTextEditor);
            commentsProvider.refresh();
        }
    }));

    let cmdDisposable = vscode.commands.registerCommand('ghost-comments.addComment', async (lineArg?: number) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const author = await ensureAuthorName();
        if (!author) { return; }

        const config = getConfig();
        let targetLine = lineArg !== undefined ? lineArg : editor.selection.active.line;

        const allComments = await commentManager.loadCommentsAsync(editor.document.uri);
        const relativePath = vscode.workspace.asRelativePath(editor.document.uri);

        let existingKey: string | undefined;
        let existingData: CommentData | undefined;

        if (allComments[relativePath]) {
            for (const [keyLine, data] of Object.entries(allComments[relativePath])) {
                const { line: actualLine } = commentManager.findActualLine(editor.document, parseInt(keyLine), data.context, config.searchRange);
                if (actualLine === targetLine) {
                    existingKey = keyLine;
                    existingData = data;
                    break;
                }
            }
        }

        const initialValue = existingData ? existingData.text : "";
        const commentText = await vscode.window.showInputBox({
            placeHolder: t('comment.prompt.placeholder'),
            prompt: t('comment.prompt.author', author, existingData ? t('comment.status.edit') : t('comment.status.new')),
            value: initialValue,
            validateInput: (text) => text.length > config.maxLength ? t('comment.limit', config.maxLength.toString()) : null
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

            await commentManager.saveComment(editor.document, targetLine, safeText, author, contextSnapshot);
            refreshView(editor);
            commentsProvider.refresh();
        }
    });

    let syncDisposable = vscode.commands.registerCommand('ghost-comments.syncFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const changed = await commentManager.syncFileComments(editor.document);
            vscode.window.showInformationMessage(changed ? t('sync.success') : t('sync.notNeeded'));
            if (changed) {
                refreshView(editor);
                commentsProvider.refresh();
            }
        }
    });

    let sortAlphaDisposable = vscode.commands.registerCommand('ghost-comments.sortByAlpha', async () => {
        await vscode.workspace.getConfiguration('ghost-comments').update('sortOrder', 'alpha', vscode.ConfigurationTarget.Global);
    });

    let sortDateDisposable = vscode.commands.registerCommand('ghost-comments.sortByDate', async () => {
        await vscode.workspace.getConfiguration('ghost-comments').update('sortOrder', 'date', vscode.ConfigurationTarget.Global);
    });

    let filterDisposable = vscode.commands.registerCommand('ghost-comments.filterComments', async () => {
        const filterText = await vscode.window.showInputBox({
            placeHolder: t('search.placeholder'),
            prompt: t('search.prompt')
        });
        if (filterText !== undefined) {
            commentsProvider.setFilter(filterText);
        }
    });

    let clearFilterDisposable = vscode.commands.registerCommand('ghost-comments.clearFilter', async () => {
        commentsProvider.clearFilter();
    });

    let changeLangDisposable = vscode.commands.registerCommand('ghost-comments.changeLanguage', async () => {
        const langPath = vscode.Uri.joinPath(context.extensionUri, 'lang');
        try {
            const files = await vscode.workspace.fs.readDirectory(langPath);
            const langs = files
                .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.json'))
                .map(([name]) => name.replace('.json', ''));

            langs.unshift('auto');

            const selected = await vscode.window.showQuickPick(langs, {
                placeHolder: t('language.prompt.placeholder')
            });

            if (selected) {
                await vscode.workspace.getConfiguration('ghost-comments').update('language', selected, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(t('language.changed', selected));
                initI18n(context, selected);
                commentsProvider.refresh();
            }
        } catch (e) {
            console.error(e);
        }
    });

    context.subscriptions.push(cmdDisposable, syncDisposable, sortAlphaDisposable, sortDateDisposable, filterDisposable, clearFilterDisposable, changeLangDisposable);

    vscode.window.onDidChangeActiveTextEditor(e => e && refreshView(e), null, context.subscriptions);

    vscode.workspace.onDidSaveTextDocument(async document => {
        const editor = vscode.window.activeTextEditor;
        if (getConfig().autoSync) {
            await commentManager.syncFileComments(document);
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

    vscode.workspace.onDidRenameFiles(async e => {
        for (const file of e.files) {
            await handleFileRename(file.oldUri, file.newUri);
        }
    });
}

async function handleFileRename(oldUri: vscode.Uri, newUri: vscode.Uri) {
    await commentManager.renameFileComments(oldUri, newUri);
    commentsProvider.refresh();
}

function sanitizeInput(input: string): string {
    // eslint-disable-next-line no-control-regex
    return input.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');
}

async function ensureAuthorName(): Promise<string | undefined> {
    const config = getConfig();
    if (config.author && config.author.trim()) { return sanitizeInput(config.author); }
    const author = await vscode.window.showInputBox({ title: t('author.prompt.title'), prompt: t('author.prompt.placeholder'), ignoreFocusOut: true });
    if (author && author.trim()) {
        const safe = sanitizeInput(author);
        await vscode.workspace.getConfiguration('ghost-comments').update('author', safe, vscode.ConfigurationTarget.Global);
        return safe;
    }
    return undefined;
}

async function reloadDisplayMode(context: vscode.ExtensionContext) {
    const config = getConfig();
    const mode = config.displayMode;

    if (codeLensProviderDisposable) {
        codeLensProviderDisposable.dispose();
        codeLensProviderDisposable = undefined;
    }

    decorationManager.dispose();

    if (mode === 'codelens') {
        ghostLensProvider = new GhostLensProvider(commentManager);
        codeLensProviderDisposable = vscode.languages.registerCodeLensProvider({ scheme: 'file', language: '*' }, ghostLensProvider);
        context.subscriptions.push(codeLensProviderDisposable);
    } else {
        if (vscode.window.activeTextEditor) { refreshView(vscode.window.activeTextEditor); }
    }
}

function refreshView(editor?: vscode.TextEditor) {
    if (!editor) { return; }
    const mode = getConfig().displayMode;
    if (mode === 'codelens') {
        if (ghostLensProvider) { ghostLensProvider.refresh(); }
    }
    else {
        decorationManager.updateDecorationsAsync(editor);
    }
}

export function deactivate() { }