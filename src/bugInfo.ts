'use strict';

export interface BugInfo {
    type: string;
    rank: number;
    priority: string;
    message: string;
    sourceFile: string;
    startLine: number;
    endLine: number;
}
