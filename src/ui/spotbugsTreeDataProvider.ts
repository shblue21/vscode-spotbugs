'use strict';

import {
  Event,
  EventEmitter,
  ThemeIcon,
  TreeDataProvider,
  TreeItem,
  Uri,
  l10n,
} from 'vscode';
import { Finding } from '../model/finding';
import {
  CategoryGroupItem,
  PatternGroupItem,
  FindingItem,
  GenericGroupItem,
  type ProjectStatus,
  ProjectStatusItem,
} from './findingTreeItem';
import * as path from 'path';
import type { ProjectResult } from '../services/projectResult';
import { NO_CLASS_TARGETS_CODE } from '../workspace/analysisTargetCodes';
import {
  applyFindingFilters,
  type FindingFilterKind,
  type FindingFilterOption,
  type FindingFilterState,
  getFindingFilterOptions,
} from './findingFilters';
import { describeLocalizedFindingFilters } from './findingFilterPresentation';
import type { FindingGroupKind } from './findingFacets';
import {
  buildResultView,
  type FindingResultGroup,
  type FindingResultNode,
  type FindingSortKind,
} from './resultViewModel';

export class SpotBugsTreeDataProvider implements TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: EventEmitter<TreeItem | undefined | null> =
    new EventEmitter<TreeItem | undefined | null>();
  readonly onDidChangeTreeData: Event<TreeItem | undefined | null> =
    this._onDidChangeTreeData.event;

  private viewItems: TreeItem[] = [];
  private projectItems: Map<string, ProjectStatusItem> = new Map();
  private workspaceStatusItems: ProjectStatusItem[] = [];
  private cachedResults: Finding[] = [];
  private visibleResults: Finding[] = [];
  private activeFilters: FindingFilterState = {};
  private searchQuery = '';
  private groupBy: FindingGroupKind = 'category';
  private sortBy: FindingSortKind = 'severityRank';

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
      return Promise.resolve(
        element.findings.map((finding) => new FindingItem(finding))
      );
    }
    if (element instanceof GenericGroupItem) {
      return Promise.resolve(element.children);
    }
    return Promise.resolve(this.viewItems);
  }

  public showInitialMessage(): void {
    this.projectItems.clear();
    this.workspaceStatusItems = [];
    this.cachedResults = [];
    this.visibleResults = [];
    this.resetExplorationState();
    this.viewItems = [
      this.createMessageItem(l10n.t('Ready to analyze. Click the bug icon to start.')),
    ];
    this._onDidChangeTreeData.fire(undefined);
  }

  public showLoading(): void {
    this.projectItems.clear();
    this.workspaceStatusItems = [];
    this.cachedResults = [];
    this.visibleResults = [];
    this.clearTransientViewState();
    this.viewItems = [this.createMessageItem(l10n.t('Analyzing...'))];
    this._onDidChangeTreeData.fire(undefined);
  }

  public showAnalysisFailure(message: string, code?: string): void {
    this.projectItems.clear();
    this.workspaceStatusItems = [];
    this.cachedResults = [];
    this.visibleResults = [];
    this.clearTransientViewState();
    this.viewItems = [
      this.createMessageItem(message, code, 'spotbugs.message.error', new ThemeIcon('error')),
    ];
    this._onDidChangeTreeData.fire(undefined);
  }

  public showWorkspaceProgress(projectUris: string[]): void {
    this.projectItems.clear();
    this.workspaceStatusItems = [];
    const items: ProjectStatusItem[] = [];
    for (const uriString of projectUris) {
      const label = this.toDisplayName(uriString);
      const item = new ProjectStatusItem(uriString, label);
      items.push(item);
      this.projectItems.set(uriString, item);
    }
    this.viewItems = items;
    this.cachedResults = [];
    this.visibleResults = [];
    this.clearTransientViewState();
    this._onDidChangeTreeData.fire(undefined);
  }

  public showWorkspaceCancelled(): void {
    this.projectItems.clear();
    this.workspaceStatusItems = [];
    this.cachedResults = [];
    this.visibleResults = [];
    this.clearTransientViewState();
    this.viewItems = [
      this.createMessageItem(l10n.t('SpotBugs workspace analysis cancelled.')),
    ];
    this._onDidChangeTreeData.fire(undefined);
  }

  public updateProjectStatus(
    uriString: string,
    status: ProjectStatus,
    extra?: { count?: number; error?: string }
  ): void {
    const item = this.projectItems.get(uriString);
    if (item) {
      item.setStatus(status, extra);
      this._onDidChangeTreeData.fire(item);
    }
  }

  public showWorkspaceResults(projectResults: ProjectResult[]): void {
    this.projectItems.clear();
    this.clearTransientViewState();
    this.workspaceStatusItems = this.createFinalProjectStatusItems(projectResults);
    this.cachedResults = projectResults.flatMap((result) => result.findings);
    this.refreshResultsView();
    this._onDidChangeTreeData.fire(undefined);
  }

  private toDisplayName(uriString: string): string {
    try {
      const u = Uri.parse(uriString);
      return path.basename(u.fsPath) || uriString;
    } catch {
      return uriString;
    }
  }

  public showResults(findings: Finding[]): void {
    this.projectItems.clear();
    this.workspaceStatusItems = [];
    this.clearTransientViewState();
    this.cachedResults = findings ? findings.slice() : [];
    this.refreshResultsView();
    this._onDidChangeTreeData.fire(undefined);
  }

  public getCachedFindings(): Finding[] {
    return this.cachedResults.slice();
  }

  public getAllFindings(): Finding[] {
    return this.visibleResults.slice();
  }

  public getActiveFilters(): FindingFilterState {
    return { ...this.activeFilters };
  }

  public getSearchQuery(): string {
    return this.searchQuery;
  }

  public setSearchQuery(query: string): void {
    this.searchQuery = query.trim();
    this.refreshResultsView();
    this._onDidChangeTreeData.fire(undefined);
  }

  public clearSearchQuery(): void {
    if (!this.searchQuery) {
      return;
    }

    this.searchQuery = '';
    this.refreshResultsView();
    this._onDidChangeTreeData.fire(undefined);
  }

  public getGroupBy(): FindingGroupKind {
    return this.groupBy;
  }

  public setGroupBy(groupBy: FindingGroupKind): void {
    this.groupBy = groupBy;
    this.refreshResultsView();
    this._onDidChangeTreeData.fire(undefined);
  }

  public getSortBy(): FindingSortKind {
    return this.sortBy;
  }

  public setSortBy(sortBy: FindingSortKind): void {
    this.sortBy = sortBy;
    this.refreshResultsView();
    this._onDidChangeTreeData.fire(undefined);
  }

  public getFilterOptions(kind: FindingFilterKind): FindingFilterOption[] {
    return getFindingFilterOptions(this.cachedResults, this.activeFilters, kind);
  }

  public setFilter(kind: FindingFilterKind, value: string): void {
    this.activeFilters = {
      ...this.activeFilters,
      [kind]: value,
    };
    this.refreshResultsView();
    this._onDidChangeTreeData.fire(undefined);
  }

  public clearFilter(kind: FindingFilterKind): void {
    if (!this.activeFilters[kind]) {
      return;
    }

    const nextFilters = { ...this.activeFilters };
    delete nextFilters[kind];
    this.activeFilters = nextFilters;
    this.refreshResultsView();
    this._onDidChangeTreeData.fire(undefined);
  }

  public clearFilters(): void {
    if (Object.keys(this.activeFilters).length === 0) {
      return;
    }

    this.activeFilters = {};
    this.refreshResultsView();
    this._onDidChangeTreeData.fire(undefined);
  }

  public getFindingsForNode(element: TreeItem): Finding[] {
    if (element instanceof CategoryGroupItem) {
      return element.patterns.flatMap((pattern) => pattern.findings.slice());
    }
    if (element instanceof PatternGroupItem) {
      return element.findings.slice();
    }
    if (element instanceof GenericGroupItem) {
      return element.findings.slice();
    }
    if (element instanceof FindingItem) {
      return [element.finding];
    }
    return [];
  }

  private createFinalProjectStatusItems(projectResults: ProjectResult[]): ProjectStatusItem[] {
    return projectResults
      .filter((result) => !!result.error)
      .map((result) => {
        const item = new ProjectStatusItem(
          result.projectUri,
          this.toDisplayName(result.projectUri)
        );
        const status: ProjectStatus =
          result.errorCode === NO_CLASS_TARGETS_CODE ? 'skipped' : 'failed';
        item.setStatus(status, { error: result.error });
        return item;
      });
  }

  private clearTransientViewState(): void {
    this.searchQuery = '';
    this.activeFilters = {};
  }

  private resetExplorationState(): void {
    this.searchQuery = '';
    this.activeFilters = {};
    this.groupBy = 'category';
    this.sortBy = 'severityRank';
  }

  private refreshResultsView(): void {
    if (this.cachedResults.length === 0) {
      this.viewItems = [this.createMessageItem(l10n.t('No issues found.'))];
      this.visibleResults = [];
      this.applyWorkspaceStatusItems();
      return;
    }

    const filteredFindings = applyFindingFilters(this.cachedResults, this.activeFilters);
    const resultView = buildResultView(filteredFindings, {
      searchQuery: this.searchQuery,
      groupBy: this.groupBy,
      sortBy: this.sortBy,
    });
    this.visibleResults = resultView.visibleFindings.slice();

    if (resultView.visibleFindings.length === 0) {
      const emptyState = this.createCurrentEmptyState();
      this.viewItems = [this.createMessageItem(emptyState.label, emptyState.description)];
      this.applyWorkspaceStatusItems();
      return;
    }

    this.viewItems = this.toTreeItems(resultView.nodes);
    this.applyWorkspaceStatusItems();
  }

  private toTreeItems(nodes: FindingResultNode[]): TreeItem[] {
    return nodes.map((node) => {
      if (node.type === 'finding') {
        return new FindingItem(node.finding);
      }

      if (this.groupBy === 'category' && node.groupKind === 'category') {
        const patterns = node.children
          .filter((child): child is FindingResultGroup => child.type === 'group')
          .map((child) => new PatternGroupItem(child.label, child.findings));
        return new CategoryGroupItem(node.label, patterns, node.total);
      }

      return this.toGenericGroupItem(node);
    });
  }

  private toGenericGroupItem(group: FindingResultGroup): GenericGroupItem {
    const children = group.children.map((child) =>
      child.type === 'finding'
        ? new FindingItem(child.finding)
        : this.toGenericGroupItem(child)
    );
    return new GenericGroupItem(group.key, group.groupKind, group.label, group.findings, children);
  }

  private createCurrentEmptyState(): { label: string; description?: string } {
    const parts = [
      describeLocalizedFindingFilters(this.cachedResults, this.activeFilters),
      this.searchQuery ? l10n.t('Search: "{0}"', this.searchQuery) : undefined,
    ].filter((part): part is string => !!part);

    return {
      label: l10n.t('No cached findings match the current view.'),
      description: parts.join(' | ') || undefined,
    };
  }

  private applyWorkspaceStatusItems(): void {
    if (this.workspaceStatusItems.length === 0) {
      return;
    }

    const resultItems = this.cachedResults.length > 0 ? this.viewItems : [];
    this.viewItems = [...this.workspaceStatusItems, ...resultItems];
  }

  private createMessageItem(
    label: string,
    description?: string,
    contextValue = 'spotbugs.message',
    iconPath?: ThemeIcon
  ): TreeItem {
    const item = new TreeItem(label);
    item.description = description;
    item.contextValue = contextValue;
    item.iconPath = iconPath;
    return item;
  }
}
