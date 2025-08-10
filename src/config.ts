import { workspace, ExtensionContext } from 'vscode';
import * as path from 'path';

export class Config {
  private _ctx: ExtensionContext;

  public effort!: string;
  public javaHome!: string | null;
  public pluginsFile!: string | null;

  public constructor(ctx: ExtensionContext) {
    this._ctx = ctx;
    this.init();
  }

  public init() {
    const config = workspace.getConfiguration('spotbugs');

    this.effort = config.get<string>('effort', 'Default');
    this.javaHome = config.get<string | null>('java.home', null);
    this.pluginsFile = config.get<string | null>('plugins.file', null);

    this.resolvePaths();
  }

  private resolvePaths() {
    if (this.pluginsFile && !path.isAbsolute(this.pluginsFile)) {
      const workspaceRoot = workspace.workspaceFolders ? workspace.workspaceFolders[0].uri.fsPath : '';
      if (workspaceRoot) {
        this.pluginsFile = path.join(workspaceRoot, this.pluginsFile);
      }
    }
  }
}