import type { Uri } from 'vscode';

export type DiagnosticUpdateScope =
  | { kind: 'file'; uri: Uri }
  | { kind: 'folder'; uri: Uri }
  | { kind: 'source-roots'; uris: readonly Uri[]; excludedUris?: readonly Uri[] }
  | { kind: 'returned-files'; uri: Uri };
