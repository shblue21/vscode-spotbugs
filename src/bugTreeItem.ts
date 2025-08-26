import { TreeItem, TreeItemCollapsibleState, ThemeIcon } from 'vscode';
import { BugInfo } from './bugInfo';
import { SpotBugsCommands } from './constants/commands';
import * as path from 'path';

export class PriorityGroupItem extends TreeItem {
    public bugs: BugInfo[];

    constructor(priority: string, bugs: BugInfo[]) {
        super(`${priority} Priority (${bugs.length})`, TreeItemCollapsibleState.Expanded);
        this.bugs = bugs;
        this.iconPath = new ThemeIcon('tag');
    }
}

export class BugInfoItem extends TreeItem {
    public bug: BugInfo;

    constructor(bug: BugInfo) {
        const label = buildReadableLabel(bug);
        super(label, TreeItemCollapsibleState.None);
        this.bug = bug;
        const filePath = bug.fullPath || bug.realSourcePath || bug.sourceFile;
        const fileName = filePath ? path.basename(filePath) : 'Unknown file';
        const lineInfo = bug.startLine && bug.endLine ? (bug.startLine === bug.endLine ? `${bug.startLine}` : `${bug.startLine}-${bug.endLine}`) : '';
        this.description = `${fileName}${lineInfo ? `:${lineInfo}` : ''} • ${bug.category}`;
        this.tooltip = `Pattern: ${bug.abbrev || bug.type}\nCategory: ${bug.category}\nPriority: ${bug.priority}\nFile: ${filePath}${lineInfo ? `\nLine: ${lineInfo}` : ''}`;
        this.iconPath = severityIcon(bug);
        
        // Set command to navigate to source file when clicked
        this.command = {
            command: SpotBugsCommands.OPEN_BUG_LOCATION,
            title: 'Open Bug Location',
            arguments: [bug]
        };
    }
}

function buildReadableLabel(bug: BugInfo): string {
    const pattern = bug.abbrev || bug.type || 'Bug';
    const raw = bug.message || '';

    // Remove leading "PATTERN: " prefix if duplicated in message
    let msg = raw.trim();
    const prefix = `${pattern}:`;
    if (msg.toUpperCase().startsWith(prefix.toUpperCase())) {
        msg = msg.substring(prefix.length).trim();
    }

    // Trim trailing context like " in com.foo.Bar.method(...)" to keep it concise
    const inIdx = msg.indexOf(' in ');
    if (inIdx > 0) {
        msg = msg.substring(0, inIdx).trim();
    }

    // Fallback if message is empty
    if (!msg) {
        msg = bug.type || 'SpotBugs finding';
    }

    return `[${pattern}] ${msg}`;
}

function severityIcon(bug: BugInfo): ThemeIcon {
    const rank = typeof bug.rank === 'number' ? bug.rank : 20;
    if (rank <= 4) {
        return new ThemeIcon('error');
    }
    if (rank <= 9) {
        return new ThemeIcon('warning');
    }
    return new ThemeIcon('info');
}
