import { CancellationToken, Uri, workspace, commands } from "vscode";
import * as path from "path";
import * as fs from "fs";
import { executeJavaLanguageServerCommand } from "../core/command";
import { SpotBugsCommands } from "../constants/commands";
import { Logger } from "../core/logger";
import { Config } from "../core/config";
import { BugInfo } from "../models/bugInfo";
import { ClasspathResult, ProjectRef, deriveOutputFolder, getClasspaths } from "./classpathService";
import { JavaLsClient } from "./javaLsClient";
import { resolveSourceFullPath } from "./pathResolver";

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

    let parsed: unknown;
    try {
      parsed = JSON.parse(result);
    } catch (e) {
      Logger.error('Failed to parse analysis result', e);
      return [];
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as any).error) {
      const msg = String((parsed as any).error);
      Logger.error(`SpotBugs analysis error: ${msg}`);
      return [];
    }
    const bugs = Array.isArray(parsed) ? (parsed as BugInfo[]) : [];
    const enriched = await enrichWithFullPaths(bugs, uri);
    Logger.log(`Successfully parsed and enriched ${enriched.length} bugs.`);
    return enriched;
  } catch (e) {
    Logger.error("Analyzer: analyzeFile failed", e);
    return [];
  }
}

export async function enrichWithFullPaths(bugs: BugInfo[], preferredProject?: Uri): Promise<BugInfo[]> {
  if (!bugs.length) return [];
  for (const bug of bugs) {
    if (!bug.realSourcePath) continue;
    try {
      const full = await resolveSourceFullPath(bug.realSourcePath, preferredProject);
      if (full) {
        bug.fullPath = full;
      } else {
        Logger.log(`Could not resolve full path for: ${bug.realSourcePath}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`Path resolve failed for ${bug.realSourcePath}: ${msg}`);
    }
  }
  return bugs;
}

export interface ProjectResult {
  projectUri: string;
  findings: BugInfo[];
  error?: string;
}

export interface WorkspaceResult {
  results: ProjectResult[];
}

export async function getWorkspaceProjects(workspaceFolder: Uri): Promise<string[]> {
  let projectUris: string[] = await JavaLsClient.getAllProjects();
  // filter out default pseudo project
  projectUris = projectUris.filter((uriString) => {
    try {
      const p = Uri.parse(uriString).fsPath;
      return path.basename(p) !== 'jdt.ls-java-project';
    } catch {
      return true;
    }
  });
  if (projectUris.length === 0) {
    projectUris = [workspaceFolder.toString()];
    Logger.log('No Java projects from LS; falling back to workspace folder analysis.');
  } else {
    Logger.log(`Workspace contains ${projectUris.length} Java projects.`);
  }
  return projectUris;
}

export async function analyzeProject(
  config: Config,
  project: ProjectRef,
  workspaceFolder: Uri,
): Promise<ProjectResult> {
  const projectUriString = typeof project === 'string' ? project : (project as Uri).toString();
  try {
    const cp = await getClasspaths(project);
    let cps: string[] | undefined;
    if (cp && Array.isArray(cp.classpaths) && cp.classpaths.length > 0) {
      cps = cp.classpaths;
      config.setClasspaths(cps);
    }
    // determine output
    let outputPath: string | undefined = cp?.output;
    if (!outputPath && Array.isArray(cps)) {
      outputPath = await deriveOutputFolder(cps, workspaceFolder.fsPath);
    }
    if (!outputPath) {
      throw new Error('No output folder determined');
    }
    const resultJson = await executeJavaLanguageServerCommand<string>(
      SpotBugsCommands.RUN_ANALYSIS,
      outputPath,
      JSON.stringify(config),
    );
    let findings: BugInfo[] = [];
    if (resultJson) {
      try {
        const parsed: unknown = JSON.parse(resultJson);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as any).error) {
          const msg = String((parsed as any).error);
          return { projectUri: projectUriString, findings: [], error: msg };
        }
        findings = Array.isArray(parsed) ? (parsed as BugInfo[]) : [];
      } catch (e) {
        Logger.error('Failed to parse project analysis result', e);
      }
    }
    const enriched = await enrichWithFullPaths(findings, (project as Uri));
    return { projectUri: projectUriString, findings: enriched };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { projectUri: projectUriString, findings: [], error: msg };
  }
}

export async function analyzeWorkspace(
  config: Config,
  workspaceFolder: Uri,
  notify?: {
    onStart?: (uriString: string, index: number, total: number) => void;
    onDone?: (uriString: string, count: number) => void;
    onFail?: (uriString: string, message: string) => void;
  },
  token?: CancellationToken,
): Promise<WorkspaceResult> {
  const projects = await getWorkspaceProjects(workspaceFolder);
  const results: ProjectResult[] = [];
  for (let i = 0; i < projects.length; i++) {
    const uriString = projects[i];
    if (token?.isCancellationRequested) {
      Logger.log('Workspace analysis cancelled by user.');
      break;
    }
    notify?.onStart?.(uriString, i + 1, projects.length);
    const pr = await analyzeProject(config, Uri.parse(uriString), workspaceFolder);
    if (pr.error) {
      notify?.onFail?.(uriString, pr.error);
    } else {
      notify?.onDone?.(uriString, pr.findings.length);
    }
    results.push(pr);
  }
  return { results };
}
