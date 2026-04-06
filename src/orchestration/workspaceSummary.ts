import type { AnalysisNotice } from '../model/analysisOutcome';
import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import { buildResolutionIssueNotices } from './analysisNotices';
import type { ProjectResult } from '../services/projectResult';
import { NO_CLASS_TARGETS_CODE } from '../workspace/analysisTargetCodes';

export function buildWorkspaceCompletionNotices(
  projectResults: ProjectResult[],
  findingCount: number,
  resolutionIssues: AnalysisResolutionIssue[] = []
): AnalysisNotice[] {
  const skippedCount = projectResults.filter(
    (result) => result.errorCode === NO_CLASS_TARGETS_CODE
  ).length;
  const failedCount = projectResults.filter(
    (result) => !!result.error && result.errorCode !== NO_CLASS_TARGETS_CODE
  ).length;
  const succeededCount = projectResults.length - skippedCount - failedCount;
  const hasTerminalFailure =
    (projectResults.length > 0 && skippedCount === projectResults.length) ||
    (failedCount > 0 && succeededCount === 0);
  const notices: AnalysisNotice[] = [];

  if (projectResults.length > 0 && skippedCount === projectResults.length) {
    notices.push(
      {
        level: 'warn',
        message: 'SpotBugs could not build the project. Run a manual build, then try again.',
      }
    );
  } else if (failedCount > 0) {
    const skippedSentence =
      skippedCount > 0
        ? ` ${formatProjectCount(skippedCount)} skipped because the build failed.`
        : '';

    if (succeededCount === 0) {
      notices.push(
        {
          level: 'error',
          message:
            `SpotBugs: Workspace analysis failed - ${formatProjectCount(failedCount)} failed.` +
            `${skippedSentence} See the SpotBugs view for project errors.`,
        }
      );
    } else {
      const successSummary =
        findingCount === 0
          ? 'Successful projects produced no findings.'
          : `${formatIssueCount(findingCount)} found in successful projects.`;

      notices.push({
        level: 'warn',
        message:
          `SpotBugs: Workspace analysis completed with failures - ${formatProjectCount(
            failedCount
          )} failed.` + `${skippedSentence} ${successSummary}`,
      });
    }
  } else {
    if (skippedCount > 0) {
      notices.push({
        level: 'warn',
        message:
          `SpotBugs skipped ${formatProjectCount(skippedCount)} because the build failed. ` +
          'Run a manual build, then try again.',
      });
    }

    notices.push({
      level: 'info',
      message:
        findingCount === 0
          ? 'SpotBugs: Workspace analysis completed - No issues found.'
          : `SpotBugs: Workspace analysis completed - ${formatIssueCount(findingCount)} found.`,
    });
  }

  notices.push(
    ...buildResolutionIssueNotices(resolutionIssues, {
      terminal: hasTerminalFailure,
    })
  );
  return dedupeNotices(notices);
}

function formatProjectCount(count: number): string {
  return `${count} project${count === 1 ? '' : 's'}`;
}

function formatIssueCount(count: number): string {
  return `${count} issue${count === 1 ? '' : 's'}`;
}

function dedupeNotices(notices: AnalysisNotice[]): AnalysisNotice[] {
  const deduped: AnalysisNotice[] = [];
  const seen = new Set<string>();

  for (const notice of notices) {
    const key = `${notice.level}|${notice.code ?? ''}|${notice.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(notice);
  }

  return deduped;
}
