import { CancellationToken, Uri } from 'vscode';
import { Logger } from '../core/logger';
import { Config } from '../core/config';
import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import type { AnalysisOutcome } from '../model/analysisOutcome';
import type { AnalysisWarning } from '../model/analysisProtocol';
import type { DiagnosticUpdateScope } from '../model/diagnosticScope';
import type { ProjectResult } from './projectResult';
import { projectResultFromOutcome } from './projectResult';
import {
  type AnalysisConfigProvider,
  createAnalysisFailureOutcome,
  runAnalysisTarget,
} from './analysisExecution';
import {
  resolveFileAnalysisTargetDetailed,
  resolveProjectAnalysisTargetDetailed,
} from '../workspace/analysisTargetResolver';

const ERROR_ANALYSIS_FAILED = 'ANALYSIS_FAILED';
const ERROR_ANALYSIS_CANCELLED = 'ANALYSIS_CANCELLED';

export { NO_CLASS_TARGETS_CODE } from '../workspace/analysisTargetCodes';
export type { ProjectResult } from './projectResult';

export interface ProjectCleanupWarning {
  projectUri: string;
  warning: AnalysisWarning;
}

export interface AnalysisExecutionContext {
  resolutionIssues: AnalysisResolutionIssue[];
  cleanupWarnings?: ProjectCleanupWarning[];
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
  uri: Uri,
  token?: CancellationToken
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
        outcome: await runAnalysisTarget(config, result.resolution.target, token),
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
  const projectSettings = projectUris.map((uriString) =>
    config.getAnalysisSettings(Uri.parse(uriString))
  );
  let cancelled = false;

  for (let index = 0; index < projectUris.length; index++) {
    const uriString = projectUris[index];
    if (token?.isCancellationRequested) {
      Logger.log('Workspace analysis cancelled by user.');
      cancelled = true;
      break;
    }

    notify?.onStart?.(uriString, index + 1, projectUris.length);

    const analysisConfig: AnalysisConfigProvider = {
      getAnalysisSettings: () => projectSettings[index],
    };
    const result = await analyzeProjectDetailed(
      analysisConfig,
      Uri.parse(uriString),
      workspaceFolder,
      token
    );
    results.push(result.projectResult);
    context.resolutionIssues.push(...result.context.resolutionIssues);
    context.cleanupWarnings?.push(...(result.context.cleanupWarnings ?? []));

    if (
      token?.isCancellationRequested ||
      isAnalysisCancelledProjectResult(result.projectResult)
    ) {
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

async function analyzeProjectDetailed(
  config: AnalysisConfigProvider,
  projectUri: Uri,
  workspaceFolder: Uri,
  token?: CancellationToken
): Promise<{ projectResult: ProjectResult; context: AnalysisExecutionContext }> {
  const projectUriString = projectUri.toString();
  const context = createExecutionContext();

  try {
    const result = await resolveProjectAnalysisTargetDetailed(projectUri, workspaceFolder);
    context.resolutionIssues.push(...result.issues);

    if (token?.isCancellationRequested) {
      return { projectResult: cancelledProjectResult(projectUriString), context };
    }

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

    const outcome = await runAnalysisTarget(
      config,
      { ...result.resolution.target, includeBaselineXml: true },
      token
    );
    if (Array.isArray(outcome.warnings)) {
      context.cleanupWarnings?.push(
        ...outcome.warnings.map((warning) => ({
          projectUri: projectUriString,
          warning,
        }))
      );
    }
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

function cancelledProjectResult(projectUri: string): ProjectResult {
  return {
    projectUri,
    findings: [],
    errorCode: ERROR_ANALYSIS_CANCELLED,
  };
}

function createExecutionContext(): AnalysisExecutionContext {
  return {
    resolutionIssues: [],
    cleanupWarnings: [],
  };
}
