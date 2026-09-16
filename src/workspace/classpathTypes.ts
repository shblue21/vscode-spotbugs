import type { Uri } from 'vscode';

export type ClasspathScope = 'runtime' | 'test';
export type ProjectRef = string | Uri | undefined;

export interface ClasspathResult {
  projectRoot: string;
  runtimeClasspaths: string[];
  targetResolutionRoots: string[];
  sourcepaths: string[];
  sourceOutputs?: Record<string, string>;
  /** Explicitly confirmed by JDT; absent when settings are missing or incomplete. */
  sourceRootsAbsent?: true;
}
