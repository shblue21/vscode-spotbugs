import { Uri } from 'vscode';
import { Logger } from '../core/logger';
import { getJavaExtension } from '../core/utils';
import {
  JavaLsClasspathResponse,
  requestJavaClasspaths,
} from '../lsp/javaLsGateway';
import type {
  AnalysisResolutionIssue,
  ClasspathLookupOutcome,
} from '../lsp/javaLsOutcome';
import { ClasspathAttempt } from './classpathAttemptSelector';
import { deriveTargetResolutionRoots } from './classpathLayout';
import { ClasspathLookupOptions } from './classpathService';
import type { ClasspathResult } from './classpathTypes';

type AttemptSummary = {
  invocationCount: number;
  requestFailureCount: number;
  noResultCount: number;
};

type CommandResult = AttemptSummary & {
  response?: JavaLsClasspathResponse;
};

export async function runClasspathAttempts(
  attempts: ClasspathAttempt[],
  opts?: ClasspathLookupOptions
): Promise<ClasspathResult | undefined> {
  const outcome = await runClasspathAttemptsOutcome(attempts, opts);
  return outcome.status === 'resolved' ? outcome.classpath : undefined;
}

export async function runClasspathAttemptsOutcome(
  attempts: ClasspathAttempt[],
  opts?: ClasspathLookupOptions
): Promise<ClasspathLookupOutcome> {
  const verbose = opts?.verbose ?? envVerbose();
  const logFailures = opts?.logFailures === true;

  const javaExt = await getJavaExtension().catch(() => undefined);
  const api: any = javaExt?.exports;
  let lastFailure: { context: string; message: string } | undefined;
  const recordFailure = (context: string, message: string): void => {
    lastFailure = { context, message };
  };
  const summary: AttemptSummary = {
    invocationCount: 0,
    requestFailureCount: 0,
    noResultCount: 0,
  };

  for (const attempt of attempts) {
    const param = normalizeAttemptParam(attempt.arg);
    const commandResult = await tryCommandVariants(
      param,
      attempt.label,
      verbose,
      recordFailure
    );
    mergeAttemptSummary(summary, commandResult);
    let res = commandResult.response;
    let usedExtensionFallback = false;

    if (!res && api && typeof api.getClasspaths === 'function' && param) {
      const fallbackResult = await tryExtensionFallback(
        api,
        param,
        attempt.label,
        verbose,
        recordFailure
      );
      mergeAttemptSummary(summary, fallbackResult);
      res = fallbackResult.response;
      usedExtensionFallback = !!res;
    }

    if (res) {
      const result = normalizeClasspathResult(res);
      logSuccess(attempt.label, result);
      return {
        status: 'resolved',
        classpath: result,
        issues: buildResolvedIssues(result, summary, usedExtensionFallback, lastFailure),
      };
    }
  }

  if (logFailures) {
    if (lastFailure) {
      Logger.log(
        `getClasspaths failed (${lastFailure.context}): ${lastFailure.message}`
      );
    } else {
      Logger.log(
        `getClasspaths returned no results after ${attempts.length} attempt(s)`
      );
    }
  }

  return {
    status: 'unavailable',
    issues: buildUnavailableIssues(summary, lastFailure),
  };
}

function normalizeAttemptParam(arg: unknown): unknown {
  if (arg && typeof (arg as { scheme?: unknown }).scheme === 'string') {
    try {
      return (arg as Uri).toString();
    } catch {
      // keep as-is
    }
  }
  return arg;
}

async function tryCommandVariants(
  param: unknown,
  label: string,
  verbose: boolean,
  recordFailure: (context: string, message: string) => void
): Promise<CommandResult> {
  const summary: AttemptSummary = {
    invocationCount: 0,
    requestFailureCount: 0,
    noResultCount: 0,
  };

  if (param !== undefined) {
    const variants: Array<{ args: unknown[]; failureContext: string }> = [
      {
        args: [{ uri: param, scope: 'runtime' }],
        failureContext: `${label}) {uri,scope}`,
      },
      { args: [{ uri: param }], failureContext: `${label}) {uri}` },
      { args: [param], failureContext: `${label}) direct` },
      { args: [param, 'runtime'], failureContext: `${label}, runtime` },
    ];

    for (const variant of variants) {
      const result = await executeClasspathCommand(
        variant.args,
        variant.failureContext,
        verbose,
        recordFailure
      );
      mergeAttemptSummary(summary, result);
      if (result.response) {
        return {
          ...summary,
          response: result.response,
        };
      }
    }
  }

  if (param === undefined) {
    const result = await executeClasspathCommand(
      [],
      `no-arg within ${label}`,
      verbose,
      recordFailure
    );
    mergeAttemptSummary(summary, result);
    return {
      ...summary,
      response: result.response,
    };
  }

  return summary;
}

async function executeClasspathCommand(
  args: unknown[],
  failureContext: string,
  verbose: boolean,
  recordFailure: (context: string, message: string) => void
): Promise<CommandResult> {
  try {
    const response = await requestJavaClasspaths(...args);
    if (response !== undefined && response !== null) {
      return {
        invocationCount: 1,
        requestFailureCount: 0,
        noResultCount: 0,
        response,
      };
    }
    return {
      invocationCount: 1,
      requestFailureCount: 0,
      noResultCount: 1,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordFailure(failureContext, message);
    if (verbose) Logger.log(`getClasspaths(${failureContext}) failed: ${message}`);
    return {
      invocationCount: 1,
      requestFailureCount: 1,
      noResultCount: 0,
    };
  }
}

async function tryExtensionFallback(
  api: any,
  param: unknown,
  label: string,
  verbose: boolean,
  recordFailure: (context: string, message: string) => void
): Promise<CommandResult> {
  try {
    const cpRes = await api.getClasspaths(param, { scope: 'runtime' });
    if (cpRes) {
      if (verbose) Logger.log(`Using extension API getClasspaths for ${label}`);
      return {
        invocationCount: 1,
        requestFailureCount: 0,
        noResultCount: 0,
        response: {
          classpaths: cpRes.classpaths,
          sourcepaths: cpRes.sourcepaths ?? [],
          output: cpRes.output,
        },
      };
    }
    return {
      invocationCount: 1,
      requestFailureCount: 0,
      noResultCount: 1,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordFailure(`extensionApi ${label}`, message);
    if (verbose) {
      Logger.log(`extensionApi.getClasspaths(${label}) failed: ${message}`);
    }
    return {
      invocationCount: 1,
      requestFailureCount: 1,
      noResultCount: 0,
    };
  }
}

function normalizeClasspathResult(res: JavaLsClasspathResponse): ClasspathResult {
  const runtimeClasspaths = Array.isArray(res?.classpaths) ? res.classpaths : [];
  return {
    output: res?.output,
    runtimeClasspaths,
    targetResolutionRoots: deriveTargetResolutionRoots(res?.output, runtimeClasspaths),
    sourcepaths: Array.isArray(res?.sourcepaths) ? res.sourcepaths : [],
  };
}

function logSuccess(label: string, result: ClasspathResult): void {
  const runtime = result.runtimeClasspaths.length;
  const roots = result.targetResolutionRoots.length;
  const sps = result.sourcepaths.length;
  Logger.log(
    `getClasspaths(${label}) succeeded: output=${result.output ?? 'n/a'}, runtimeClasspaths=${runtime}, targetResolutionRoots=${roots}, sourcepaths=${sps}`
  );
}

function envVerbose(): boolean {
  try {
    const v = (process.env.SPOTBUGS_LS_VERBOSE || '').toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  } catch {
    return false;
  }
}

function mergeAttemptSummary(target: AttemptSummary, update: AttemptSummary): void {
  target.invocationCount += update.invocationCount;
  target.requestFailureCount += update.requestFailureCount;
  target.noResultCount += update.noResultCount;
}

function buildResolvedIssues(
  result: ClasspathResult,
  summary: AttemptSummary,
  usedExtensionFallback: boolean,
  lastFailure?: { context: string; message: string }
): AnalysisResolutionIssue[] {
  const issues: AnalysisResolutionIssue[] = [];

  if (usedExtensionFallback) {
    issues.push(...buildUnavailableIssues(summary, lastFailure));
    issues.push({
      code: 'JAVA_LS_EXTENSION_FALLBACK_USED',
      level: 'info',
      source: 'java-ls',
      phase: 'get-classpaths',
      message: 'Java LS extension API fallback provided classpath metadata.',
      variant: 'extension-api',
    });
  }

  if (result.runtimeClasspaths.length === 0) {
    issues.push({
      code: 'JAVA_LS_EMPTY_RUNTIME_CLASSPATH',
      level: 'warn',
      source: 'java-ls',
      phase: 'get-classpaths',
      message: 'Java LS classpath lookup returned no runtime classpath entries.',
    });
  }

  return issues;
}

function buildUnavailableIssues(
  summary: AttemptSummary,
  lastFailure?: { context: string; message: string }
): AnalysisResolutionIssue[] {
  const classification = classifyLookupFailure(summary);
  if (!classification) {
    return [];
  }

  const issues: AnalysisResolutionIssue[] = [];

  if (classification === 'request-failed') {
    issues.push({
      code: 'JAVA_LS_REQUEST_FAILED',
      level: 'warn',
      source: 'java-ls',
      phase: 'get-classpaths',
      message: 'Java LS classpath lookup failed.',
      attemptLabel: lastFailure?.context,
      cause: lastFailure?.message,
    });
  }

  if (classification === 'no-result') {
    issues.push({
      code: 'JAVA_LS_NO_RESULT',
      level: 'warn',
      source: 'java-ls',
      phase: 'get-classpaths',
      message: 'Java LS classpath lookup returned no usable result.',
    });
  }

  return issues;
}

function classifyLookupFailure(
  summary: AttemptSummary
): 'request-failed' | 'no-result' | undefined {
  if (summary.invocationCount === 0) {
    return undefined;
  }

  if (summary.noResultCount > 0) {
    return 'no-result';
  }

  if (summary.requestFailureCount === summary.invocationCount) {
    return 'request-failed';
  }

  return undefined;
}
