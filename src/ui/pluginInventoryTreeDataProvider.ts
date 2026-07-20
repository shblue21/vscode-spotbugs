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

class PluginInventoryTreeItem extends TreeItem {
  constructor(label: string, public readonly pluginPath?: string) {
    super(label);
  }
}

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
    const treeItem = new PluginInventoryTreeItem(path.basename(itemPath), item.path);
    const statusLabel = statusDescription(item.status);
    const statusAndId = item.pluginId
      ? `${statusLabel}: ${item.pluginId}`
      : statusLabel;
    const declaredCounts = declaredCountSummary(item);

    treeItem.description = declaredCounts
      ? `${statusAndId} · ${declaredCounts}`
      : statusAndId;
    treeItem.tooltip = tooltip(item);
    treeItem.contextValue = `spotbugs.plugin.${item.status}`;
    treeItem.iconPath = statusIcon(item.status);
    return treeItem;
  }

  private createMessageItem(label: string): TreeItem {
    const item = new PluginInventoryTreeItem(label);
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
  const declaredCounts = declaredCountSummary(item);
  return [
    item.shortDescription,
    item.provider ? l10n.t('Provider: {0}', item.provider) : undefined,
    item.version ? l10n.t('Version: {0}', item.version) : undefined,
    item.website,
    declaredCounts ? l10n.t('Declared: {0}', declaredCounts) : undefined,
    item.path,
    item.canonicalPath && item.canonicalPath !== item.path ? item.canonicalPath : undefined,
    item.errorMessage,
    item.status === 'validated' || item.status === 'duplicate-plugin-id'
      ? l10n.t('Runtime loading was not checked.')
      : undefined,
  ]
    .filter((value): value is string => !!value)
    .join('\n');
}

function declaredCountSummary(item: PluginInventoryItem): string | undefined {
  const counts: string[] = [];
  if (item.detectorCount !== undefined) {
    counts.push(
      item.detectorCount === 1
        ? l10n.t('{0} detector', item.detectorCount)
        : l10n.t('{0} detectors', item.detectorCount)
    );
  }
  if (item.bugPatternCount !== undefined) {
    counts.push(
      item.bugPatternCount === 1
        ? l10n.t('{0} rule', item.bugPatternCount)
        : l10n.t('{0} rules', item.bugPatternCount)
    );
  }
  return counts.length > 0 ? counts.join(' · ') : undefined;
}
