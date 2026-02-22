import * as vscode from 'vscode';

export interface ExtensionConfig {
    filename: string;
    maxFileSize: number;
    maxLength: number;
    author: string | undefined;
    displayMode: string;
    searchRange: number;
    autoSync: boolean;
    showCommentManager: boolean;
    sortOrder: 'alpha' | 'date';
    language: string;
    colors: {
        text: string;
        error: string;
    };
}

export function getConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration('ghost-comments');
    return {
        filename: config.get<string>('filename') || '.ghost-comments.json',
        maxFileSize: config.get<number>('maxFileSize') || 5242880,
        maxLength: config.get<number>('maxCommentLength') || 500,
        author: config.get<string>('author'),
        displayMode: config.get<string>('displayMode') || 'right',
        searchRange: config.get<number>('searchRange') ?? 15,
        autoSync: config.get<boolean>('autoSyncOnSave') || false,
        showCommentManager: config.get<boolean>('showCommentManager') ?? true,
        sortOrder: config.get<'alpha' | 'date'>('sortOrder') || 'alpha',
        language: config.get<string>('language') || 'auto',
        colors: {
            text: config.get<string>('colors.textColor') || '#6a9953',
            error: config.get<string>('colors.errorColor') || '#ff9900'
        }
    };
}
