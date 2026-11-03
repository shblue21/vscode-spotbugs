import type { Uri } from 'vscode';

interface PathAnalysisInput {
  kind: 'source' | 'artifact';
  path: string;
  resolutionRoots?: readonly string[] | null;
  sourceOutputs?: Readonly<Record<string, string>> | null;
}

interface AnalysisEnvironment {
  runtimeClasspaths?: readonly string[] | null;
}

interface SourceLookupContext {
  preferredResource?: Uri;
  roots?: readonly string[] | null;
}

interface AnalysisExecutionOptions {
  includeBaselineXml?: boolean;
}

export interface AnalysisExecutionUnit {
  inputs: readonly PathAnalysisInput[];
  environment: AnalysisEnvironment;
  sourceLookup: SourceLookupContext;
  options?: AnalysisExecutionOptions;
}
