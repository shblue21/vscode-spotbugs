"use strict";

import { Event, EventEmitter, TreeDataProvider, TreeItem } from "vscode";
import { BugInfo } from "./bugInfo";
import {
  CategoryGroupItem,
  PatternGroupItem,
  BugInfoItem,
  buildPatternGroupLabel,
} from "./bugTreeItem";

export class SpotbugsTreeDataProvider implements TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: EventEmitter<TreeItem | undefined | null> = new EventEmitter<
    TreeItem | undefined | null
  >();
  readonly onDidChangeTreeData: Event<TreeItem | undefined | null> =
    this._onDidChangeTreeData.event;

  private viewItems: TreeItem[] = [];

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
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  private groupBugsByCategoryAndPattern(bugs: BugInfo[]): {
    [category: string]: { [patternKey: string]: { label: string; bugs: BugInfo[] } };
  } {
    const map: {
      [category: string]: { [patternKey: string]: { label: string; bugs: BugInfo[] } };
    } = {};
    for (const bug of bugs) {
      const category = bug.category || "Uncategorized";
      const patternKey = (bug.abbrev || bug.type || "Unknown").toUpperCase();
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
