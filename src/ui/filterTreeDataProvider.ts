'use strict';

import {
  Event,
  EventEmitter,
  l10n,
  ThemeIcon,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
} from 'vscode';
import * as path from 'path';
import type {
  FilterFileCommandTarget,
  FilterKind,
  FilterPaths,
} from '../model/filterFiles';
import { FILTER_KINDS } from '../model/filterFiles';

class FilterTreeItem extends TreeItem implements FilterFileCommandTarget {
  constructor(
    public readonly filterKind: FilterKind,
    public readonly filterPath?: string,
    count = 0
  ) {
    const isGroup = filterPath === undefined;
    super(
      isGroup ? groupLabel(filterKind) : path.basename(filterPath),
      isGroup ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.None
    );
    if (isGroup) {
      this.description = String(count);
      this.contextValue = 'spotbugs.filter.group';
      this.iconPath = new ThemeIcon('filter');
    } else {
      const directory = path.dirname(filterPath);
      this.description = directory === '.' ? undefined : directory;
      this.tooltip = filterPath;
      this.contextValue = 'spotbugs.filter.file';
      this.iconPath = new ThemeIcon('file-code');
    }
  }
}

export class FilterTreeDataProvider implements TreeDataProvider<FilterTreeItem> {
  private readonly _onDidChangeTreeData = new EventEmitter<
    FilterTreeItem | undefined | null
  >();
  readonly onDidChangeTreeData: Event<FilterTreeItem | undefined | null> =
    this._onDidChangeTreeData.event;

  private paths: FilterPaths;

  constructor(paths: FilterPaths) {
    this.paths = paths;
  }

  getTreeItem(element: FilterTreeItem): TreeItem {
    return element;
  }

  getChildren(element?: FilterTreeItem): FilterTreeItem[] {
    if (!element) {
      return FILTER_KINDS.map(
        (kind) => new FilterTreeItem(kind, undefined, this.paths[kind].length)
      );
    }
    if (element.filterPath === undefined) {
      return this.paths[element.filterKind].map(
        (filterPath) => new FilterTreeItem(element.filterKind, filterPath)
      );
    }
    return [];
  }

  update(paths: FilterPaths): void {
    this.paths = paths;
    this._onDidChangeTreeData.fire(undefined);
  }
}

function groupLabel(kind: FilterKind): string {
  switch (kind) {
    case 'include':
      return l10n.t('Include');
    case 'exclude':
      return l10n.t('Exclude');
    case 'baseline':
      return l10n.t('Baseline bugs');
  }
}
