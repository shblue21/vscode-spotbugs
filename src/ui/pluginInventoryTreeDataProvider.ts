'use strict';

import {
  Event,
  EventEmitter,
  ThemeIcon,
  TreeDataProvider,
  TreeItem,
  l10n,
} from 'vscode';
import * as path from 'path';
import type {
  PluginInventoryItem,
  PluginInventoryResult,
  PluginInventoryStatus,
} from '../services/pluginInventoryService';

export class PluginInventoryTreeDataProvider implements TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: EventEmitter<TreeItem | undefined | null> =
    new EventEmitter<TreeItem | undefined | null>();
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
    return Promise.resolve(element ? [] : this.viewItems);
  }

  public showInitialMessage(): void {
    this.viewItems = [
      this.createMessageItem(
        l10n.t('Refresh to inspect configured SpotBugs plugin jars.')
      ),
    ];
    this._onDidChangeTreeData.fire(undefined);
  }

  public showLoading(): void {
    this.viewItems = [this.createMessageItem(l10n.t('Inspecting SpotBugs plugin jars...'))];
    this._onDidChangeTreeData.fire(undefined);
  }

  public showInventory(result: PluginInventoryResult): void {
    if (result.items.length === 0) {
      this.viewItems = [
        this.createMessageItem(l10n.t('No SpotBugs plugin jars configured.')),
      ];
    } else {
      this.viewItems = result.items.map((item) => this.createPluginItem(item));
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  private createPluginItem(item: PluginInventoryItem): TreeItem {
    const itemPath = item.path || item.canonicalPath || l10n.t('Plugin {0}', item.index + 1);
    const treeItem = new TreeItem(path.basename(itemPath));
    const statusLabel = statusDescription(item.status);

    treeItem.description = item.pluginId
      ? `${statusLabel}: ${item.pluginId}`
      : statusLabel;
    treeItem.tooltip = tooltip(item);
    treeItem.contextValue = `spotbugs.plugin.${item.status}`;
    treeItem.iconPath = statusIcon(item.status);
    return treeItem;
  }

  private createMessageItem(label: string): TreeItem {
    const item = new TreeItem(label);
    item.contextValue = 'spotbugs.plugin.message';
    return item;
  }
}

function statusDescription(status: PluginInventoryStatus): string {
  switch (status) {
    case 'validated':
      return l10n.t('Validated');
    case 'duplicate-plugin-id':
      return l10n.t('Duplicate plugin id');
    case 'validation-failed':
      return l10n.t('Validation failed');
    case 'backend-error':
      return l10n.t('Backend error');
  }
}

function statusIcon(status: PluginInventoryStatus): ThemeIcon {
  switch (status) {
    case 'validated':
      return new ThemeIcon('pass');
    case 'duplicate-plugin-id':
      return new ThemeIcon('warning');
    case 'validation-failed':
    case 'backend-error':
      return new ThemeIcon('error');
  }
}

function tooltip(item: PluginInventoryItem): string {
  return [
    item.path,
    item.canonicalPath && item.canonicalPath !== item.path ? item.canonicalPath : undefined,
    item.errorMessage,
  ]
    .filter((value): value is string => !!value)
    .join('\n');
}
