import { AnalysisNotice, AnalysisOutcome } from '../model/analysisOutcome';

export interface BuildAnalysisNoticeOptions {
  includeHints?: boolean;
}

export function buildAnalysisNotices(
  outcome: AnalysisOutcome,
  options: BuildAnalysisNoticeOptions = {}
): AnalysisNotice[] {
  const notices: AnalysisNotice[] = [];

  if (outcome.failure) {
    notices.push({
      level: outcome.failure.level,
      code: outcome.failure.code,
      message: outcome.failure.message,
    });
    return notices;
  }

  if (Array.isArray(outcome.errors) && outcome.errors.length > 0) {
    const combined = combineErrorMessages(outcome.errors);
    if (outcome.findings.length === 0) {
      notices.push({
        level: 'error',
        message: `SpotBugs analysis failed: ${combined}`,
      });
      return notices;
    }
    notices.push({
      level: 'warn',
      message: `SpotBugs analysis completed with warnings: ${combined}`,
    });
  }

  if (options.includeHints && outcome.findings.length === 0) {
    const targetPath = outcome.targetPath ?? outcome.stats?.target;
    if (targetPath) {
      notices.push(...buildHintNotices(targetPath, outcome));
    }
  }

  return notices;
}

function combineErrorMessages(
  errors: Array<{ code?: string; message?: string }>
): string {
  const messages = errors.map((err) => {
    const code = err.code ? `[${err.code}]` : '';
    const message = err.message || 'Unknown error';
    return `${code} ${message}`.trim();
  });
  return messages.join('; ');
}

function buildHintNotices(targetPath: string, outcome: AnalysisOutcome): AnalysisNotice[] {
  const notices: AnalysisNotice[] = [];
  const target = targetPath.replace(/\\/g, '/').toLowerCase();
  const isBytecodeTarget =
    target.endsWith('.class') || target.endsWith('.jar') || target.endsWith('.zip');
  const looksLikeSourceTarget = target.endsWith('.java') || target.includes('/src/');
  const classpathCount =
    typeof outcome.stats?.classpathCount === 'number' ? outcome.stats.classpathCount : undefined;
  const targetCount =
    typeof outcome.stats?.targetCount === 'number' ? outcome.stats.targetCount : undefined;

  if (!isBytecodeTarget) {
    if (targetCount === 0) {
      if ((classpathCount ?? 0) === 0) {
        notices.push({
          level: 'warn',
          message:
            'SpotBugs: No compiled classes found (classpath unavailable). Make sure the target is inside a Java project and build the workspace.',
        });
      } else {
        notices.push({
          level: 'warn',
          message:
            'SpotBugs: No compiled classes found for the selected target. Build the project or select an output folder (e.g. build/classes or target/classes).',
        });
      }
    } else if (looksLikeSourceTarget && (classpathCount ?? 0) === 0) {
      notices.push({
        level: 'warn',
        message:
          'SpotBugs: Classpath is unavailable for this target; results may be incomplete. Try building the workspace and re-run.',
      });
    }
  }

  return notices;
}
