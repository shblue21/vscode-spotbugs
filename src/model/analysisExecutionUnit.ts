import type { Uri } from 'vscode';

export interface PathAnalysisInput {
  path: string;
  resolutionRoots?: readonly string[] | null;
}

export interface AnalysisEnvironment {
  runtimeClasspaths?: readonly string[] | null;
}

export interface SourceLookupContext {
  preferredResource?: Uri;
  roots?: readonly string[] | null;
}

export interface AnalysisExecutionOptions {
  includeBaselineXml?: boolean;
}

export interface AnalysisExecutionUnit {
  input: PathAnalysisInput;
  environment: AnalysisEnvironment;
  settingsResource?: Uri;
  sourceLookup: SourceLookupContext;
  options?: AnalysisExecutionOptions;
}
