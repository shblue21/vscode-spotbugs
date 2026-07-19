import type { CancellationToken, Uri, WorkspaceFolder } from 'vscode';
import type { Config } from '../core/config';
import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import type { Notifier } from '../core/notifier';
import type { AnalysisNotice } from '../model/analysisOutcome';
import type { DiagnosticUpdateScope } from '../model/diagnosticScope';
import type { Finding } from '../model/finding';
import type { AnalysisReportRun } from '../model/analysisReport';
import type {
  AnalysisExecutionResult,
  ProjectCleanupWarning,
  WorkspaceExecutionResult,
} from '../services/analysisService';
import type { ProjectResult } from '../services/projectResult';
import type { WorkspaceProjectDiscoveryResult } from '../workspace/projectDiscovery';
import type { AnalysisRunLease } from './analysisRunCoordinator';
import { JavaCompileWorkspaceStatus } from '../constants/commands';
import { buildAnalysisNotices } from './analysisNotices';
import { buildWorkspaceCompletionNotices } from './workspaceSummary';

const ERROR_ANALYSIS_CANCELLED = 'ANALYSIS_CANCELLED';

export interface AnalysisLogger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface AnalysisProgressReporter {
  report(value: { message?: string; increment?: number }): void;
}

export type AnalysisProgressRunner = (
  task: (
    progress: AnalysisProgressReporter,
    token: CancellationToken
  ) => Promise<void>
) => Promise<void>;

export interface FileAnalysisSessionTree {
  showLoading(): void;
  showResults(findings: Finding[], reportRun?: AnalysisReportRun): void;
  showAnalysisFailure(message: string, code?: string): void;
}

export interface WorkspaceAnalysisSessionTree {
  showAnalysisFailure(message: string, code?: string): void;
  showWorkspaceProgress(projectUris: string[]): void;
  updateProjectStatus(
    uriString: string,
    status: 'pending' | 'running' | 'done' | 'failed' | 'skipped',
    extra?: { count?: number; error?: string }
  ): void;
  showWorkspaceCancelled(): void;
  showWorkspaceResults(projectResults: ProjectResult[]): void;
}

export interface AnalysisSessionDiagnostics {
  replaceForScope(scope: DiagnosticUpdateScope, findings: Finding[]): void;
  replaceAll(findings: Finding[]): void;
}

export interface WorkspaceProgressCallbacks {
  onStart?: (uriString: string, index: number, total: number) => void;
  onDone?: (uriString: string, count: number) => void;
  onFail?: (uriString: string, message: string) => void;
}

export interface AnalysisSessionDependencies {
  analyzeFileDetailed(
    config: Config,
    uri: Uri,
    token?: CancellationToken
  ): Promise<AnalysisExecutionResult>;
  analyzeWorkspaceFromProjectsDetailed(
    config: Config,
    workspaceFolder: Uri,
    projectUris: string[],
    notify?: WorkspaceProgressCallbacks,
    token?: CancellationToken
  ): Promise<WorkspaceExecutionResult>;
  buildWorkspaceAuto(token?: CancellationToken): Promise<number | undefined>;
  getPrimaryWorkspaceFolder(): WorkspaceFolder | undefined;
  getWorkspaceProjectDiscovery(
    workspaceFolder: Uri
  ): Promise<WorkspaceProjectDiscoveryResult>;
  logger: AnalysisLogger;
  now(): number;
}

export interface RunFileAnalysisSessionArgs {
  config: Config;
  tree: FileAnalysisSessionTree;
  diagnostics: AnalysisSessionDiagnostics;
  notifier: Notifier;
  uri: Uri;
  startedAtMs: number;
  lease: AnalysisRunLease;
  dependencies: AnalysisSessionDependencies;
}

export interface RunWorkspaceAnalysisSessionArgs {
  config: Config;
  tree: WorkspaceAnalysisSessionTree;
  diagnostics: AnalysisSessionDiagnostics;
  notifier: Notifier;
  runWithProgress: AnalysisProgressRunner;
  lease: AnalysisRunLease;
  dependencies: AnalysisSessionDependencies;
}

export async function runFileAnalysisSession(
  args: RunFileAnalysisSessionArgs
): Promise<void> {
  const { dependencies } = args;
  if (!args.lease.isCurrent()) {
    return;
  }
  args.tree.showLoading();

  try {
    const result = await dependencies.analyzeFileDetailed(
      args.config,
      args.uri,
      args.lease.token
    );
    if (!args.lease.isCurrent()) {
      return;
    }
    const outcome = result.outcome;
    const findings = outcome.findings;

    if (outcome.failure) {
      args.tree.showAnalysisFailure(outcome.failure.message, outcome.failure.code);
    } else {
      args.tree.showResults(findings, {
        projectUri: args.uri.toString(),
        findings,
        spotbugsVersion: outcome.stats?.spotbugsVersion,
        summary: outcome.reportSummary,
        nativeSarif: outcome.nativeSarif,
      });
      args.diagnostics.replaceForScope(
        result.context.diagnosticScope ?? { kind: 'file', uri: args.uri },
        findings
      );
    }

    emitNotices(
      args.notifier,
      buildAnalysisNotices(outcome, {
        includeHints: true,
        resolutionIssues: result.context.resolutionIssues,
      })
    );

    dependencies.logger.log(
      `File analysis finished: elapsedMs=${dependencies.now() - args.startedAtMs}, file=${args.uri.fsPath}, findings=${findings.length}`
    );
  } catch (error) {
    const errorMessage = messageFromUnknown(error);
    const failureMessage = `SpotBugs analysis failed: ${errorMessage}`;
    dependencies.logger.error('An error occurred during SpotBugs analysis', error);
    if (!args.lease.isCurrent()) {
      return;
    }
    args.notifier.error(failureMessage);
    args.tree.showAnalysisFailure(failureMessage, 'ANALYSIS_FAILED');
  }
}

export async function runWorkspaceAnalysisSession(
  args: RunWorkspaceAnalysisSessionArgs
): Promise<void> {
  const { dependencies } = args;
  if (!args.lease.isCurrent()) {
    return;
  }
  try {
    let aggregated: Finding[] = [];
    let projectResults: ProjectResult[] = [];
    let resolutionIssues: AnalysisResolutionIssue[] = [];
    let cleanupWarnings: ProjectCleanupWarning[] = [];
    let cancelled = false;

    await args.runWithProgress(async (progress, token) => {
      if (!args.lease.isCurrent()) {
        return;
      }
      progress.report({ message: 'Building Java workspace...' });
      const buildResult = await dependencies.buildWorkspaceAuto(token);
      if (!args.lease.isCurrent()) {
        return;
      }
      if (
        token.isCancellationRequested ||
        buildResult === JavaCompileWorkspaceStatus.cancelled
      ) {
        cancelled = true;
        return;
      }
      if (buildResult !== undefined && buildResult !== 0) {
        dependencies.logger.log(
          `Java workspace build returned non-zero (${String(
            buildResult
          )}). Proceeding with best-effort analysis...`
        );
      }

      const wsFolder = dependencies.getPrimaryWorkspaceFolder();
      if (!wsFolder) {
        dependencies.logger.error('No workspace folder found.');
        throw new Error('No workspace folder found.');
      }

      const discovery = await dependencies.getWorkspaceProjectDiscovery(wsFolder.uri);
      if (!args.lease.isCurrent()) {
        return;
      }
      if (token.isCancellationRequested) {
        cancelled = true;
        return;
      }
      args.tree.showWorkspaceProgress(discovery.projectUris);

      const res = await dependencies.analyzeWorkspaceFromProjectsDetailed(
        args.config,
        wsFolder.uri,
        discovery.projectUris,
        {
          onStart: (uriString, index, total) => {
            if (!args.lease.isCurrent()) {
              return;
            }
            progress.report({ message: `${index}/${total} ${uriString}` });
            args.tree.updateProjectStatus(uriString, 'running');
          },
          onDone: (uriString, count) => {
            if (args.lease.isCurrent()) {
              args.tree.updateProjectStatus(uriString, 'done', { count });
            }
          },
          onFail: (uriString, message) => {
            if (args.lease.isCurrent()) {
              args.tree.updateProjectStatus(uriString, 'failed', { error: message });
            }
          },
        },
        token
      );

      if (!args.lease.isCurrent()) {
        return;
      }
      projectResults = res.results;
      aggregated = res.results.flatMap((result) => result.findings);
      resolutionIssues = [...discovery.issues, ...res.context.resolutionIssues];
      cleanupWarnings = res.context.cleanupWarnings ?? [];
      cancelled =
        res.cancelled === true ||
        token.isCancellationRequested ||
        res.results.some(isAnalysisCancelledProjectResult);
    });

    if (!args.lease.isCurrent()) {
      return;
    }
    if (cancelled) {
      args.tree.showWorkspaceCancelled();
      return;
    }

    args.tree.showWorkspaceResults(projectResults);
    if (projectResults.every((result) => !result.error)) {
      args.diagnostics.replaceAll(aggregated);
    }

    emitNotices(
      args.notifier,
      buildWorkspaceCompletionNotices(
        projectResults,
        aggregated.length,
        resolutionIssues,
        cleanupWarnings
      )
    );
  } catch (error) {
    renderWorkspaceAnalysisFailure(args, error);
  }
}

export function messageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  const message = String(error);
  return message.trim().length > 0 ? message.trim() : 'Unknown error';
}

function emitNotices(notifier: Notifier, notices: AnalysisNotice[]): void {
  for (const notice of notices) {
    if (notice.level === 'error') {
      notifier.error(notice.message);
    } else if (notice.level === 'warn') {
      notifier.warn(notice.message);
    } else {
      notifier.info(notice.message);
    }
  }
}

function renderWorkspaceAnalysisFailure(
  args: RunWorkspaceAnalysisSessionArgs,
  error: unknown
): void {
  const errorMessage = messageFromUnknown(error);
  args.dependencies.logger.error('An error occurred during workspace analysis', error);
  if (!args.lease.isCurrent()) {
    return;
  }
  args.notifier.error(`SpotBugs: Workspace analysis failed - ${errorMessage}`);
  args.tree.showAnalysisFailure(
    `SpotBugs workspace analysis failed: ${errorMessage}`,
    'WORKSPACE_ANALYSIS_FAILED'
  );
}

function isAnalysisCancelledProjectResult(result: ProjectResult): boolean {
  return result.errorCode === ERROR_ANALYSIS_CANCELLED;
}
