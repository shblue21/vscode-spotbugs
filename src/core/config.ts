import { workspace, ExtensionContext, Uri } from 'vscode';
import * as path from 'path';
import { SETTINGS_SECTION, settingKeys } from '../constants/settings';

export class Config {
  private _ctx: ExtensionContext;

  public effort!: string;
  public classpaths!: string[] | null;
  public readonly schemaVersion = 1;
  // Future-ready fields (optional; only sent when defined)
  public priorityThreshold?: number;
  public excludeFilterPath?: string;
  public plugins?: string[];

  public constructor(ctx: ExtensionContext) {
    this._ctx = ctx;
    this.init();
  }

  public init() {
    const config = workspace.getConfiguration(SETTINGS_SECTION);

    // Normalize to lowercase: min | default | max
    const effort = config.get<string>(settingKeys.analysisEffort) ?? 'default';
    this.effort = (effort || 'default').toLowerCase();
    this.classpaths = null; // Will be set dynamically during analysis

    // M2: read optional future fields if present (no UI contribution yet)
    const pt = config.get<number | undefined>(settingKeys.analysisPriorityThreshold);
    this.priorityThreshold = typeof pt === 'number' ? pt : undefined;

    const filterPath = config.get<string | undefined>(settingKeys.filtersExcludeFilterPath);
    this.excludeFilterPath = filterPath && filterPath.trim().length > 0 ? filterPath : undefined;

    const plugs = config.get<unknown>(settingKeys.pluginsPaths) as unknown;
    if (Array.isArray(plugs)) {
      const arr = plugs.filter((v) => typeof v === 'string' && v.trim().length > 0) as string[];
      this.plugins = arr.length > 0 ? arr : undefined;
    } else {
      this.plugins = undefined;
    }
  }

  public setClasspaths(classpaths: string[]): void {
    this.classpaths = classpaths;
  }

  // Resolve a workspace-relative path to absolute (best-effort)
  private resolveToAbsolute(p?: string): string | undefined {
    if (!p) return undefined;
    if (path.isAbsolute(p)) return p;
    const folder = workspace.workspaceFolders?.[0];
    if (!folder) return p; // leave as-is if no workspace
    return path.resolve(Uri.parse(folder.uri.toString()).fsPath, p);
  }

  // Control JSON serialization sent to backend (wire schema)
  public toJSON(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      schemaVersion: this.schemaVersion,
      effort: this.effort,
      classpaths: this.classpaths ?? null,
    };

    // Only include optional fields when defined
    if (typeof this.priorityThreshold === 'number') {
      payload.priorityThreshold = this.priorityThreshold;
    }
    if (this.excludeFilterPath) {
      payload.excludeFilterPath = this.resolveToAbsolute(this.excludeFilterPath);
    }
    if (Array.isArray(this.plugins) && this.plugins.length > 0) {
      payload.plugins = this.plugins;
    }
    return payload;
  }
}
