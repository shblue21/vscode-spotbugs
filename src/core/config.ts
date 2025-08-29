import { workspace, ExtensionContext } from 'vscode';

export class Config {
  private _ctx: ExtensionContext;

  public effort!: string;
  public classpaths!: string[] | null;

  public constructor(ctx: ExtensionContext) {
    this._ctx = ctx;
    this.init();
  }

  public init() {
    const config = workspace.getConfiguration('spotbugs');

    // Normalize to lowercase: min | default | max
    const effort = config.get<string>('effort', 'default') || 'default';
    this.effort = (effort || 'default').toLowerCase();
    this.classpaths = null; // Will be set dynamically during analysis
  }

  public setClasspaths(classpaths: string[]): void {
    this.classpaths = classpaths;
  }

  // Control JSON serialization sent to backend
  public toJSON(): { effort: string; classpaths: string[] | null } {
    return {
      effort: this.effort,
      classpaths: this.classpaths,
    };
  }
}
