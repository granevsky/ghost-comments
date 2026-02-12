import * as assert from 'assert';
import * as vscode from 'vscode';
import { findActualLine, matchContext, formatCommentText, CommentData } from '../../extension';

suite('Core Logic Tests', () => {

    test('matchContext - should match identical strings', () => {
        assert.strictEqual(matchContext('const a = 1;', 'const a = 1;'), true);
    });

    test('matchContext - should ignore whitespace differences', () => {
        assert.strictEqual(matchContext('const a = 1;', 'const   a=1;'), true);
        assert.strictEqual(matchContext('  return ', 'return'), true);
    });

    test('matchContext - should fail on different content', () => {
        assert.strictEqual(matchContext('const a = 1;', 'const b = 1;'), false);
    });

    test('formatCommentText - formats correctly', () => {
        const data: CommentData = {
            text: 'Hello world',
            author: 'Tester',
            updatedAt: 1625097600000, 
            context: 'code'
        };
        const result = formatCommentText(data, true);
        assert.ok(result.includes('Hello world'));
        assert.ok(result.includes('Tester'));
    });

    test('formatCommentText - indicates broken link', () => {
        const data: CommentData = {
            text: 'Fix logic',
            author: 'Dev',
            updatedAt: 1625097600000,
            context: 'old code'
        };
        const result = formatCommentText(data, false);
        assert.ok(result.includes('(BROKEN LINK)'));
        assert.ok(result.includes('Fix logic'));
    });

    test('findActualLine - exact match', () => {
        const doc = new MockTextDocument("line1\nline2\nline3");
        // @ts-ignore
        const result = findActualLine(doc, 1, "line2", 5);
        assert.strictEqual(result.line, 1);
        assert.strictEqual(result.isMatch, true);
    });

     test('findActualLine - code moved down', () => {
        const doc = new MockTextDocument("line1\ninserted\nline2\nline3");
        // Original line was 1 (line2), now at 2
        // @ts-ignore
        const result = findActualLine(doc, 1, "line2", 5);
        assert.strictEqual(result.line, 2);
        assert.strictEqual(result.isMatch, true);
    });

    test('findActualLine - code moved up', () => {
        const doc = new MockTextDocument("line2\nline3");
        // Original line was 1 (line2) in "line1\nline2...", now at 0
        // @ts-ignore
        const result = findActualLine(doc, 1, "line2", 5);
        assert.strictEqual(result.line, 0);
        assert.strictEqual(result.isMatch, true);
    });
    
    test('findActualLine - context lost', () => {
        const doc = new MockTextDocument("lineA\nlineB");
        // @ts-ignore
        const result = findActualLine(doc, 0, "lineZ", 5);
        assert.strictEqual(result.line, 0); // Returns original line
        assert.strictEqual(result.isMatch, false);
    });
});

class MockTextDocument {
    lines: string[];
    lineCount: number;

    constructor(content: string) {
        this.lines = content.split('\n');
        this.lineCount = this.lines.length;
    }

    lineAt(line: number) {
        if (line < 0 || line >= this.lineCount) {
            throw new Error('Invalid line');
        }
        return new MockTextLine(this.lines[line], line);
    }

    getText(range: vscode.Range) {
        if (!range) {
            return this.lines.join('\n');
        }
        
        const startLine = range.start.line;
        const endLine = range.end.line;
        
        let text = "";
        for (let i = startLine; i <= endLine; i++) {
             let lineText = this.lines[i];
             text += lineText + (i < endLine ? "\n" : "");
        }
        return text;
    }
}

class MockTextLine {
    text: string;
    lineNumber: number;
    
    constructor(text: string, lineNumber: number) {
        this.text = text;
        this.lineNumber = lineNumber;
    }
}
