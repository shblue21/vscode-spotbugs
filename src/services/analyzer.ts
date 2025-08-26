import { Uri, workspace } from "vscode";
import * as path from "path";
import * as fs from "fs";
import { executeJavaLanguageServerCommand } from "../command";
import { SpotBugsCommands } from "../constants/commands";
import { Logger } from "../logger";
import { Config } from "../config";
import { BugInfo } from "../bugInfo";
import { ClasspathResult, getClasspaths } from "./classpathService";

export async function analyzeFile(config: Config, uri: Uri): Promise<BugInfo[]> {
  try {
    if (uri.fsPath.endsWith(".java") || uri.fsPath.endsWith(".class")) {
      try {
        const cp = await getClasspaths(uri);
        if (cp && Array.isArray(cp.classpaths) && cp.classpaths.length > 0) {
          config.setClasspaths(cp.classpaths);
          Logger.log(`Set ${cp.classpaths.length} classpaths for analysis`);
        } else {
          Logger.log("No classpaths returned from Java Language Server; using system classpath");
        }
      } catch (error) {
        Logger.log(
          `Warning: Could not get project classpaths (${error instanceof Error ? error.message : String(error)}), using system classpath`,
        );
      }
    }

    const result = await executeJavaLanguageServerCommand<string>(
      SpotBugsCommands.RUN_ANALYSIS,
      uri.fsPath,
      JSON.stringify(config),
    );
    if (!result) return [];

    const bugs = JSON.parse(result) as BugInfo[];
    const enriched = await enrichWithFullPaths(bugs);
    Logger.log(`Successfully parsed and enriched ${enriched.length} bugs. Details:`);
    for (const bug of enriched) {
      Logger.log(JSON.stringify(bug, null, 2));
    }
    return enriched;
  } catch (e) {
    Logger.error("Analyzer: analyzeFile failed", e);
    return [];
  }
}

export async function enrichWithFullPaths(bugs: BugInfo[]): Promise<BugInfo[]> {
  if (!bugs.length) return [];
  try {
    const workspaceFolder = workspace.workspaceFolders ? workspace.workspaceFolders[0] : undefined;
    if (!workspaceFolder) {
      Logger.log("Cannot resolve full paths without an active workspace.");
      return bugs;
    }
    let cp: ClasspathResult | undefined;
    try {
      cp = await getClasspaths(workspaceFolder.uri);
    } catch (error) {
      Logger.log(
        `Warning: Could not get source paths for path enrichment (${error instanceof Error ? error.message : String(error)})`,
      );
    }

    if (cp && cp.sourcepaths && Array.isArray(cp.sourcepaths) && cp.sourcepaths.length > 0) {
      const sourcepaths: string[] = cp.sourcepaths;
      Logger.log(`Found source paths: ${sourcepaths.join(", ")}`);
      for (const bug of bugs) {
        if (!bug.realSourcePath) {
          continue;
        }
        for (const sourcePath of sourcepaths) {
          const candidatePath = path.join(sourcePath, bug.realSourcePath);
          try {
            await fs.promises.access(candidatePath);
            bug.fullPath = candidatePath;
            break;
          } catch {
            // try next
          }
        }
        if (!bug.fullPath) {
          Logger.log(`Could not resolve full path for: ${bug.realSourcePath}`);
        }
      }
    } else {
      Logger.log("No source paths available from Java Language Server; skipping path enrichment");
    }
  } catch (e) {
    Logger.log(
      `Warning: Failed to enrich bugs with full paths (${e instanceof Error ? e.message : String(e)})`,
    );
  }
  return bugs;
}

