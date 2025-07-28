'use strict';

import { Event, EventEmitter, TreeDataProvider, TreeItem } from 'vscode';
import { BugInfo } from './bugInfo';
import { PriorityGroupItem, BugInfoItem } from './bugTreeItem';

export class SpotbugsTreeDataProvider implements TreeDataProvider<TreeItem> {

    private _onDidChangeTreeData: EventEmitter<TreeItem | undefined | null> = new EventEmitter<TreeItem | undefined | null>();
    readonly onDidChangeTreeData: Event<TreeItem | undefined | null> = this._onDidChangeTreeData.event;

    private viewItems: TreeItem[] = [];

    constructor() {
        this.showInitialMessage();
    }

    getTreeItem(element: TreeItem): TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        if (element instanceof PriorityGroupItem) {
            return Promise.resolve(element.bugs.map(bug => new BugInfoItem(bug)));
        }
        return Promise.resolve(this.viewItems);
    }

    public showInitialMessage(): void {
        this.viewItems = [new TreeItem("Ready to analyze. Click the search icon to start.")];
        this._onDidChangeTreeData.fire(undefined);
    }

    public showLoading(): void {
        this.viewItems = [new TreeItem("Analyzing...")];
        this._onDidChangeTreeData.fire(undefined);
    }

    public showResults(bugs: BugInfo[]): void {
        if (!bugs || bugs.length === 0) {
            this.viewItems = [new TreeItem("No issues found.")];
        } else {
            const groupedByPriority = this.groupBugsByPriority(bugs);
            this.viewItems = Object.keys(groupedByPriority).map(priority => {
                return new PriorityGroupItem(priority, groupedByPriority[priority]);
            });
        }
        this._onDidChangeTreeData.fire(undefined);
    }

    private groupBugsByPriority(bugs: BugInfo[]): { [key: string]: BugInfo[] } {
        const groups: { [key: string]: BugInfo[] } = {};
        bugs.forEach(bug => {
            const priority = bug.priority || 'Unknown';
            if (!groups[priority]) {
                groups[priority] = [];
            }
            groups[priority].push(bug);
        });
        return groups;
    }
}