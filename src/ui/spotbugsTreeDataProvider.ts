'use strict';

import { Event, EventEmitter, TreeDataProvider, TreeItem, Uri } from 'vscode';
import { Bug } from '../model/bug';
import {
  CategoryGroupItem,
  PatternGroupItem,
  BugItem,
  ProjectStatusItem,
} from './bugTreeItem';
import * as path from 'path';
import { groupBugsByCategoryAndPattern } from './treeModel';

export class SpotBugsTreeDataProvider implements TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: EventEmitter<TreeItem | undefined | null> =
    new EventEmitter<TreeItem | undefined | null>();
  readonly onDidChangeTreeData: Event<TreeItem | undefined | null> =
    this._onDidChangeTreeData.event;

  private viewItems: TreeItem[] = [];
  private projectItems: Map<string, ProjectStatusItem> = new Map();
  private lastResults: Bug[] = [];

  constructor() {
    this.showInitialMessage();
  }

  getTreeItem(element: TreeItem): TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    if (element instanceof CategoryGroupItem) {
      return Promise.resolve(element.patterns);
    }
    if (element instanceof PatternGroupItem) {
      return Promise.resolve(element.bugs.map((bug) => new BugItem(bug)));
    }
    return Promise.resolve(this.viewItems);
  }

  public showInitialMessage(): void {
    this.viewItems = [new TreeItem('Ready to analyze. Click the search icon to start.')];
    this.lastResults = [];
    this._onDidChangeTreeData.fire(undefined);
  }

  public showLoading(): void {
    this.viewItems = [new TreeItem('Analyzing...')];
    this.lastResults = [];
    this._onDidChangeTreeData.fire(undefined);
  }

  public showWorkspaceProgress(projectUris: string[]): void {
    this.projectItems.clear();
    const items: ProjectStatusItem[] = [];
    for (const uriString of projectUris) {
      const label = this.toDisplayName(uriString);
      const item = new ProjectStatusItem(uriString, label);
      items.push(item);
      this.projectItems.set(uriString, item);
    }
    this.viewItems = items;
    this.lastResults = [];
    this._onDidChangeTreeData.fire(undefined);
  }

  public updateProjectStatus(
    uriString: string,
    status: 'pending' | 'running' | 'done' | 'failed',
    extra?: { count?: number; error?: string }
  ): void {
    const item = this.projectItems.get(uriString);
    if (item) {
      item.setStatus(status, extra);
      this._onDidChangeTreeData.fire(item);
    }
  }

  private toDisplayName(uriString: string): string {
    try {
      const u = Uri.parse(uriString);
      return path.basename(u.fsPath) || uriString;
    } catch {
      return uriString;
    }
  }

  public showResults(bugs: Bug[]): void {
    if (!bugs || bugs.length === 0) {
      this.viewItems = [new TreeItem('No issues found.')];
      this.lastResults = [];
    } else {
      const categories = groupBugsByCategoryAndPattern(bugs);
      this.viewItems = categories.map((category) => {
        const patterns = category.patterns.map(
          (pattern) => new PatternGroupItem(pattern.label, pattern.bugs)
        );
        return new CategoryGroupItem(category.name, patterns, category.total);
      });
      this.lastResults = bugs.slice();
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  public getAllFindings(): Bug[] {
    return this.lastResults.slice();
  }

  public getFindingsForNode(element: TreeItem): Bug[] {
    if (element instanceof CategoryGroupItem) {
      return element.patterns.flatMap((pattern) => pattern.bugs.slice());
    }
    if (element instanceof PatternGroupItem) {
      return element.bugs.slice();
    }
    if (element instanceof BugItem) {
      return [element.bug];
    }
    return [];
  }

}
