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
import type { AnalysisReportRun } from '../model/analysisReport';
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

type TreeContent =
  | { kind: 'initial' }
  | { kind: 'loading' }
  | { kind: 'analysis-failure'; message: string; code?: string }
  | {
      kind: 'workspace-progress';
      items: ProjectStatusItem[];
      projectItems: Map<string, ProjectStatusItem>;
    }
  | { kind: 'workspace-cancelled' }
  | {
      kind: 'results';
      findings: Finding[];
      reportRuns: AnalysisReportRun[];
      workspaceStatusItems: ProjectStatusItem[];
    };

interface RenderedTreeContent {
  viewItems: TreeItem[];
  visibleFindings: Finding[];
}

export class SpotBugsTreeDataProvider implements TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: EventEmitter<TreeItem | undefined | null> =
    new EventEmitter<TreeItem | undefined | null>();
  readonly onDidChangeTreeData: Event<TreeItem | undefined | null> =
    this._onDidChangeTreeData.event;

  private content: TreeContent = { kind: 'initial' };
  private rendered: RenderedTreeContent = {
    viewItems: [],
    visibleFindings: [],
  };
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
    return Promise.resolve(this.rendered.viewItems);
  }

  public showInitialMessage(): void {
    this.transitionTo({ kind: 'initial' });
  }

  public showLoading(): void {
    this.transitionTo({ kind: 'loading' });
  }

  public showAnalysisFailure(message: string, code?: string): void {
    this.transitionTo({ kind: 'analysis-failure', message, code });
  }

  public showWorkspaceProgress(projectUris: string[]): void {
    const items: ProjectStatusItem[] = [];
    const projectItems = new Map<string, ProjectStatusItem>();
    for (const uriString of projectUris) {
      const label = this.toDisplayName(uriString);
      const item = new ProjectStatusItem(uriString, label);
      items.push(item);
      projectItems.set(uriString, item);
    }
    this.transitionTo({ kind: 'workspace-progress', items, projectItems });
  }

  public showWorkspaceCancelled(): void {
    this.transitionTo({ kind: 'workspace-cancelled' });
  }

  public updateProjectStatus(
    uriString: string,
    status: ProjectStatus,
    extra?: { count?: number; error?: string }
  ): void {
    if (this.content.kind !== 'workspace-progress') {
      return;
    }
    const item = this.content.projectItems.get(uriString);
    if (item) {
      item.setStatus(status, extra);
      this._onDidChangeTreeData.fire(item);
    }
  }

  public showWorkspaceResults(projectResults: ProjectResult[]): void {
    const findings = projectResults.flatMap((result) => result.findings);
    const reportRuns: AnalysisReportRun[] = projectResults.map((result) => ({
      projectUri: result.projectUri,
      findings: result.findings,
      analysisStatus: result.error
        ? result.errorCode === NO_CLASS_TARGETS_CODE
          ? 'skipped'
          : 'failed'
        : undefined,
      spotbugsVersion: result.spotbugsVersion,
      summary: result.reportSummary,
      nativeSarif: result.nativeSarif,
    }));
    this.transitionTo({
      kind: 'results',
      findings,
      reportRuns,
      workspaceStatusItems: this.createFinalProjectStatusItems(projectResults),
    });
  }

  private toDisplayName(uriString: string): string {
    try {
      const u = Uri.parse(uriString);
      return path.basename(u.fsPath) || uriString;
    } catch {
      return uriString;
    }
  }

  public showResults(findings: Finding[], reportRun?: AnalysisReportRun): void {
    const cachedFindings = findings ? findings.slice() : [];
    this.transitionTo({
      kind: 'results',
      findings: cachedFindings,
      reportRuns: reportRun ? [{ ...reportRun, findings: cachedFindings }] : [],
      workspaceStatusItems: [],
    });
  }

  public getCachedFindings(): Finding[] {
    return this.content.kind === 'results' ? this.content.findings.slice() : [];
  }

  public getAllFindings(): Finding[] {
    return this.rendered.visibleFindings.slice();
  }

  public getReportRuns(): AnalysisReportRun[] {
    return this.content.kind === 'results'
      ? this.content.reportRuns.map((run) => ({ ...run, findings: run.findings.slice() }))
      : [];
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
    return getFindingFilterOptions(this.getResultFindings(), this.activeFilters, kind);
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
    this.materializeContent();
  }

  private transitionTo(content: TreeContent): void {
    this.content = content;
    if (content.kind === 'initial') {
      this.resetExplorationState();
    } else {
      this.clearTransientViewState();
    }
    this.materializeContent();
    this._onDidChangeTreeData.fire(undefined);
  }

  private materializeContent(): void {
    switch (this.content.kind) {
      case 'initial':
        this.setRenderedItems([
          this.createMessageItem(l10n.t('Ready to analyze. Click the bug icon to start.')),
        ]);
        return;
      case 'loading':
        this.setRenderedItems([this.createMessageItem(l10n.t('Analyzing...'))]);
        return;
      case 'analysis-failure':
        this.setRenderedItems([
          this.createMessageItem(
            this.content.message,
            this.content.code,
            'spotbugs.message.error',
            new ThemeIcon('error')
          ),
        ]);
        return;
      case 'workspace-progress':
        this.setRenderedItems(this.content.items);
        return;
      case 'workspace-cancelled':
        this.setRenderedItems([
          this.createMessageItem(l10n.t('SpotBugs workspace analysis cancelled.')),
        ]);
        return;
      case 'results':
        this.materializeResults(this.content);
        return;
    }
  }

  private materializeResults(content: Extract<TreeContent, { kind: 'results' }>): void {
    if (content.findings.length === 0) {
      this.setRenderedItems(
        this.prependWorkspaceStatusItems(
          [this.createMessageItem(l10n.t('No issues found.'))],
          content
        )
      );
      return;
    }

    const filteredFindings = applyFindingFilters(content.findings, this.activeFilters);
    const resultView = buildResultView(filteredFindings, {
      searchQuery: this.searchQuery,
      groupBy: this.groupBy,
      sortBy: this.sortBy,
    });

    if (resultView.visibleFindings.length === 0) {
      const emptyState = this.createCurrentEmptyState(content.findings);
      this.setRenderedItems(
        this.prependWorkspaceStatusItems(
          [this.createMessageItem(emptyState.label, emptyState.description)],
          content
        ),
        resultView.visibleFindings
      );
      return;
    }

    this.setRenderedItems(
      this.prependWorkspaceStatusItems(this.toTreeItems(resultView.nodes), content),
      resultView.visibleFindings
    );
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

  private createCurrentEmptyState(
    cachedFindings: Finding[]
  ): { label: string; description?: string } {
    const parts = [
      describeLocalizedFindingFilters(cachedFindings, this.activeFilters),
      this.searchQuery ? l10n.t('Search: "{0}"', this.searchQuery) : undefined,
    ].filter((part): part is string => !!part);

    return {
      label: l10n.t('No cached findings match the current view.'),
      description: parts.join(' | ') || undefined,
    };
  }

  private getResultFindings(): Finding[] {
    return this.content.kind === 'results' ? this.content.findings : [];
  }

  private prependWorkspaceStatusItems(
    viewItems: TreeItem[],
    content: Extract<TreeContent, { kind: 'results' }>
  ): TreeItem[] {
    if (content.workspaceStatusItems.length === 0) {
      return viewItems;
    }

    const resultItems = content.findings.length > 0 ? viewItems : [];
    return [...content.workspaceStatusItems, ...resultItems];
  }

  private setRenderedItems(viewItems: TreeItem[], visibleFindings: Finding[] = []): void {
    this.rendered = {
      viewItems,
      visibleFindings: visibleFindings.slice(),
    };
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
