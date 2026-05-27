import { CancellationToken, Uri } from 'vscode';
import { Logger } from '../core/logger';
import { Config } from '../core/config';
import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import { AnalysisOutcome } from '../model/analysisOutcome';
import type { DiagnosticUpdateScope } from '../model/diagnosticScope';
import { ProjectRef } from '../workspace/classpathService';
import type { ProjectResult } from './projectResult';
import { projectResultFromOutcome } from './projectResult';
import {
  AnalysisExecutionTarget,
  createAnalysisFailureOutcome,
  runAnalysisTarget,
} from './analysisExecution';
import {
  resolveFileAnalysisTarget,
  resolveFileAnalysisTargetDetailed,
  resolveProjectAnalysisTarget,
  resolveProjectAnalysisTargetDetailed,
} from '../workspace/analysisTargetResolver';
import { getWorkspaceProjectUris } from '../workspace/projectDiscovery';

const ERROR_ANALYSIS_FAILED = 'ANALYSIS_FAILED';
const ERROR_ANALYSIS_CANCELLED = 'ANALYSIS_CANCELLED';

export { NO_CLASS_TARGETS_CODE } from '../workspace/analysisTargetCodes';
export type { ProjectResult } from './projectResult';

export interface WorkspaceResult {
  results: ProjectResult[];
  cancelled?: boolean;
}

export interface AnalysisExecutionContext {
  resolutionIssues: AnalysisResolutionIssue[];
  diagnosticScope?: DiagnosticUpdateScope;
}

export interface AnalysisExecutionResult {
  outcome: AnalysisOutcome;
  context: AnalysisExecutionContext;
}

export interface WorkspaceExecutionResult {
  results: ProjectResult[];
  cancelled?: boolean;
  context: AnalysisExecutionContext;
}

export async function analyzeFileDetailed(
  config: Config,
  uri: Uri
): Promise<AnalysisExecutionResult> {
  const context = createExecutionContext();

  try {
    const result = await resolveFileAnalysisTargetDetailed(uri);
    context.resolutionIssues.push(...result.issues);

    if (result.resolution.status !== 'ok') {
      return {
        outcome: {
          findings: [],
          targetPath: uri.fsPath,
          failure: {
            kind: 'target',
            level: 'warn',
            code: result.resolution.errorCode,
            message: result.resolution.message,
          },
        },
        context,
      };
    }
    context.diagnosticScope = result.resolution.target.diagnosticScope;

    try {
      return {
        outcome: await runAnalysis(config, result.resolution.target),
        context,
      };
    } catch (error) {
      Logger.error('Analyzer: analyzeFile failed', error);
      return {
        outcome: createAnalysisFailureOutcome(
          result.resolution.target.targetPath,
          ERROR_ANALYSIS_FAILED,
          messageFromUnknown(error)
        ),
        context,
      };
    }
  } catch (error) {
    Logger.error('Analyzer: analyzeFile failed', error);
    return {
      outcome: createAnalysisFailureOutcome(
        uri.fsPath,
        ERROR_ANALYSIS_FAILED,
        messageFromUnknown(error)
      ),
      context,
    };
  }
}

export async function analyzeFile(config: Config, uri: Uri): Promise<AnalysisOutcome> {
  const result = await analyzeFileDetailed(config, uri);
  return result.outcome;
}

export async function analyzeWorkspace(
  config: Config,
  workspaceFolder: Uri,
  notify?: {
    onStart?: (uriString: string, index: number, total: number) => void;
    onDone?: (uriString: string, count: number) => void;
    onFail?: (uriString: string, message: string) => void;
  },
  token?: CancellationToken
): Promise<WorkspaceResult> {
  const projectUris = await getWorkspaceProjects(workspaceFolder);
  return analyzeWorkspaceFromProjects(config, workspaceFolder, projectUris, notify, token);
}

export async function analyzeWorkspaceFromProjectsDetailed(
  config: Config,
  workspaceFolder: Uri,
  projectUris: string[],
  notify?: {
    onStart?: (uriString: string, index: number, total: number) => void;
    onDone?: (uriString: string, count: number) => void;
    onFail?: (uriString: string, message: string) => void;
  },
  token?: CancellationToken
): Promise<WorkspaceExecutionResult> {
  const results: ProjectResult[] = [];
  const context = createExecutionContext();
  let cancelled = false;

  for (let index = 0; index < projectUris.length; index++) {
    const uriString = projectUris[index];
    if (token?.isCancellationRequested) {
      Logger.log('Workspace analysis cancelled by user.');
      cancelled = true;
      break;
    }

    notify?.onStart?.(uriString, index + 1, projectUris.length);

    const result = await analyzeProjectDetailed(
      config,
      Uri.parse(uriString),
      workspaceFolder
    );
    results.push(result.projectResult);
    context.resolutionIssues.push(...result.context.resolutionIssues);

    if (isAnalysisCancelledProjectResult(result.projectResult)) {
      Logger.log('Workspace analysis cancelled by backend.');
      cancelled = true;
      break;
    }

    if (result.projectResult.error) {
      notify?.onFail?.(uriString, result.projectResult.error);
    } else {
      notify?.onDone?.(uriString, result.projectResult.findings.length);
    }
  }

  return { results, cancelled, context };
}

export async function analyzeWorkspaceFromProjects(
  config: Config,
  workspaceFolder: Uri,
  projectUris: string[],
  notify?: {
    onStart?: (uriString: string, index: number, total: number) => void;
    onDone?: (uriString: string, count: number) => void;
    onFail?: (uriString: string, message: string) => void;
  },
  token?: CancellationToken
): Promise<WorkspaceResult> {
  const result = await analyzeWorkspaceFromProjectsDetailed(
    config,
    workspaceFolder,
    projectUris,
    notify,
    token
  );
  return {
    results: result.results,
    cancelled: result.cancelled,
  };
}

export async function getWorkspaceProjects(workspaceFolder: Uri): Promise<string[]> {
  return getWorkspaceProjectUris(workspaceFolder);
}

async function analyzeProject(
  config: Config,
  project: ProjectRef,
  workspaceFolder: Uri
): Promise<ProjectResult> {
  const result = await analyzeProjectDetailed(config, project, workspaceFolder);
  return result.projectResult;
}

async function analyzeProjectDetailed(
  config: Config,
  project: ProjectRef,
  workspaceFolder: Uri
): Promise<{ projectResult: ProjectResult; context: AnalysisExecutionContext }> {
  const projectUri = normalizeProjectRef(project);
  const projectUriString = projectUri.toString();
  const context = createExecutionContext();

  try {
    const result = await resolveProjectAnalysisTargetDetailed(projectUri, workspaceFolder);
    context.resolutionIssues.push(...result.issues);

    if (result.resolution.status !== 'ok') {
      return {
        projectResult: {
          projectUri: projectUriString,
          findings: [],
          error: result.resolution.message,
          errorCode: result.resolution.errorCode,
        },
        context,
      };
    }

    try {
      const outcome = await runAnalysis(config, result.resolution.target);
      return {
        projectResult: projectResultFromOutcome(projectUriString, outcome),
        context,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        projectResult: { projectUri: projectUriString, findings: [], error: message },
        context,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      projectResult: { projectUri: projectUriString, findings: [], error: message },
      context,
    };
  }
}

async function runAnalysis(
  config: Config,
  context: AnalysisExecutionTarget
): Promise<AnalysisOutcome> {
  return runAnalysisTarget(config, context);
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  const message = String(error);
  return message.trim().length > 0 ? message.trim() : 'Unknown error';
}

function isAnalysisCancelledProjectResult(result: ProjectResult): boolean {
  return result.errorCode === ERROR_ANALYSIS_CANCELLED;
}

function normalizeProjectRef(project: ProjectRef): Uri {
  if (!project) {
    throw new Error('Project reference is required');
  }

  if (project instanceof Uri) {
    return project;
  }

  if (typeof project === 'string') {
    return Uri.parse(project);
  }

  throw new Error('Unsupported project reference');
}

function createExecutionContext(): AnalysisExecutionContext {
  return {
    resolutionIssues: [],
  };
}
