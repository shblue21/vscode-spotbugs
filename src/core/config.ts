import { workspace, ExtensionContext, Uri } from 'vscode';
import * as path from 'path';
import { SETTINGS_SECTION, settingKeys } from '../constants/settings';

export interface AnalysisSettings {
  effort: string;
  priorityThreshold?: number;
  includeFilterPaths?: string[];
  excludeFilterPaths?: string[];
  excludeBaselineBugsPaths?: string[];
  // Legacy field kept for compatibility with older Java runner schema.
  excludeFilterPath?: string;
  plugins?: string[];
}

export class Config {
  private _ctx: ExtensionContext;

  public effort!: string;
  // Future-ready fields (optional; only sent when defined)
  public priorityThreshold?: number;
  public includeFilterPaths?: string[];
  public excludeFilterPaths?: string[];
  public excludeBaselineBugsPaths?: string[];
  // Legacy key/value kept as fallback only.
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

    const pt = config.get<number | undefined>(settingKeys.analysisPriorityThreshold);
    this.priorityThreshold = typeof pt === 'number' ? pt : undefined;

    this.includeFilterPaths = this.readStringArray(
      config.get<unknown>(settingKeys.analysisIncludeFilterPaths)
    );
    this.excludeFilterPaths = this.readStringArray(
      config.get<unknown>(settingKeys.analysisExcludeFilterPaths)
    );
    this.excludeBaselineBugsPaths = this.readStringArray(
      config.get<unknown>(settingKeys.analysisExcludeBaselineBugsPaths)
    );

    // Legacy key fallback (read-only): used only when new exclude list is unset.
    const legacyExcludeFilterPath = this.normalizeString(
      config.get<string | undefined>(settingKeys.filtersExcludeFilterPath)
    );
    this.excludeFilterPath = legacyExcludeFilterPath;
    if (!this.excludeFilterPaths && legacyExcludeFilterPath) {
      this.excludeFilterPaths = [legacyExcludeFilterPath];
    }

    this.plugins = this.readStringArray(config.get<unknown>(settingKeys.pluginsPaths));
  }

  // Resolve a workspace-relative path to absolute (best-effort)
  private resolveToAbsolute(p?: string): string | undefined {
    if (!p) return undefined;
    if (path.isAbsolute(p)) return p;
    const folder = workspace.workspaceFolders?.[0];
    if (!folder) return p; // leave as-is if no workspace
    return path.resolve(Uri.parse(folder.uri.toString()).fsPath, p);
  }

  private normalizeString(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private readStringArray(raw: unknown): string[] | undefined {
    if (!Array.isArray(raw)) {
      return undefined;
    }
    const deduped = new Set<string>();
    for (const entry of raw) {
      if (typeof entry !== 'string') {
        continue;
      }
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        deduped.add(trimmed);
      }
    }
    const values = Array.from(deduped);
    return values.length > 0 ? values : undefined;
  }

  private resolvePathsToAbsolute(paths: string[] | undefined): string[] | undefined {
    if (!Array.isArray(paths) || paths.length === 0) {
      return undefined;
    }
    const resolved = new Set<string>();
    for (const entry of paths) {
      const absolute = this.resolveToAbsolute(entry);
      if (absolute && absolute.trim().length > 0) {
        resolved.add(absolute);
      }
    }
    const values = Array.from(resolved);
    return values.length > 0 ? values : undefined;
  }

  public getAnalysisSettings(): AnalysisSettings {
    const settings: AnalysisSettings = {
      effort: this.effort,
    };
    if (typeof this.priorityThreshold === 'number') {
      settings.priorityThreshold = this.priorityThreshold;
    }
    const includeFilterPaths = this.resolvePathsToAbsolute(this.includeFilterPaths);
    if (includeFilterPaths) {
      settings.includeFilterPaths = includeFilterPaths;
    }
    const excludeFilterPaths = this.resolvePathsToAbsolute(this.excludeFilterPaths);
    if (excludeFilterPaths) {
      settings.excludeFilterPaths = excludeFilterPaths;
      // Backward compatibility for older Java runner payload schema.
      settings.excludeFilterPath = excludeFilterPaths[0];
    }
    const excludeBaselineBugsPaths = this.resolvePathsToAbsolute(this.excludeBaselineBugsPaths);
    if (excludeBaselineBugsPaths) {
      settings.excludeBaselineBugsPaths = excludeBaselineBugsPaths;
    }
    if (Array.isArray(this.plugins) && this.plugins.length > 0) {
      settings.plugins = this.plugins.slice();
    }
    return settings;
  }
}
