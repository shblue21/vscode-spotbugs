import { TreeItem, TreeItemCollapsibleState, ThemeIcon } from "vscode";
import { BugInfo } from "./bugInfo";
import { SpotBugsCommands } from "./constants/commands";
import * as path from "path";

export class CategoryGroupItem extends TreeItem {
  public patterns: PatternGroupItem[];

  constructor(category: string, patterns: PatternGroupItem[], totalCount: number) {
    super(`${category} (${totalCount})`, TreeItemCollapsibleState.Expanded);
    this.patterns = patterns;
    this.iconPath = new ThemeIcon("folder");
    this.description = `${patterns.length} pattern${patterns.length !== 1 ? "s" : ""}`;
  }
}

export class PatternGroupItem extends TreeItem {
  public bugs: BugInfo[];

  constructor(label: string, bugs: BugInfo[]) {
    super(`${label} (${bugs.length})`, TreeItemCollapsibleState.Collapsed);
    this.bugs = bugs;
    this.iconPath = new ThemeIcon("list-tree");
  }
}

export class BugInfoItem extends TreeItem {
  public bug: BugInfo;

  constructor(bug: BugInfo) {
    const label = buildReadableLabel(bug);
    super(label, TreeItemCollapsibleState.None);
    this.bug = bug;
    const filePath = bug.fullPath || bug.realSourcePath || bug.sourceFile;
    const fileName = filePath ? path.basename(filePath) : "Unknown file";
    const lineInfo =
      bug.startLine && bug.endLine
        ? bug.startLine === bug.endLine
          ? `${bug.startLine}`
          : `${bug.startLine}-${bug.endLine}`
        : "";
    this.description = `${fileName}${lineInfo ? `:${lineInfo}` : ""} • ${bug.category}`;
    this.tooltip = `Pattern: ${bug.abbrev || bug.type}\nCategory: ${bug.category}\nPriority: ${bug.priority}\nFile: ${filePath}${lineInfo ? `\nLine: ${lineInfo}` : ""}`;
    this.iconPath = severityIcon(bug);

    // Set command to navigate to source file when clicked
    this.command = {
      command: SpotBugsCommands.OPEN_BUG_LOCATION,
      title: "Open Bug Location",
      arguments: [bug],
    };
  }
}

function buildReadableLabel(bug: BugInfo): string {
  const pattern = bug.abbrev || bug.type || "Bug";
  const raw = bug.message || "";

  // Remove leading "PATTERN: " prefix if duplicated in message
  let msg = raw.trim();
  const prefix = `${pattern}:`;
  if (msg.toUpperCase().startsWith(prefix.toUpperCase())) {
    msg = msg.substring(prefix.length).trim();
  }

  // Trim trailing context like " in com.foo.Bar.method(...)" to keep it concise
  const inIdx = msg.indexOf(" in ");
  if (inIdx > 0) {
    msg = msg.substring(0, inIdx).trim();
  }

  // Fallback if message is empty
  if (!msg) {
    msg = bug.type || "SpotBugs finding";
  }

  return `[${pattern}] ${msg}`;
}

function severityIcon(bug: BugInfo): ThemeIcon {
  const rank = typeof bug.rank === "number" ? bug.rank : 20;
  if (rank <= 4) {
    return new ThemeIcon("error");
  }
  if (rank <= 9) {
    return new ThemeIcon("warning");
  }
  return new ThemeIcon("info");
}

export function buildPatternGroupLabel(bug: BugInfo): string {
  const pattern = bug.abbrev || bug.type || "Pattern";
  const raw = bug.message || "";
  let msg = raw.trim();
  const prefix = `${pattern}:`;
  if (msg.toUpperCase().startsWith(prefix.toUpperCase())) {
    msg = msg.substring(prefix.length).trim();
  }
  const inIdx = msg.indexOf(" in ");
  if (inIdx > 0) {
    msg = msg.substring(0, inIdx).trim();
  }
  if (!msg) {
    msg = bug.type || "SpotBugs Pattern";
  }
  return `[${pattern}] ${msg}`;
}

export class ProjectStatusItem extends TreeItem {
  public idKey: string;
  public status: "pending" | "running" | "done" | "failed" = "pending";
  public count?: number;

  constructor(idKey: string, label: string) {
    super(label, TreeItemCollapsibleState.None);
    this.idKey = idKey;
    this.iconPath = new ThemeIcon("clock");
    this.description = "Pending";
  }

  public setStatus(
    status: "pending" | "running" | "done" | "failed",
    extra?: { count?: number; error?: string },
  ) {
    this.status = status;
    if (status === "pending") {
      this.iconPath = new ThemeIcon("clock");
      this.description = "Pending";
    } else if (status === "running") {
      this.iconPath = new ThemeIcon("sync");
      this.description = "Analyzing…";
    } else if (status === "done") {
      this.iconPath = new ThemeIcon("check");
      this.count = extra?.count;
      this.description = typeof this.count === "number" ? `Done (${this.count})` : "Done";
    } else if (status === "failed") {
      this.iconPath = new ThemeIcon("error");
      this.description = extra?.error ? `Failed: ${extra.error}` : "Failed";
    }
  }
}
