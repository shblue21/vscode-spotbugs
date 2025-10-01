import { commands, extensions, Uri, workspace } from 'vscode';
import { Logger } from '../core/logger';
import { JavaLanguageServerCommands } from '../constants/commands';
import { ClasspathResult, ProjectRef } from './classpathService';
import { buildWorkspace, BuildMode } from './workspaceBuildService';
import { getJavaExtension } from '../core/utils';

type ClasspathAttempt = {
  label: string;
  arg?: any;
};

export class JavaLsClient {
  static async getAllProjects(): Promise<string[]> {
    try {
      const uris = (await commands.executeCommand<string[]>(
        JavaLanguageServerCommands.GET_ALL_JAVA_PROJECTS
      )) || [];
      // filter out default pseudo project
      return uris.filter((uriString) => {
        try {
          const p = Uri.parse(uriString).fsPath;
          return !p.endsWith('jdt.ls-java-project');
        } catch {
          return true;
        }
      });
    } catch {
      return [];
    }
  }

  static async buildWorkspace(mode: BuildMode = 'auto'): Promise<number | undefined> {
    return buildWorkspace({ mode, ensureCommands: false });
  }

  static async getClasspaths(project?: ProjectRef, opts?: { verbose?: boolean }): Promise<ClasspathResult | undefined> {
    const verbose = opts?.verbose ?? envVerbose();
    const attempts = await this.collectClasspathAttempts(project);

    // Try command signatures, then extension API as last resort
    const javaExt = await getJavaExtension().catch(() => undefined);
    const api: any = javaExt?.exports;

    for (const attempt of attempts) {
      const param = this.normalizeAttemptParam(attempt.arg);

      let res = await this.tryCommandVariants(param, attempt.label, verbose);

      if (!res && api && typeof api.getClasspaths === 'function' && param) {
        res = await this.tryExtensionFallback(api, param, attempt.label, verbose);
      }

      if (res) {
        const result = this.normalizeClasspathResult(res);
        this.logSuccess(attempt.label, result);
        return result;
      }
    }

    return undefined;
  }

  private static async collectClasspathAttempts(project?: ProjectRef): Promise<ClasspathAttempt[]> {
    const attempts: ClasspathAttempt[] = [];
    if (project) attempts.push({ label: `preferred:${toUriString(project)}`, arg: project });

    const folders = workspace.workspaceFolders ?? [];
    for (const f of folders) {
      if (!project || toUriString(f.uri) !== toUriString(project)) {
        attempts.push({ label: `workspace:${f.name}`, arg: f.uri });
      }
    }

    try {
      const uris = await this.getAllProjects();
      for (const u of uris) {
        if (!attempts.find((a) => a.arg && toUriString(a.arg) === u)) {
          attempts.push({ label: `project:${u}`, arg: u });
        }
      }
    } catch {
      // ignore
    }

    attempts.push({ label: 'no-arg' });
    return attempts;
  }

  private static normalizeAttemptParam(arg: any): any {
    if (arg && typeof (arg as any).scheme === 'string') {
      try {
        return (arg as Uri).toString();
      } catch {
        // keep as-is
      }
    }
    return arg;
  }

  private static async tryCommandVariants(
    param: any,
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
        const res = await this.executeClasspathCommand(variant.args, variant.failureContext, verbose);
        if (res) {
          return res;
        }
      }
    }

    if (param === undefined) {
      return this.executeClasspathCommand([], `no-arg within ${label}`, verbose);
    }

    return undefined;
  }

  private static async executeClasspathCommand(
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

  private static async tryExtensionFallback(
    api: any,
    param: any,
    label: string,
    verbose: boolean
  ): Promise<any | undefined> {
    try {
      const cpRes = await api.getClasspaths(param, { scope: 'runtime' });
      if (cpRes) {
        if (verbose) Logger.log(`Using extension API getClasspaths for ${label}`);
        return { classpaths: cpRes.classpaths, sourcepaths: cpRes.sourcepaths ?? [], output: cpRes.output };
      }
    } catch {
      if (verbose) Logger.log(`extensionApi.getClasspaths(${label}) failed`);
    }
    return undefined;
  }

  private static normalizeClasspathResult(res: any): ClasspathResult {
    return {
      output: res?.output,
      classpaths: Array.isArray(res?.classpaths) ? res.classpaths : [],
      sourcepaths: Array.isArray(res?.sourcepaths) ? res.sourcepaths : [],
    };
  }

  private static logSuccess(label: string, result: ClasspathResult): void {
    const cps = result.classpaths.length;
    const sps = result.sourcepaths.length;
    Logger.log(
      `getClasspaths(${label}) succeeded: output=${result.output ?? 'n/a'}, classpaths=${cps}, sourcepaths=${sps}`
    );
  }
}

function toUriString(ref: ProjectRef): string {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  return ref.toString();
}

function envVerbose(): boolean {
  try {
    const v = (process.env.SPOTBUGS_LS_VERBOSE || '').toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  } catch {
    return false;
  }
}
