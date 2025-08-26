import { commands, window, Uri, workspace, TreeView, TreeItem, extensions } from "vscode";
import { getJavaExtension } from "../utils";
import * as path from "path";
import * as fs from "fs";
import { SpotbugsTreeDataProvider } from "../spotbugsTreeDataProvider";
import { BugInfo } from "../bugInfo";
import { Config } from "../config";
import { Logger } from "../logger";
import { executeJavaLanguageServerCommand } from "../command";
import { JavaLanguageServerCommands, SpotBugsCommands } from "../constants/commands";

export async function checkCode(
  config: Config,
  spotbugsTreeDataProvider: SpotbugsTreeDataProvider,
  treeView: TreeView<TreeItem>,
  uri: Uri | undefined,
): Promise<void> {
  Logger.show();
  Logger.log("Command spotbugs.run triggered.");

  // Reveal the Spotbugs tree view to focus the panel
  await commands.executeCommand("spotbugs-view.focus");

  let fileUri = uri;
  if (!fileUri && window.activeTextEditor) {
    fileUri = window.activeTextEditor.document.uri;
  }

  if (fileUri) {
    spotbugsTreeDataProvider.showLoading();
    try {
      // Get project classpaths and set them in config (only for Java/class files)
      if (fileUri.fsPath.endsWith(".java") || fileUri.fsPath.endsWith(".class")) {
        try {
          const preferred = fileUri;
          const classpathsResult = await getClasspathsWithFallback(preferred);
          if (
            classpathsResult &&
            Array.isArray(classpathsResult.classpaths) &&
            classpathsResult.classpaths.length > 0
          ) {
            config.setClasspaths(classpathsResult.classpaths);
            Logger.log(`Set ${classpathsResult.classpaths.length} classpaths for analysis`);
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
        fileUri.fsPath,
        JSON.stringify(config),
      );
      if (result) {
        try {
          const bugs = JSON.parse(result) as BugInfo[];
          const enrichedBugs = await enrichBugsWithFullPaths(bugs);
          Logger.log(`Successfully parsed and enriched ${enrichedBugs.length} bugs. Details:`);
          for (const bug of enrichedBugs) {
            Logger.log(JSON.stringify(bug, null, 2));
          }
          spotbugsTreeDataProvider.showResults(enrichedBugs);
        } catch (e) {
          Logger.error("Failed to parse Spotbugs analysis results", e);
          window.showErrorMessage(
            "Failed to parse Spotbugs analysis results. See Spotbugs output channel for details.",
          );
        }
      } else {
        spotbugsTreeDataProvider.showResults([]);
      }
    } catch (err) {
      Logger.error("An error occurred during Spotbugs analysis", err);
      window.showErrorMessage(
        "An error occurred during Spotbugs analysis. See Spotbugs output channel for details.",
      );
      spotbugsTreeDataProvider.showResults([]);
    }
  } else {
    window.showErrorMessage("No Java file selected for Spotbugs analysis.");
    Logger.log("No Java file selected for analysis.");
  }
}

export async function runWorkspaceAnalysis(
  config: Config,
  spotbugsTreeDataProvider: SpotbugsTreeDataProvider,
  treeView: TreeView<TreeItem>,
): Promise<void> {
  Logger.show();
  Logger.log("Command spotbugs.runWorkspace triggered.");

  // Reveal the Spotbugs tree view to focus the panel
  await commands.executeCommand("spotbugs-view.focus");
  try {
    window.showInformationMessage("Starting Java workspace build...");
    Logger.log("Starting Java workspace build...");

    // Log Java extension presence and readiness
    const javaExt = extensions.getExtension("redhat.java");
    if (!javaExt) {
      Logger.log("Java extension redhat.java not found. Build may fail.");
    } else {
      Logger.log(
        `redhat.java present. Active=${javaExt.isActive}, Version=${(javaExt as any).packageJSON?.version ?? "unknown"}`,
      );
      if (!javaExt.isActive) {
        try {
          await javaExt.activate();
          Logger.log("Activated redhat.java extension.");
        } catch (e) {
          Logger.log(
            `Warning: Failed to activate redhat.java (${e instanceof Error ? e.message : String(e)})`,
          );
        }
      }
      const api: any = javaExt.exports;
      if (api && typeof api.serverReady === "function") {
        try {
          Logger.log("Waiting for Java Language Server to be ready...");
          await api.serverReady();
          Logger.log("Java Language Server reported ready.");
        } catch (e) {
          Logger.log(
            `Warning: serverReady() failed (${e instanceof Error ? e.message : String(e)})`,
          );
        }
      }
    }

    // Check command availability
    try {
      const available = await commands.getCommands(true);
      const hasBuild = available.includes(JavaLanguageServerCommands.BUILD_WORKSPACE);
      const hasGetCp = available.includes(JavaLanguageServerCommands.GET_CLASSPATHS);
      Logger.log(`Commands available - build:${hasBuild} getClasspaths:${hasGetCp}`);
    } catch {
      // Ignore inability to list commands
    }

    const t0 = Date.now();
    let buildResult: number | undefined;
    try {
      Logger.log("Invoking java.project.build(false) - incremental build");
      buildResult = await commands.executeCommand<number>(
        JavaLanguageServerCommands.BUILD_WORKSPACE,
        false,
      );
      Logger.log(`java.project.build(false) returned: ${String(buildResult)}`);
    } catch (e) {
      Logger.log(
        `Error during java.project.build(false): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (buildResult !== 0) {
      try {
        Logger.log("Retrying with java.project.build(true) - full build");
        buildResult = await commands.executeCommand<number>(
          JavaLanguageServerCommands.BUILD_WORKSPACE,
          true,
        );
        Logger.log(`java.project.build(true) returned: ${String(buildResult)}`);
      } catch (e) {
        Logger.log(
          `Error during java.project.build(true): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    const t1 = Date.now();
    Logger.log(`Build duration: ${t1 - t0} ms`);

    if (buildResult !== 0) {
      Logger.error(`Java workspace build failed. Return code: ${String(buildResult)}`);
      window.showErrorMessage(
        "Build failed. Please build project manually and then run Spotbugs analysis.",
      );
      return;
    }

    window.showInformationMessage("Build completed successfully. Analyzing workspace...");
    Logger.log("Build completed successfully. Analyzing workspace...");
    const workspaceFolder = workspace.workspaceFolders ? workspace.workspaceFolders[0] : undefined;
    if (!workspaceFolder) {
      Logger.error("No workspace folder found.");
      window.showErrorMessage("No workspace folder found.");
      return;
    }
    // Get project classpaths and output directory
    try {
      const classpathsResult = await getClasspathsWithFallback(workspaceFolder.uri);
      if (classpathsResult) {
        // Set classpaths in config before analysis
        const cps = classpathsResult.classpaths;
        const sps = classpathsResult.sourcepaths;
        Logger.log(
          `Classpaths result - output:${classpathsResult.output ?? "n/a"}, classpaths:${Array.isArray(cps) ? cps.length : 0}, sourcepaths:${Array.isArray(sps) ? sps.length : 0}`,
        );
        if (Array.isArray(cps) && cps.length > 0) {
          config.setClasspaths(cps);
          Logger.log(`Set ${cps.length} classpaths for workspace analysis`);
        } else {
          Logger.log("No classpaths available for workspace analysis; using system classpath");
        }

        // Determine output folder
        let outputPath: string | undefined = classpathsResult.output;
        if (!outputPath && Array.isArray(cps)) {
          outputPath = await pickCandidateOutputFolderFromClasspaths(
            cps,
            workspaceFolder.uri.fsPath,
          );
          if (outputPath) {
            Logger.log(`Derived output folder from classpaths: ${outputPath}`);
          }
        }

        if (outputPath) {
          const outputFolderUri = Uri.file(outputPath);
          await checkCode(config, spotbugsTreeDataProvider, treeView, outputFolderUri);
        } else {
          Logger.error("Could not determine the output folder for the Java project.");
          window.showErrorMessage("Could not determine the output folder for the Java project.");
        }
      } else {
        Logger.error("Failed to obtain classpaths from Java Language Server.");
        window.showErrorMessage("Failed to obtain classpaths from Java Language Server.");
      }
    } catch (error) {
      Logger.error("Failed to get project information from Java Language Server", error);
      window.showErrorMessage(
        "Failed to get project information. Make sure you have a valid Java project open.",
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error("An error occurred during workspace analysis", error);
    window.showErrorMessage(`An error occurred during workspace analysis: ${errorMessage}`);
  }
}

async function enrichBugsWithFullPaths(bugs: BugInfo[]): Promise<BugInfo[]> {
  if (!bugs.length) {
    return [];
  }

  try {
    const workspaceFolder = workspace.workspaceFolders ? workspace.workspaceFolders[0] : undefined;
    if (!workspaceFolder) {
      Logger.log("Cannot resolve full paths without an active workspace.");
      return bugs;
    }

    try {
      const workspaceFolder = workspace.workspaceFolders
        ? workspace.workspaceFolders[0]
        : undefined;
      const preferred = workspaceFolder?.uri;
      const classpathsResult = await getClasspathsWithFallback(preferred);

      if (
        classpathsResult &&
        classpathsResult.sourcepaths &&
        Array.isArray(classpathsResult.sourcepaths) &&
        classpathsResult.sourcepaths.length > 0
      ) {
        const sourcepaths: string[] = classpathsResult.sourcepaths;
        Logger.log(`Found source paths: ${sourcepaths.join(", ")}`);

        for (const bug of bugs) {
          if (!bug.realSourcePath) {
            continue;
          }

          for (const sourcePath of sourcepaths) {
            const candidatePath = path.join(sourcePath, bug.realSourcePath);
            try {
              // Use async file access to avoid blocking
              await fs.promises.access(candidatePath);
              bug.fullPath = candidatePath;
              break; // Found it, move to the next bug
            } catch {
              // File does not exist at this candidate path, try next source path
            }
          }
          if (!bug.fullPath) {
            Logger.log(`Could not resolve full path for: ${bug.realSourcePath}`);
          }
        }
      } else {
        Logger.log("No source paths available from Java Language Server; skipping path enrichment");
      }
    } catch (error) {
      Logger.log(
        `Warning: Could not get source paths for path enrichment (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  } catch (e) {
    Logger.log(
      `Warning: Failed to enrich bugs with full paths (${e instanceof Error ? e.message : String(e)})`,
    );
  }

  return bugs;
}

async function getClasspathsWithFallback(preferredUri?: Uri): Promise<any | undefined> {
  const attempts: Array<{ label: string; arg?: any }> = [];
  if (preferredUri) {
    attempts.push({ label: `preferred:${preferredUri.toString()}`, arg: preferredUri });
  }
  // Try each workspace folder explicitly
  const folders = workspace.workspaceFolders ?? [];
  for (const f of folders) {
    if (!preferredUri || f.uri.toString() !== preferredUri.toString()) {
      attempts.push({ label: `workspace:${f.name}`, arg: f.uri });
    }
  }
  // Try enumerated Java projects if available
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
            // Avoid duplicates
            if (!attempts.find((a) => a.arg && a.arg.toString && a.arg.toString() === u)) {
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
  // Finally, try without args (legacy behavior)
  attempts.push({ label: "no-arg" });

  const javaExt = await getJavaExtension().catch(() => undefined);
  const api: any = javaExt?.exports;
  for (const attempt of attempts) {
    try {
      Logger.log(`Trying getClasspaths with ${attempt.label} ...`);
      let param: any = attempt.arg;
      // The Java LS expects a URI string, not a VS Code Uri object
      if (param && typeof (param as any).scheme === "string") {
        try {
          param = (param as Uri).toString();
        } catch {
          // leave as-is
        }
      }
      // Try command with explicit project, then with scope 'runtime', then no-arg
      let res: any | undefined;
      if (param !== undefined) {
        try {
          res = await commands.executeCommand<any>(
            JavaLanguageServerCommands.GET_CLASSPATHS,
            param,
          );
        } catch (e) {
          Logger.log(
            `getClasspaths(${attempt.label}) direct failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        if (!res) {
          try {
            res = await commands.executeCommand<any>(
              JavaLanguageServerCommands.GET_CLASSPATHS,
              param,
              "runtime",
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
      // Try extension API as a fallback (may not provide 'output')
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
        return res;
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

async function pickCandidateOutputFolderFromClasspaths(
  classpaths: string[],
  workspacePath: string,
): Promise<string | undefined> {
  const jarsExcluded = classpaths.filter(
    (p) => !p.toLowerCase().endsWith(".jar") && !p.toLowerCase().endsWith(".zip"),
  );

  // Prefer well-known output suffixes
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
  // Fallback: any directory classpath under workspace
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
      // ignore non-existent
    }
  }
  return undefined;
}
