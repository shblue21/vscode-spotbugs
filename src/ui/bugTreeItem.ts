import { TreeItem, TreeItemCollapsibleState, ThemeIcon } from 'vscode';
import { Bug } from '../model/bug';
import { SpotBugsCommands } from '../constants/commands';
import { toBugItemView } from './bugViewModel';

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
  public bugs: Bug[];

  constructor(label: string, bugs: Bug[]) {
    super(`${label} (${bugs.length})`, TreeItemCollapsibleState.Collapsed);
    this.bugs = bugs;
    this.iconPath = new ThemeIcon('list-tree');
    this.contextValue = 'spotbugs.pattern';
  }
}

export class BugItem extends TreeItem {
  public bug: Bug;

  constructor(bug: Bug) {
    const view = toBugItemView(bug);
    super(view.label, TreeItemCollapsibleState.None);
    this.bug = bug;
    this.description = view.description;
    this.tooltip = view.tooltip;
    this.iconPath = view.icon;
    this.contextValue = 'spotbugs.bug';

    this.command = {
      command: SpotBugsCommands.OPEN_BUG_LOCATION,
      title: 'Open Bug Location',
      arguments: [bug],
    };
  }
}

// view computations moved to bugViewModel.ts

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
