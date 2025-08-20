import { TreeItem, TreeItemCollapsibleState, ThemeIcon, Command } from 'vscode';
import { BugInfo } from './bugInfo';
import { SpotBugsCommands } from './constants/commands';

export class PriorityGroupItem extends TreeItem {
    public bugs: BugInfo[];

    constructor(priority: string, bugs: BugInfo[]) {
        super(`${priority} Priority`, TreeItemCollapsibleState.Expanded);
        this.bugs = bugs;
        this.iconPath = new ThemeIcon('tag');
    }
}

export class BugInfoItem extends TreeItem {
    public bug: BugInfo;

    constructor(bug: BugInfo) {
        const label = `[${bug.rank}] ${bug.message}`;
        super(label, TreeItemCollapsibleState.None);
        this.bug = bug;
        const filePath = bug.fullPath || bug.realSourcePath || bug.sourceFile;
        this.tooltip = `File: ${filePath}\nLine: ${bug.startLine}-${bug.endLine}\nType: ${bug.type}\nPriority: ${bug.priority}\nCategory: ${bug.category}`;
        this.iconPath = new ThemeIcon('bug');
        
        // Set command to navigate to source file when clicked
        this.command = {
            command: SpotBugsCommands.OPEN_BUG_LOCATION,
            title: 'Open Bug Location',
            arguments: [bug]
        };
    }
}