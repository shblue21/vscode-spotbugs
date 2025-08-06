'use strict';

export interface BugInfo {
    type: string;
    rank: number;
    priority: string;
    category: string;
    abbrev: string;
    message: string;
    sourceFile: string;
    startLine: number;
    endLine: number;
}
