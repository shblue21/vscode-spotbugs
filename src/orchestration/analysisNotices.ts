import type { AnalysisResolutionIssue } from '../lsp/javaLsOutcome';
import { AnalysisNotice, AnalysisOutcome } from '../model/analysisOutcome';
import { formatAnalysisErrors } from '../model/analysisErrors';

export interface BuildAnalysisNoticeOptions {
  includeHints?: boolean;
  resolutionIssues?: AnalysisResolutionIssue[];
}

export function buildAnalysisNotices(
  outcome: AnalysisOutcome,
  options: BuildAnalysisNoticeOptions = {}
): AnalysisNotice[] {
  const notices: AnalysisNotice[] = [];
  const hasTerminalFailure =
    !!outcome.failure ||
    (Array.isArray(outcome.errors) &&
      outcome.errors.length > 0 &&
      outcome.findings.length === 0);

  if (outcome.failure) {
    notices.push({
      level: outcome.failure.level,
      code: outcome.failure.code,
      message: outcome.failure.message,
    });
  }

  if (Array.isArray(outcome.errors) && outcome.errors.length > 0) {
    const combined = formatAnalysisErrors(outcome.errors);
    if (outcome.findings.length === 0) {
      if (!outcome.failure) {
        notices.push({
          level: 'error',
          message: `SpotBugs analysis failed: ${combined}`,
        });
      }
    } else {
      notices.push({
        level: 'warn',
        message: `SpotBugs analysis completed with warnings: ${combined}`,
      });
    }
  }

  notices.push(
    ...buildResolutionIssueNotices(options.resolutionIssues ?? [], {
      terminal: hasTerminalFailure,
    })
  );

  if (!hasTerminalFailure && options.includeHints && outcome.findings.length === 0) {
    const targetPath = outcome.targetPath ?? outcome.stats?.target;
    if (targetPath) {
      notices.push(...buildHintNotices(targetPath, outcome));
    }
  }

  return dedupeNotices(notices);
}

export function buildResolutionIssueNotices(
  issues: AnalysisResolutionIssue[],
  context: {
    terminal?: boolean;
  } = {}
): AnalysisNotice[] {
  if (issues.length === 0) {
    return [];
  }

  const hasSpecificWorkspaceCause = issues.some(
    (issue) =>
      issue.phase === 'get-all-projects' &&
      (issue.code === 'JAVA_LS_EMPTY_PROJECT_LIST' ||
        issue.code === 'JAVA_LS_REQUEST_FAILED' ||
        issue.code === 'JAVA_LS_NO_RESULT')
  );
  const noResultChangedBehavior = issues.some(
    (issue) =>
      issue.code === 'WORKSPACE_FALLBACK_USED' ||
      issue.code === 'OUTPUT_FALLBACK_USED' ||
      issue.code === 'JAVA_LS_EMPTY_RUNTIME_CLASSPATH'
  );

  const notices = issues
    .map((issue) =>
      translateResolutionIssue(issue, {
        hasSpecificWorkspaceCause,
        noResultChangedBehavior,
        terminal: context.terminal === true,
      })
    )
    .filter((notice): notice is AnalysisNotice => !!notice);

  return dedupeNotices(notices, semanticNoticeKey);
}

function buildHintNotices(targetPath: string, outcome: AnalysisOutcome): AnalysisNotice[] {
  const notices: AnalysisNotice[] = [];
  const target = targetPath.replace(/\\/g, '/').toLowerCase();
  const isBytecodeTarget =
    target.endsWith('.class') || target.endsWith('.jar') || target.endsWith('.zip');
  const looksLikeSourceTarget = target.endsWith('.java') || target.includes('/src/');
  const targetResolutionRootCount =
    typeof outcome.stats?.targetResolutionRootCount === 'number'
      ? outcome.stats.targetResolutionRootCount
      : undefined;
  const targetCount =
    typeof outcome.stats?.targetCount === 'number' ? outcome.stats.targetCount : undefined;

  if (!isBytecodeTarget) {
    if (targetCount === 0) {
      if ((targetResolutionRootCount ?? 0) === 0) {
        notices.push({
          level: 'warn',
          message:
            'SpotBugs: No compiled classes found (target-resolution roots unavailable). Make sure the target is inside a Java project and build the workspace.',
        });
      } else {
        notices.push({
          level: 'warn',
          message:
            'SpotBugs: No compiled classes found for the selected target. Build the project or select an output folder (e.g. build/classes or target/classes).',
        });
      }
    } else if (looksLikeSourceTarget && (targetResolutionRootCount ?? 0) === 0) {
      notices.push({
        level: 'warn',
        message:
          'SpotBugs: Target-resolution roots are unavailable for this target; results may be incomplete. Try building the workspace and re-run.',
      });
    }
  }

  return notices;
}

function translateResolutionIssue(
  issue: AnalysisResolutionIssue,
  context: {
    hasSpecificWorkspaceCause: boolean;
    noResultChangedBehavior: boolean;
    terminal: boolean;
  }
): AnalysisNotice | undefined {
  switch (issue.code) {
    case 'JAVA_LS_EXTENSION_FALLBACK_USED':
      return undefined;
    case 'JAVA_LS_EMPTY_RUNTIME_CLASSPATH':
      return {
        level: 'warn',
        code: issue.code,
        message:
          'SpotBugs: Java runtime classpath information is unavailable; results may be incomplete.',
      };
    case 'WORKSPACE_FALLBACK_USED':
      if (context.hasSpecificWorkspaceCause) {
        return undefined;
      }
      return {
        level: 'info',
        code: issue.code,
        message:
          'SpotBugs: Java project discovery was unavailable, so workspace-folder analysis was used.',
      };
    case 'JAVA_LS_REQUEST_FAILED':
      return translateJavaLsLookupFallbackNotice(issue, context);
    case 'JAVA_LS_EMPTY_PROJECT_LIST':
      return {
        level: 'info',
        code: issue.code,
        message:
          'SpotBugs: No Java projects were reported by the Java Language Server; workspace-folder analysis was used.',
      };
    case 'OUTPUT_FALLBACK_USED':
      return {
        level: 'info',
        code: issue.code,
        message:
          'SpotBugs: Java build output metadata was unavailable; output folder fallback was used.',
      };
    case 'JAVA_LS_NO_RESULT':
      return translateJavaLsLookupFallbackNotice(issue, context);
    default:
      return undefined;
  }
}

function translateJavaLsLookupFallbackNotice(
  issue: AnalysisResolutionIssue,
  context: {
    noResultChangedBehavior: boolean;
    terminal: boolean;
  }
): AnalysisNotice | undefined {
  if (context.terminal) {
    return undefined;
  }

  if (issue.code === 'JAVA_LS_NO_RESULT' && !context.noResultChangedBehavior) {
    return undefined;
  }

  return {
    level: 'warn',
    code: issue.code,
    message:
      'SpotBugs: Java project metadata lookup failed; analysis continued with fallback behavior.',
  };
}

function dedupeNotices(
  notices: AnalysisNotice[],
  keyBuilder: (notice: AnalysisNotice) => string = exactNoticeKey
): AnalysisNotice[] {
  const deduped: AnalysisNotice[] = [];
  const seen = new Set<string>();

  for (const notice of notices) {
    const key = keyBuilder(notice);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(notice);
  }

  return deduped;
}

function exactNoticeKey(notice: AnalysisNotice): string {
  return `${notice.level}|${notice.code ?? ''}|${notice.message}`;
}

function semanticNoticeKey(notice: AnalysisNotice): string {
  const code =
    notice.code === 'JAVA_LS_NO_RESULT' ? 'JAVA_LS_REQUEST_FAILED' : notice.code ?? '';
  return `${notice.level}|${code}|${notice.message}`;
}
