export interface CommentData {
    text: string;
    author: string;
    updatedAt: number;
    context: string;
}

export interface FileComments {
    [relativePath: string]: { [lineNumber: string]: CommentData };
}
