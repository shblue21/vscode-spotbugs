import { Uri, type CancellationToken } from 'vscode';
import type { Config } from '../core/config';
import type { AnalysisPlan, AnalysisSelection, PlannedAnalysisUnit } from '../model/analysisPlan';
import { createAnalysisFailureOutcome } from './analysisExecution';
import { getProjectRootPaths } from '../workspace/projectDiscovery';
import { isPathInsideOrEqual, samePath } from '../workspace/pathIdentity';
import type { DiagnosticUpdateScope } from '../model/diagnosticScope';
import {
  resolveFileAnalysisTargetDetailed,
  resolveProjectAnalysisTargetDetailed,
} from '../workspace/analysisTargetResolver';

/** Resolve selections once; settings and result scopes travel with the plan. */
export async function planAnalysis(
  config: Config,
  selections: readonly AnalysisSelection[],
  token?: CancellationToken,
): Promise<AnalysisPlan> {
  const settings = selections.map(
    ({ resource }) =>
      Object.fromEntries(
        Object.entries(config.getAnalysisSettings(resource)).map(([key, value]) => [
          key,
          Array.isArray(value) ? [...value] : value,
        ]),
      ) as import('../core/config').AnalysisSettings,
  );
  const units: PlannedAnalysisUnit[] = [];
  const problems: Array<AnalysisPlan['problems'][number]> = [];
  const resolutionIssues: Array<AnalysisPlan['resolutionIssues'][number]> = [];
  for (const [selectionIndex, selection] of selections.entries()) {
    if (token?.isCancellationRequested) break;
    const { resource } = selection;
    try {
      const result =
        selection.kind === 'project'
          ? await resolveProjectAnalysisTargetDetailed(
              resource,
              selection.workspaceFolder ?? resource,
              token,
            )
          : await resolveFileAnalysisTargetDetailed(
              resource,
              token,
              selection.kind === 'artifact' ? 'artifact' : undefined,
            );
      resolutionIssues.push(...result.issues);
      if (token?.isCancellationRequested) {
        problems.push({
          selectionIndex,
          resource,
          outcome: createAnalysisFailureOutcome(
            resource.fsPath,
            'ANALYSIS_CANCELLED',
            'Analysis cancelled',
          ),
        });
        break;
      }
      if (result.resolution.status !== 'ok') {
        problems.push({
          selectionIndex,
          resource,
          outcome: {
            findings: [],
            targetPath: resource.fsPath,
            failure: {
              kind: 'target',
              level: 'warn',
              code: result.resolution.errorCode,
              message: result.resolution.message,
            },
          },
        });
        continue;
      }
      const { unit, diagnosticScope } = result.resolution.target;
      let scope: DiagnosticUpdateScope | undefined = diagnosticScope;
      if (selection.kind === 'project' && !selection.includeBaselineXml) {
        const projects = await getProjectRootPaths({ includeWorkspaceFallback: false, token });
        const knownOwner = projects.some((root) => samePath(root, resource.fsPath));
        scope = {
          kind: 'source-roots',
          uris: knownOwner
            ? (unit.sourceLookup.roots ?? [])
                .filter((root) => isPathInsideOrEqual(resource.fsPath, root))
                .map((root) => Uri.file(root))
            : [],
          excludedUris: projects
            .filter(
              (root) =>
                !samePath(root, resource.fsPath) && isPathInsideOrEqual(resource.fsPath, root),
            )
            .map((root) => Uri.file(root)),
        };
        if (token?.isCancellationRequested) throw new Error('Analysis cancelled');
      }
      units.push({
        ...unit,
        selectionIndex,
        resource,
        settings: settings[selectionIndex],
        inputs: unit.inputs.map((input) => ({ ...input })),
        diagnosticScope: scope,
        options: { ...unit.options, includeBaselineXml: selection.includeBaselineXml === true },
      });
    } catch (error) {
      if (token?.isCancellationRequested) {
        problems.push({
          selectionIndex,
          resource,
          outcome: createAnalysisFailureOutcome(
            resource.fsPath,
            'ANALYSIS_CANCELLED',
            'Analysis cancelled',
          ),
        });
        break;
      }
      problems.push({
        selectionIndex,
        resource,
        outcome: createAnalysisFailureOutcome(
          resource.fsPath,
          'ANALYSIS_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
      });
    }
  }
  return {
    selections: [...selections],
    units,
    problems,
    resolutionIssues,
    cancelled: token?.isCancellationRequested === true,
  };
}
