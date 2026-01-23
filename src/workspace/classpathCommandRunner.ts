import { commands, Uri } from 'vscode';
import { JavaLanguageServerCommands } from '../constants/commands';
import { Logger } from '../core/logger';
import { getJavaExtension } from '../core/utils';
import { ClasspathAttempt } from './classpathAttemptSelector';
import { ClasspathResult } from './classpathService';

export async function runClasspathAttempts(
  attempts: ClasspathAttempt[],
  opts?: { verbose?: boolean }
): Promise<ClasspathResult | undefined> {
  const verbose = opts?.verbose ?? envVerbose();

  const javaExt = await getJavaExtension().catch(() => undefined);
  const api: any = javaExt?.exports;

  for (const attempt of attempts) {
    const param = normalizeAttemptParam(attempt.arg);

    let res = await tryCommandVariants(param, attempt.label, verbose);

    if (!res && api && typeof api.getClasspaths === 'function' && param) {
      res = await tryExtensionFallback(api, param, attempt.label, verbose);
    }

    if (res) {
      const result = normalizeClasspathResult(res);
      logSuccess(attempt.label, result);
      return result;
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
  verbose: boolean
): Promise<any | undefined> {
  if (param !== undefined) {
    const variants: Array<{ args: any[]; failureContext: string }> = [
      { args: [{ uri: param, scope: 'runtime' }], failureContext: `${label}) {uri,scope}` },
      { args: [{ uri: param }], failureContext: `${label}) {uri}` },
      { args: [param], failureContext: `${label}) direct` },
      { args: [param, 'runtime'], failureContext: `${label}, runtime` },
    ];

    for (const variant of variants) {
      const res = await executeClasspathCommand(variant.args, variant.failureContext, verbose);
      if (res) {
        return res;
      }
    }
  }

  if (param === undefined) {
    return executeClasspathCommand([], `no-arg within ${label}`, verbose);
  }

  return undefined;
}

async function executeClasspathCommand(
  args: any[],
  failureContext: string,
  verbose: boolean
): Promise<any | undefined> {
  try {
    return await commands.executeCommand<any>(
      JavaLanguageServerCommands.GET_CLASSPATHS,
      ...args
    );
  } catch {
    if (verbose) Logger.log(`getClasspaths(${failureContext}) failed`);
    return undefined;
  }
}

async function tryExtensionFallback(
  api: any,
  param: unknown,
  label: string,
  verbose: boolean
): Promise<any | undefined> {
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
  } catch {
    if (verbose) Logger.log(`extensionApi.getClasspaths(${label}) failed`);
  }
  return undefined;
}

function normalizeClasspathResult(res: any): ClasspathResult {
  return {
    output: res?.output,
    classpaths: Array.isArray(res?.classpaths) ? res.classpaths : [],
    sourcepaths: Array.isArray(res?.sourcepaths) ? res.sourcepaths : [],
  };
}

function logSuccess(label: string, result: ClasspathResult): void {
  const cps = result.classpaths.length;
  const sps = result.sourcepaths.length;
  Logger.log(
    `getClasspaths(${label}) succeeded: output=${result.output ?? 'n/a'}, classpaths=${cps}, sourcepaths=${sps}`
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

