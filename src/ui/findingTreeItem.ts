import { TreeItem, TreeItemCollapsibleState, ThemeIcon } from 'vscode';
import { Finding } from '../model/finding';
import { toFindingItemView } from './findingViewModel';

export class CategoryGroupItem extends TreeItem {
  public patterns: PatternGroupItem[];

  constructor(category: string, patterns: PatternGroupItem[], totalCount: number) {
    super(`${category} (${totalCount})`, TreeItemCollapsibleState.Expanded);
    this.patterns = patterns;
    this.iconPath = new ThemeIcon('folder');
    this.description = `${patterns.length} pattern${patterns.length !== 1 ? 's' : ''}`;
    this.contextValue = 'spotbugs.category';
  }
}

export class PatternGroupItem extends TreeItem {
  public findings: Finding[];

  constructor(label: string, findings: Finding[]) {
    super(`${label} (${findings.length})`, TreeItemCollapsibleState.Collapsed);
    this.findings = findings;
    this.iconPath = new ThemeIcon('list-tree');
    this.contextValue = 'spotbugs.pattern';
  }
}

export class FindingItem extends TreeItem {
  public finding: Finding;

  constructor(finding: Finding) {
    const view = toFindingItemView(finding);
    super(view.label, TreeItemCollapsibleState.None);
    this.finding = finding;
    this.description = view.description;
    this.tooltip = view.tooltip;
    this.iconPath = view.icon;
    this.contextValue = 'spotbugs.bug';
  }
}

// view computations moved to findingViewModel.ts
export type ProjectStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export class ProjectStatusItem extends TreeItem {
  public idKey: string;
  public status: ProjectStatus = 'pending';
  public count?: number;

  constructor(idKey: string, label: string) {
    super(label, TreeItemCollapsibleState.None);
    this.idKey = idKey;
    this.iconPath = new ThemeIcon('clock');
    this.description = 'Pending';
  }

  public setStatus(
    status: ProjectStatus,
    extra?: { count?: number; error?: string }
  ) {
    this.status = status;
    if (status === 'pending') {
      this.iconPath = new ThemeIcon('clock');
      this.description = 'Pending';
    } else if (status === 'running') {
      this.iconPath = new ThemeIcon('sync');
      this.description = 'Analyzing…';
    } else if (status === 'done') {
      this.iconPath = new ThemeIcon('check');
      this.count = extra?.count;
      this.description = typeof this.count === 'number' ? `Done (${this.count})` : 'Done';
    } else if (status === 'failed') {
      this.iconPath = new ThemeIcon('error');
      this.description = extra?.error ? `Failed: ${extra.error}` : 'Failed';
    } else if (status === 'skipped') {
      this.iconPath = new ThemeIcon('warning');
      this.description = extra?.error ? `Skipped: ${extra.error}` : 'Skipped';
    }
  }
}
