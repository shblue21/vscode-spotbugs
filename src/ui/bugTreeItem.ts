import { TreeItem, TreeItemCollapsibleState, ThemeIcon } from 'vscode';
import { BugInfo } from '../models/bugInfo';
import { SpotBugsCommands } from '../constants/commands';
import { toBugItemView } from './bugViewModel';

export class CategoryGroupItem extends TreeItem {
  public patterns: PatternGroupItem[];

  constructor(category: string, patterns: PatternGroupItem[], totalCount: number) {
    super(`${category} (${totalCount})`, TreeItemCollapsibleState.Expanded);
    this.patterns = patterns;
    this.iconPath = new ThemeIcon('folder');
    this.description = `${patterns.length} pattern${patterns.length !== 1 ? 's' : ''}`;
  }
}

export class PatternGroupItem extends TreeItem {
  public bugs: BugInfo[];

  constructor(label: string, bugs: BugInfo[]) {
    super(`${label} (${bugs.length})`, TreeItemCollapsibleState.Collapsed);
    this.bugs = bugs;
    this.iconPath = new ThemeIcon('list-tree');
  }
}

export class BugInfoItem extends TreeItem {
  public bug: BugInfo;

  constructor(bug: BugInfo) {
    const view = toBugItemView(bug);
    super(view.label, TreeItemCollapsibleState.None);
    this.bug = bug;
    this.description = view.description;
    this.tooltip = view.tooltip;
    this.iconPath = view.icon;

    this.command = {
      command: SpotBugsCommands.OPEN_BUG_LOCATION,
      title: 'Open Bug Location',
      arguments: [bug],
    };
  }
}

// view computations moved to bugViewModel.ts

export function buildPatternGroupLabel(bug: BugInfo): string {
  const pattern = bug.abbrev || bug.type || 'Pattern';
  const raw = bug.message || '';
  let msg = raw.trim();
  const prefix = `${pattern}:`;
  if (msg.toUpperCase().startsWith(prefix.toUpperCase())) {
    msg = msg.substring(prefix.length).trim();
  }
  const inIdx = msg.indexOf(' in ');
  if (inIdx > 0) {
    msg = msg.substring(0, inIdx).trim();
  }
  if (!msg) {
    msg = bug.type || 'SpotBugs Pattern';
  }
  return `[${pattern}] ${msg}`;
}

export class ProjectStatusItem extends TreeItem {
  public idKey: string;
  public status: 'pending' | 'running' | 'done' | 'failed' = 'pending';
  public count?: number;

  constructor(idKey: string, label: string) {
    super(label, TreeItemCollapsibleState.None);
    this.idKey = idKey;
    this.iconPath = new ThemeIcon('clock');
    this.description = 'Pending';
  }

  public setStatus(
    status: 'pending' | 'running' | 'done' | 'failed',
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
    }
  }
}
