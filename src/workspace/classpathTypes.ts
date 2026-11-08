import type { Uri } from 'vscode';

export type ClasspathScope = 'runtime' | 'test';
export type ProjectRef = string | Uri | undefined;

export type SourceSelection = 'unknown' | 'source-less' | 'empty' | 'selected';

export interface ClasspathResult {
  projectRoot: string;
  runtimeClasspaths: string[];
  targetResolutionRoots: string[];
  sourcepaths: string[];
  sourceOutputs?: Record<string, string>;
  /** Distinguishes unavailable source metadata from a confirmed empty scope. */
  sourceSelection: SourceSelection;
}
