'use strict';

import { Event, EventEmitter, TreeDataProvider, TreeItem, Uri } from 'vscode';
import { BugInfo } from '../models/bugInfo';
import {
  CategoryGroupItem,
  PatternGroupItem,
  BugInfoItem,
  buildPatternGroupLabel,
  ProjectStatusItem,
} from './bugTreeItem';
import * as path from 'path';

export class SpotbugsTreeDataProvider implements TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: EventEmitter<TreeItem | undefined | null> =
    new EventEmitter<TreeItem | undefined | null>();
  readonly onDidChangeTreeData: Event<TreeItem | undefined | null> =
    this._onDidChangeTreeData.event;

  private viewItems: TreeItem[] = [];
  private projectItems: Map<string, ProjectStatusItem> = new Map();
  private lastResults: BugInfo[] = [];

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
      return Promise.resolve(element.bugs.map((bug) => new BugInfoItem(bug)));
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

  public showResults(bugs: BugInfo[]): void {
    if (!bugs || bugs.length === 0) {
      this.viewItems = [new TreeItem('No issues found.')];
      this.lastResults = [];
    } else {
      const categoryMap = this.groupBugsByCategoryAndPattern(bugs);
      const categories = Object.keys(categoryMap).sort();
      this.viewItems = categories.map((category) => {
        const patterns = Object.keys(categoryMap[category])
          .sort()
          .map((patternKey) => {
            const entry = categoryMap[category][patternKey];
            return new PatternGroupItem(entry.label, entry.bugs);
          });
        const total = patterns.reduce((acc, p) => acc + p.bugs.length, 0);
        return new CategoryGroupItem(category, patterns, total);
      });
      this.lastResults = bugs.slice();
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  public getAllFindings(): BugInfo[] {
    return this.lastResults.slice();
  }

  public getFindingsForNode(element: TreeItem): BugInfo[] {
    if (element instanceof CategoryGroupItem) {
      return element.patterns.flatMap((pattern) => pattern.bugs.slice());
    }
    if (element instanceof PatternGroupItem) {
      return element.bugs.slice();
    }
    if (element instanceof BugInfoItem) {
      return [element.bug];
    }
    return [];
  }

  private groupBugsByCategoryAndPattern(bugs: BugInfo[]): {
    [category: string]: { [patternKey: string]: { label: string; bugs: BugInfo[] } };
  } {
    const map: {
      [category: string]: { [patternKey: string]: { label: string; bugs: BugInfo[] } };
    } = {};
    for (const bug of bugs) {
      const category = bug.category || 'Uncategorized';
      const patternKey = (bug.abbrev || bug.type || 'Unknown').toUpperCase();
      if (!map[category]) {
        map[category] = {};
      }
      if (!map[category][patternKey]) {
        map[category][patternKey] = { label: buildPatternGroupLabel(bug), bugs: [] };
      }
      map[category][patternKey].bugs.push(bug);
    }
    return map;
  }
}
