import { workspace, WorkspaceFolder } from 'vscode';

export function getPrimaryWorkspaceFolder(): WorkspaceFolder | undefined {
  return workspace.workspaceFolders?.[0];
}

export function getWorkspaceRootPath(): string | undefined {
  return getPrimaryWorkspaceFolder()?.uri.fsPath;
}
