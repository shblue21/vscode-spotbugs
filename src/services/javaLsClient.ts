import { commands, extensions, Uri, workspace } from 'vscode';
import { Logger } from '../core/logger';
import { JavaLanguageServerCommands } from '../constants/commands';
import { ClasspathResult, ProjectRef } from './classpathService';
import { getJavaExtension } from '../core/utils';

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

  static async buildWorkspace(mode: 'auto' | 'incremental' | 'full' = 'auto'): Promise<number | undefined> {
    const tryBuild = async (full: boolean): Promise<number | undefined> => {
      try {
        return await commands.executeCommand<number>(
          JavaLanguageServerCommands.BUILD_WORKSPACE,
          full
        );
      } catch (e) {
        Logger.log(
          `Error during java.project.build(${full}): ${e instanceof Error ? e.message : String(e)}`
        );
        return undefined;
      }
    };

    let result: number | undefined;
    const t0 = Date.now();
    if (mode === 'incremental') {
      result = await tryBuild(false);
    } else if (mode === 'full') {
      result = await tryBuild(true);
    } else {
      result = await tryBuild(false);
      if (result !== 0) {
        result = await tryBuild(true);
      }
    }
    const t1 = Date.now();
    Logger.log(`Build duration: ${t1 - t0} ms (mode=${mode}, result=${String(result)})`);
    return result;
  }

  static async getClasspaths(project?: ProjectRef, opts?: { verbose?: boolean }): Promise<ClasspathResult | undefined> {
    const verbose = opts?.verbose ?? envVerbose();
    const attempts: Array<{ label: string; arg?: any }> = [];
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

    // Try command signatures, then extension API as last resort
    const javaExt = await getJavaExtension().catch(() => undefined);
    const api: any = javaExt?.exports;

    for (const attempt of attempts) {
      let res: any | undefined;
      let param: any = attempt.arg;
      if (param && typeof (param as any).scheme === 'string') {
        try {
          param = (param as Uri).toString();
        } catch {
          // keep as-is
        }
      }
      // Object arg with runtime scope
      if (param !== undefined) {
        try {
          res = await commands.executeCommand<any>(
            JavaLanguageServerCommands.GET_CLASSPATHS,
            { uri: param, scope: 'runtime' }
          );
        } catch {
          if (verbose) Logger.log(`getClasspaths(${attempt.label}) {uri,scope} failed`);
        }
      }
      // Object arg without scope
      if (!res && param !== undefined) {
        try {
          res = await commands.executeCommand<any>(
            JavaLanguageServerCommands.GET_CLASSPATHS,
            { uri: param }
          );
        } catch {
          if (verbose) Logger.log(`getClasspaths(${attempt.label}) {uri} failed`);
        }
      }
      // Legacy signatures
      if (!res && param !== undefined) {
        try {
          res = await commands.executeCommand<any>(JavaLanguageServerCommands.GET_CLASSPATHS, param);
        } catch {
          if (verbose) Logger.log(`getClasspaths(${attempt.label}) direct failed`);
        }
      }
      if (!res && param !== undefined) {
        try {
          res = await commands.executeCommand<any>(
            JavaLanguageServerCommands.GET_CLASSPATHS,
            param,
            'runtime'
          );
        } catch {
          if (verbose) Logger.log(`getClasspaths(${attempt.label}, runtime) failed`);
        }
      }
      // No-arg
      if (!res && param === undefined) {
        try {
          res = await commands.executeCommand<any>(JavaLanguageServerCommands.GET_CLASSPATHS);
        } catch {
          if (verbose) Logger.log(`getClasspaths(no-arg within ${attempt.label}) failed`);
        }
      }
      // Extension API fallback
      if (!res && api && typeof api.getClasspaths === 'function' && param) {
        try {
          const cpRes = await api.getClasspaths(param, { scope: 'runtime' });
          if (cpRes) {
            res = { classpaths: cpRes.classpaths, sourcepaths: cpRes.sourcepaths ?? [] };
            if (verbose) Logger.log(`Using extension API getClasspaths for ${attempt.label}`);
          }
        } catch {
          if (verbose) Logger.log(`extensionApi.getClasspaths(${attempt.label}) failed`);
        }
      }

      if (res) {
        const cps = Array.isArray(res.classpaths) ? res.classpaths.length : 0;
        const sps = Array.isArray(res.sourcepaths) ? res.sourcepaths.length : 0;
        Logger.log(
          `getClasspaths(${attempt.label}) succeeded: output=${res.output ?? 'n/a'}, classpaths=${cps}, sourcepaths=${sps}`
        );
        return {
          output: res.output,
          classpaths: Array.isArray(res.classpaths) ? res.classpaths : [],
          sourcepaths: Array.isArray(res.sourcepaths) ? res.sourcepaths : [],
        };
      }
    }

    return undefined;
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
