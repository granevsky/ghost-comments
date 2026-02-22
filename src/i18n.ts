import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let currentTranslations: Record<string, string> = {};

export function initI18n(context: vscode.ExtensionContext, configLanguage: string) {
    let lang = configLanguage === 'auto' ? vscode.env.language : configLanguage;

    const langPath = path.join(context.extensionPath, 'lang', `${lang}.json`);
    let targetPath = langPath;

    if (!fs.existsSync(langPath)) {
        const baseLang = lang.split('-')[0];
        const baseLangPath = path.join(context.extensionPath, 'lang', `${baseLang}.json`);
        if (fs.existsSync(baseLangPath)) {
            targetPath = baseLangPath;
        } else {
            targetPath = path.join(context.extensionPath, 'lang', 'en.json');
        }
    }

    try {
        if (fs.existsSync(targetPath)) {
            const fileContent = fs.readFileSync(targetPath, 'utf8');
            currentTranslations = JSON.parse(fileContent);
        } else {
            currentTranslations = {};
        }
    } catch (e) {
        console.error('Ghost Comments: Failed to load translations:', e);
        currentTranslations = {};
    }
}

export function t(key: string, ...args: string[]): string {
    let text = currentTranslations[key] || key;
    args.forEach((arg, index) => {
        text = text.replace(`{${index}}`, arg);
    });
    return text;
}
