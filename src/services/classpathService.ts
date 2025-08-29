import { commands, Uri, workspace } from "vscode";
import * as path from "path";
import * as fs from "fs";
import { getJavaExtension } from "../utils";
import { Logger } from "../logger";
import { JavaLanguageServerCommands } from "../constants/commands";

export interface ClasspathResult {
  output?: string;
  classpaths: string[];
  sourcepaths: string[];
}

export type ProjectRef = string | Uri | undefined;

export async function getClasspaths(project?: ProjectRef): Promise<ClasspathResult | undefined> {
  const preferredUri = project;
  const attempts: Array<{ label: string; arg?: any }> = [];
  if (preferredUri) {
    attempts.push({ label: `preferred:${toUriString(preferredUri)}`, arg: preferredUri });
  }
  const folders = workspace.workspaceFolders ?? [];
  for (const f of folders) {
    if (!preferredUri || toUriString(f.uri) !== toUriString(preferredUri)) {
      attempts.push({ label: `workspace:${f.name}`, arg: f.uri });
    }
  }
  try {
    const cmds = await commands.getCommands(true);
    if (cmds.includes(JavaLanguageServerCommands.GET_ALL_JAVA_PROJECTS)) {
      try {
        const uris = await commands.executeCommand<string[]>(
          JavaLanguageServerCommands.GET_ALL_JAVA_PROJECTS,
        );
        if (Array.isArray(uris) && uris.length > 0) {
          Logger.log(`java.project.getAll returned ${uris.length} projects.`);
          for (const u of uris) {
            if (!attempts.find((a) => a.arg && toUriString(a.arg) === u)) {
              attempts.push({ label: `project:${u}`, arg: u });
            }
          }
        } else {
          Logger.log("java.project.getAll returned no projects.");
        }
      } catch (e) {
        Logger.log(`java.project.getAll failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch {
    // ignore
  }
  attempts.push({ label: "no-arg" });

  const javaExt = await getJavaExtension().catch(() => undefined);
  const api: any = javaExt?.exports;

  for (const attempt of attempts) {
    try {
      Logger.log(`Trying getClasspaths with ${attempt.label} ...`);
      let param: any = attempt.arg;
      if (param && typeof (param as any).scheme === "string") {
        try {
          param = (param as Uri).toString();
        } catch {
          // leave as-is
        }
      }
      let res: any | undefined;
      if (param !== undefined) {
        // Newer API: expects an object argument { uri, scope }
        const objArg = { uri: param };
        const objArgRuntime = { uri: param, scope: 'runtime' } as any;
        try {
          res = await commands.executeCommand<any>(
            JavaLanguageServerCommands.GET_CLASSPATHS,
            objArgRuntime,
          );
        } catch (e) {
          Logger.log(
            `getClasspaths(${attempt.label}) {uri,scope} failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        if (!res) {
          try {
            res = await commands.executeCommand<any>(
              JavaLanguageServerCommands.GET_CLASSPATHS,
              objArg,
            );
          } catch (e0) {
            Logger.log(
              `getClasspaths(${attempt.label}) {uri} failed: ${e0 instanceof Error ? e0.message : String(e0)}`,
            );
          }
        }
        // Legacy signatures: (uriString) and (uriString, 'runtime')
        if (!res) {
          try {
            res = await commands.executeCommand<any>(
              JavaLanguageServerCommands.GET_CLASSPATHS,
              param,
            );
          } catch (e1) {
            Logger.log(
              `getClasspaths(${attempt.label}) direct failed: ${e1 instanceof Error ? e1.message : String(e1)}`,
            );
          }
        }
        if (!res) {
          try {
            res = await commands.executeCommand<any>(
              JavaLanguageServerCommands.GET_CLASSPATHS,
              param,
              'runtime',
            );
          } catch (e2) {
            Logger.log(
              `getClasspaths(${attempt.label}, runtime) failed: ${e2 instanceof Error ? e2.message : String(e2)}`,
            );
          }
        }
      }
      if (!res) {
        try {
          res = await commands.executeCommand<any>(JavaLanguageServerCommands.GET_CLASSPATHS);
        } catch (e3) {
          Logger.log(
            `getClasspaths(no-arg within ${attempt.label}) failed: ${e3 instanceof Error ? e3.message : String(e3)}`,
          );
        }
      }
      if (!res && api && typeof api.getClasspaths === "function" && param) {
        try {
          const cpRes = await api.getClasspaths(param, { scope: "runtime" });
          if (cpRes) {
            res = { classpaths: cpRes.classpaths, sourcepaths: cpRes.sourcepaths ?? [] };
            Logger.log(
              `Using extension API getClasspaths for ${attempt.label}: classpaths=${Array.isArray(res.classpaths) ? res.classpaths.length : 0}`,
            );
          }
        } catch (e4) {
          Logger.log(
            `extensionApi.getClasspaths(${attempt.label}) failed: ${e4 instanceof Error ? e4.message : String(e4)}`,
          );
        }
      }
      if (res) {
        const cps = Array.isArray(res.classpaths) ? res.classpaths.length : 0;
        const sps = Array.isArray(res.sourcepaths) ? res.sourcepaths.length : 0;
        Logger.log(
          `getClasspaths(${attempt.label}) succeeded: output=${res.output ?? "n/a"}, classpaths=${cps}, sourcepaths=${sps}`,
        );
        return {
          output: res.output,
          classpaths: Array.isArray(res.classpaths) ? res.classpaths : [],
          sourcepaths: Array.isArray(res.sourcepaths) ? res.sourcepaths : [],
        };
      }
      Logger.log(`getClasspaths(${attempt.label}) returned empty result`);
    } catch (e) {
      Logger.log(
        `getClasspaths(${attempt.label}) failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return undefined;
}

export async function deriveOutputFolder(
  classpaths: string[],
  workspacePath: string,
): Promise<string | undefined> {
  const jarsExcluded = classpaths.filter(
    (p) => !p.toLowerCase().endsWith(".jar") && !p.toLowerCase().endsWith(".zip"),
  );
  const preferredSuffixes = [
    `${path.sep}target${path.sep}classes`,
    `${path.sep}build${path.sep}classes${path.sep}java${path.sep}main`,
    `${path.sep}build${path.sep}classes`,
    `${path.sep}bin`,
    `${path.sep}out${path.sep}production`,
    `${path.sep}out`,
    `${path.sep}classes`,
  ];
  const candidates: string[] = [];
  for (const cp of jarsExcluded) {
    for (const suf of preferredSuffixes) {
      if (cp.includes(suf)) {
        candidates.push(cp);
        break;
      }
    }
  }
  for (const cp of jarsExcluded) {
    if (!candidates.includes(cp) && cp.startsWith(workspacePath)) {
      candidates.push(cp);
    }
  }
  for (const c of candidates) {
    try {
      const st = await fs.promises.stat(c);
      if (st.isDirectory()) {
        return c;
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

function toUriString(ref: ProjectRef): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  return ref.toString();
}
