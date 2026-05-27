import type { Uri } from 'vscode';

export type DiagnosticUpdateScope =
  | { kind: 'file'; uri: Uri }
  | { kind: 'folder'; uri: Uri }
  | { kind: 'returned-files'; uri: Uri };
