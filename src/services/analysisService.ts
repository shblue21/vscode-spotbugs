import { CancellationToken, Uri } from 'vscode';
import type { Config } from '../core/config';
import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import type { AnalysisOutcome } from '../model/analysisOutcome';
import type { AnalysisWarning } from '../model/analysisProtocol';
import type { DiagnosticUpdateScope } from '../model/diagnosticScope';
import type { AnalysisPlan, AnalysisSelection } from '../model/analysisPlan';
import type { AnalysisReportRun } from '../model/analysisReport';
import { createAnalysisFailureOutcome, runAnalysisTarget } from './analysisExecution';
import { projectResultFromOutcome, type ProjectResult } from './projectResult';
import { planAnalysis } from './analysisPlanner';
import { NO_CLASS_TARGETS_CODE, NO_CLASS_TARGETS_MESSAGE } from '../workspace/analysisTargetCodes';

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
  cancelled?: boolean;
  reportRuns?: AnalysisReportRun[];
  context: AnalysisExecutionContext;
}
export interface WorkspaceExecutionResult {
  results: ProjectResult[];
  cancelled?: boolean;
  context: AnalysisExecutionContext;
}
export interface AnalysisProgressCallbacks {
  onStart?: (uri: string, index: number, total: number) => void;
  onDone?: (uri: string, count: number) => void;
  onFail?: (uri: string, message: string) => void;
}
export interface PlanExecutionResult extends WorkspaceExecutionResult {
  outcomes: Array<{
    selectionIndex: number;
    outcome: AnalysisOutcome;
    diagnosticScope?: DiagnosticUpdateScope;
  }>;
}

/** The only loop executing SpotBugs runs, for every public analysis command. */
export async function executeAnalysisPlan(
  plan: AnalysisPlan,
  notify?: AnalysisProgressCallbacks,
  token?: CancellationToken,
): Promise<PlanExecutionResult> {
  const result: PlanExecutionResult = {
    results: [],
    outcomes: [],
    cancelled: plan.cancelled,
    context: { resolutionIssues: [...plan.resolutionIssues], cleanupWarnings: [] },
  };
  if (plan.cancelled) {
    for (const problem of plan.problems.filter(
      (item) => item.outcome.failure?.code === 'ANALYSIS_CANCELLED',
    )) {
      result.outcomes.push({ selectionIndex: problem.selectionIndex, outcome: problem.outcome });
      result.results.push(projectResultFromOutcome(problem.resource.toString(), problem.outcome));
    }
    return result;
  }
  const work = [
    ...plan.units.map((unit) => ({
      selectionIndex: unit.selectionIndex,
      resource: unit.resource,
      unit,
      outcome: undefined as AnalysisOutcome | undefined,
    })),
    ...plan.problems.map((problem) => ({ ...problem, unit: undefined })),
  ].sort((left, right) => left.selectionIndex - right.selectionIndex);
  for (const [index, item] of work.entries()) {
    if (result.cancelled || token?.isCancellationRequested) {
      result.cancelled = true;
      break;
    }
    const selection = plan.selections[item.selectionIndex];
    const uri = item.resource.toString();
    notify?.onStart?.(uri, index + 1, work.length);
    const unit = item.unit;
    let outcome = item.outcome;
    if (unit) {
      try {
        outcome = await runAnalysisTarget(
          { getAnalysisSettings: () => unit.settings },
          unit,
          token,
        );
      } catch (error) {
        outcome = createAnalysisFailureOutcome(
          unit.inputs[0].path,
          'ANALYSIS_FAILED',
          error instanceof Error ? error.message : String(error),
        );
        if (selection.kind === 'project' && outcome.failure)
          outcome.failure.message = error instanceof Error ? error.message : String(error);
      }
    }
    if (!outcome) throw new Error('Analysis plan has no unit or problem for its selection');
    result.outcomes.push({
      selectionIndex: item.selectionIndex,
      outcome,
      diagnosticScope: unit?.diagnosticScope,
    });
    const project = projectResultFromOutcome(uri, outcome);
    result.results.push(project);
    result.context.cleanupWarnings?.push(
      ...(outcome.warnings ?? []).map((warning) => ({ projectUri: uri, warning })),
    );
    if (token?.isCancellationRequested || project.errorCode === 'ANALYSIS_CANCELLED') {
      result.cancelled = true;
      break;
    }
    if (project.error) notify?.onFail?.(uri, project.error);
    else notify?.onDone?.(uri, project.findings.length);
  }
  return result;
}

export async function analyzeFileDetailed(
  config: Config,
  uri: Uri,
  token?: CancellationToken,
  kind: AnalysisSelection['kind'] = 'source',
): Promise<AnalysisExecutionResult> {
  const plan = await planAnalysis(config, [{ kind, resource: uri }], token);
  const result = await executeAnalysisPlan(plan, undefined, token);
  return summarizeResourceResults(uri, result);
}

/** Keep native runs separate; the outcome is only the resource-level presentation. */
export function summarizeResourceResults(
  uri: Uri,
  result: PlanExecutionResult,
): AnalysisExecutionResult {
  const outcomes = result.outcomes.map((entry) => entry.outcome);
  const failure = outcomes.find((outcome) => outcome.failure)?.failure;
  const outcome: AnalysisOutcome = result.cancelled
    ? createAnalysisFailureOutcome(uri.fsPath, 'ANALYSIS_CANCELLED', 'Analysis cancelled')
    : outcomes.length === 0
      ? createAnalysisFailureOutcome(uri.fsPath, NO_CLASS_TARGETS_CODE, NO_CLASS_TARGETS_MESSAGE)
      : outcomes.length === 1
        ? outcomes[0]
        : {
            findings: outcomes.flatMap((entry) => entry.findings),
            targetPath: uri.fsPath,
            ...(failure ? { failure } : {}),
            errors: outcomes.flatMap((entry) => entry.errors ?? []),
            warnings: outcomes.flatMap((entry) => entry.warnings ?? []),
          };
  // Apply a resource only when every result describes the same replacement scope.
  const scopes = result.outcomes.map((entry) => entry.diagnosticScope);
  const scopeKey = (scope: DiagnosticUpdateScope | undefined) => {
    if (!scope) return '';
    return scope.kind === 'source-roots'
      ? JSON.stringify([scope.kind, [...new Set(scope.uris.map((uri) => uri.toString()))].sort(),
          [...new Set((scope.excludedUris ?? []).map((uri) => uri.toString()))].sort()])
      : JSON.stringify([scope.kind, scope.uri.toString()]);
  };
  const sameScope = scopes.every((scope) => scopeKey(scope) === scopeKey(scopes[0]));
  return {
    cancelled: result.cancelled === true,
    outcome:
      !failure && !result.cancelled && !sameScope
        ? {
            ...outcome,
            failure: {
              kind: 'target',
              level: 'error',
              code: 'ANALYSIS_SCOPE_MISMATCH',
              message: 'Analysis units have incompatible result scopes.',
            },
          }
        : outcome,
    reportRuns: outcomes.map((entry) => ({
      projectUri: uri.toString(),
      findings: entry.findings,
      ...(entry.failure
        ? {
            analysisStatus:
              entry.failure.code === NO_CLASS_TARGETS_CODE
                ? ('skipped' as const)
                : ('failed' as const),
          }
        : {}),
      spotbugsVersion: entry.stats?.spotbugsVersion,
      summary: entry.reportSummary,
      nativeSarif: entry.nativeSarif,
      baselineXml: entry.baselineXml,
    })),
    context: { ...result.context, diagnosticScope: scopes[0] },
  };
}

export async function analyzeWorkspaceFromProjectsDetailed(
  config: Config,
  workspaceFolder: Uri,
  projectUris: string[],
  notify?: AnalysisProgressCallbacks,
  token?: CancellationToken,
): Promise<WorkspaceExecutionResult> {
  const plan = await planAnalysis(
    config,
    projectUris.map((uri) => ({
      kind: 'project',
      resource: Uri.parse(uri),
      workspaceFolder,
      includeBaselineXml: true,
    })),
    token,
  );
  return executeAnalysisPlan(plan, notify, token);
}
