import type { Uri } from 'vscode';

export type AnalysisResultScope =
  | { kind: 'resource'; resource: Uri }
  | { kind: 'workspace'; workspaceFolder: Uri };
