import type { ClasspathResult } from '../workspace/classpathTypes';

export type AnalysisResolutionIssueCode =
  | 'JAVA_LS_REQUEST_FAILED'
  | 'JAVA_LS_NO_RESULT'
  | 'JAVA_LS_EMPTY_PROJECT_LIST'
  | 'JAVA_LS_EMPTY_RUNTIME_CLASSPATH'
  | 'JAVA_LS_EXTENSION_FALLBACK_USED'
  | 'WORKSPACE_FALLBACK_USED'
  | 'OUTPUT_FALLBACK_USED';

export interface AnalysisResolutionIssue {
  code: AnalysisResolutionIssueCode;
  level: 'info' | 'warn';
  source: 'java-ls' | 'project-discovery' | 'target-resolution';
  phase:
    | 'get-classpaths'
    | 'get-all-projects'
    | 'workspace-fallback'
    | 'output-fallback';
  message: string;
  attemptLabel?: string;
  variant?:
    | 'uri-scope'
    | 'uri'
    | 'direct'
    | 'runtime-arg'
    | 'no-arg'
    | 'extension-api';
  cause?: string;
}

export type ClasspathLookupOutcome =
  | {
      status: 'resolved';
      classpath: ClasspathResult;
      issues: AnalysisResolutionIssue[];
    }
  | {
      status: 'unavailable';
      issues: AnalysisResolutionIssue[];
    };

export type JavaProjectsOutcome =
  | {
      status: 'resolved';
      projectUris: string[];
      issues: AnalysisResolutionIssue[];
    }
  | {
      status: 'empty';
      projectUris: [];
      issues: AnalysisResolutionIssue[];
    }
  | {
      status: 'unavailable';
      projectUris: [];
      issues: AnalysisResolutionIssue[];
    };
