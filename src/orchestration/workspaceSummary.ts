import { l10n } from 'vscode';
import type { AnalysisNotice } from '../model/analysisOutcome';
import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import { buildResolutionIssueNotices, dedupeNotices } from './analysisNotices';
import type { ProjectResult } from '../services/projectResult';
import type { ProjectCleanupWarning } from '../services/analysisService';
import { NO_CLASS_TARGETS_CODE } from '../workspace/analysisTargetCodes';

export function buildWorkspaceCompletionNotices(
  projectResults: ProjectResult[],
  findingCount: number,
  resolutionIssues: AnalysisResolutionIssue[] = [],
  cleanupWarnings: ProjectCleanupWarning[] = [],
): AnalysisNotice[] {
  const skippedCount = projectResults.filter(
    (result) => result.errorCode === NO_CLASS_TARGETS_CODE,
  ).length;
  const failedCount = projectResults.filter(
    (result) => !!result.error && result.errorCode !== NO_CLASS_TARGETS_CODE,
  ).length;
  const succeededCount = projectResults.length - skippedCount - failedCount;
  const hasTerminalFailure =
    (projectResults.length > 0 && skippedCount === projectResults.length) ||
    (failedCount > 0 && succeededCount === 0);
  const cleanupWarningSentence = buildCleanupWarningSentence(cleanupWarnings);
  const hasIncompleteAnalysisWarnings = cleanupWarnings.some(
    ({ warning }) => warning.code === 'ANALYSIS_INCOMPLETE',
  );
  const notices: AnalysisNotice[] = [];

  const skippedMessage =
    skippedCount > 0 && skippedCount < projectResults.length
      ? l10n.t(
          'Skipped {0} of {1} projects because no compiled classes were found.',
          skippedCount,
          projectResults.length,
        )
      : '';

  if (projectResults.length > 0 && skippedCount === projectResults.length) {
    notices.push({
      level: 'warn',
      message:
        l10n.t(
          'SpotBugs could not find compiled classes to analyze. Run a manual build, then try again.',
        ) + cleanupWarningSentence,
    });
  } else if (failedCount > 0) {
    const skippedSentence = skippedMessage ? ` ${skippedMessage}` : '';
    if (succeededCount === 0) {
      notices.push({
        level: 'error',
        message:
          l10n.t('SpotBugs: Workspace analysis failed. Failed projects: {0}.', failedCount) +
          `${skippedSentence} ${l10n.t('See the SpotBugs view for project errors.')}` +
          cleanupWarningSentence,
      });
    } else {
      const successSummary =
        findingCount === 0
          ? l10n.t('Successful projects produced no findings.')
          : l10n.t('Findings in successful projects: {0}.', findingCount);

      notices.push({
        level: 'warn',
        message:
          l10n.t('SpotBugs: Analysis completed. Failed projects: {0}.', failedCount) +
          `${skippedSentence} ${successSummary}` +
          cleanupWarningSentence,
      });
    }
  } else {
    if (skippedCount > 0) {
      notices.push({
        level: 'warn',
        message:
          skippedMessage +
          ' ' +
          l10n.t('Run a manual build, then try again.') +
          cleanupWarningSentence,
      });
    }

    notices.push({
      level: cleanupWarningSentence.length > 0 && skippedCount === 0 ? 'warn' : 'info',
      message:
        (findingCount === 0
          ? hasIncompleteAnalysisWarnings
            ? l10n.t('SpotBugs: Workspace analysis completed - No findings reported.')
            : skippedCount > 0
              ? l10n.t(
                  'SpotBugs: Workspace analysis completed - No issues found in analyzed projects.',
                )
              : l10n.t('SpotBugs: Workspace analysis completed - No issues found.')
          : l10n.t('SpotBugs: Workspace analysis completed. Findings: {0}.', findingCount)) +
        (skippedCount === 0 ? cleanupWarningSentence : ''),
    });
  }

  notices.push(
    ...buildResolutionIssueNotices(resolutionIssues, {
      terminal: hasTerminalFailure,
    }),
  );
  return dedupeNotices(notices);
}

function buildCleanupWarningSentence(cleanupWarnings: ProjectCleanupWarning[]): string {
  const uniqueProjectCount = new Set(cleanupWarnings.map((warning) => warning.projectUri)).size;
  if (uniqueProjectCount === 0) {
    return '';
  }
  return (
    ' ' +
    l10n.t('Projects with warnings: {0}. See the SpotBugs output for details.', uniqueProjectCount)
  );
}
