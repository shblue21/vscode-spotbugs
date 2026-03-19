import { Uri } from 'vscode';
import { Logger } from '../core/logger';
import { getJavaExtension } from '../core/utils';
import {
  JavaLsClasspathResponse,
  requestJavaClasspaths,
} from '../lsp/javaLsGateway';
import { ClasspathAttempt } from './classpathAttemptSelector';
import { deriveTargetResolutionRoots } from './classpathLayout';
import {
  ClasspathLookupOptions,
  ClasspathResult,
} from './classpathService';

export async function runClasspathAttempts(
  attempts: ClasspathAttempt[],
  opts?: ClasspathLookupOptions
): Promise<ClasspathResult | undefined> {
  const verbose = opts?.verbose ?? envVerbose();
  const logFailures = opts?.logFailures === true;

  const javaExt = await getJavaExtension().catch(() => undefined);
  const api: any = javaExt?.exports;
  let lastFailure: { context: string; message: string } | undefined;
  const recordFailure = (context: string, message: string): void => {
    lastFailure = { context, message };
  };

  for (const attempt of attempts) {
    const param = normalizeAttemptParam(attempt.arg);

    let res = await tryCommandVariants(param, attempt.label, verbose, recordFailure);

    if (!res && api && typeof api.getClasspaths === 'function' && param) {
      res = await tryExtensionFallback(api, param, attempt.label, verbose, recordFailure);
    }

    if (res) {
      const result = normalizeClasspathResult(res);
      logSuccess(attempt.label, result);
      return result;
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

  return undefined;
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
): Promise<JavaLsClasspathResponse | undefined> {
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
      const res = await executeClasspathCommand(
        variant.args,
        variant.failureContext,
        verbose,
        recordFailure
      );
      if (res) {
        return res;
      }
    }
  }

  if (param === undefined) {
    return executeClasspathCommand([], `no-arg within ${label}`, verbose, recordFailure);
  }

  return undefined;
}

async function executeClasspathCommand(
  args: unknown[],
  failureContext: string,
  verbose: boolean,
  recordFailure: (context: string, message: string) => void
): Promise<JavaLsClasspathResponse | undefined> {
  try {
    return await requestJavaClasspaths(...args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordFailure(failureContext, message);
    if (verbose) Logger.log(`getClasspaths(${failureContext}) failed: ${message}`);
    return undefined;
  }
}

async function tryExtensionFallback(
  api: any,
  param: unknown,
  label: string,
  verbose: boolean,
  recordFailure: (context: string, message: string) => void
): Promise<JavaLsClasspathResponse | undefined> {
  try {
    const cpRes = await api.getClasspaths(param, { scope: 'runtime' });
    if (cpRes) {
      if (verbose) Logger.log(`Using extension API getClasspaths for ${label}`);
      return {
        classpaths: cpRes.classpaths,
        sourcepaths: cpRes.sourcepaths ?? [],
        output: cpRes.output,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordFailure(`extensionApi ${label}`, message);
    if (verbose) {
      Logger.log(`extensionApi.getClasspaths(${label}) failed: ${message}`);
    }
  }
  return undefined;
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
