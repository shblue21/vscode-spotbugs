import { TreeItem, TreeItemCollapsibleState, ThemeIcon } from 'vscode';
import { BugInfo } from './bugInfo';

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
        this.tooltip = `File: ${bug.sourceFile}\nLine: ${bug.startLine}\nType: ${bug.type}`;
        this.iconPath = new ThemeIcon('bug');
    }
}