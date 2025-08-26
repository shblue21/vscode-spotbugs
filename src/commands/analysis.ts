import { commands, window, Uri, workspace, TreeView, TreeItem } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SpotbugsTreeDataProvider } from '../spotbugsTreeDataProvider';
import { BugInfo } from '../bugInfo';
import { Config } from '../config';
import { Logger } from '../logger';
import { executeJavaLanguageServerCommand } from '../command';
import { JavaLanguageServerCommands, SpotBugsCommands } from '../constants/commands';
 

export async function checkCode(config: Config, spotbugsTreeDataProvider: SpotbugsTreeDataProvider, treeView: TreeView<TreeItem>, uri: Uri | undefined): Promise<void> {
  Logger.show();
  Logger.log('Command spotbugs.run triggered.');
  
  // Reveal the Spotbugs tree view to focus the panel
  await commands.executeCommand('spotbugs-view.focus');

  let fileUri = uri;
  if (!fileUri && window.activeTextEditor) {
    fileUri = window.activeTextEditor.document.uri;
  }

  if (fileUri) {
    spotbugsTreeDataProvider.showLoading();
    try {
      // Get project classpaths and set them in config (only for Java/class files)
      if (fileUri.fsPath.endsWith('.java') || fileUri.fsPath.endsWith('.class')) {
        try {
          const classpathsResult = await commands.executeCommand<any>(JavaLanguageServerCommands.GET_CLASSPATHS);
          if (classpathsResult && classpathsResult.classpaths && Array.isArray(classpathsResult.classpaths) && classpathsResult.classpaths.length > 0) {
            config.setClasspaths(classpathsResult.classpaths);
            Logger.log(`Set ${classpathsResult.classpaths.length} classpaths for analysis`);
          } else {
            Logger.log('No classpaths returned from Java Language Server; using system classpath');
          }
        } catch (error) {
          Logger.log(`Warning: Could not get project classpaths (${error instanceof Error ? error.message : String(error)}), using system classpath`);
        }
      }

      const result = await executeJavaLanguageServerCommand<string>(
        SpotBugsCommands.RUN_ANALYSIS,
        fileUri.fsPath,
        JSON.stringify(config)
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
          Logger.error('Failed to parse Spotbugs analysis results', e);
          window.showErrorMessage('Failed to parse Spotbugs analysis results. See Spotbugs output channel for details.');
        }
      } else {
        spotbugsTreeDataProvider.showResults([]);
      }
    } catch (err) {
      Logger.error('An error occurred during Spotbugs analysis', err);
      window.showErrorMessage('An error occurred during Spotbugs analysis. See Spotbugs output channel for details.');
      spotbugsTreeDataProvider.showResults([]);
    }
  } else {
    window.showErrorMessage("No Java file selected for Spotbugs analysis.");
    Logger.log('No Java file selected for analysis.');
  }
}

export async function runWorkspaceAnalysis(config: Config, spotbugsTreeDataProvider: SpotbugsTreeDataProvider, treeView: TreeView<TreeItem>): Promise<void> {
  Logger.show();
  Logger.log('Command spotbugs.runWorkspace triggered.');
  
  // Reveal the Spotbugs tree view to focus the panel
  await commands.executeCommand('spotbugs-view.focus');
  try {
    window.showInformationMessage('Starting Java workspace build...');
    Logger.log('Starting Java workspace build...');
    const buildResult = await commands.executeCommand<number>(JavaLanguageServerCommands.BUILD_WORKSPACE);
    if (buildResult !== 0) {
      Logger.error('Java workspace build failed.');
      window.showErrorMessage("Build failed. Please build project manually and then run Spotbugs analysis.");
      return;
    }

    window.showInformationMessage('Build completed successfully. Analyzing workspace...');
    Logger.log('Build completed successfully. Analyzing workspace...');
    const workspaceFolder = workspace.workspaceFolders ? workspace.workspaceFolders[0] : undefined;
    if (!workspaceFolder) {
      Logger.error('No workspace folder found.');
      window.showErrorMessage("No workspace folder found.");
      return;
    }
    // Get project classpaths and output directory
    try {
      const classpathsResult = await commands.executeCommand<any>(JavaLanguageServerCommands.GET_CLASSPATHS);
      if (classpathsResult && classpathsResult.output) {
        // Set classpaths in config before analysis
        if (classpathsResult.classpaths && Array.isArray(classpathsResult.classpaths) && classpathsResult.classpaths.length > 0) {
          config.setClasspaths(classpathsResult.classpaths);
          Logger.log(`Set ${classpathsResult.classpaths.length} classpaths for workspace analysis`);
        } else {
          Logger.log('No classpaths available for workspace analysis; using system classpath');
        }
        
        const outputFolderUri = Uri.file(classpathsResult.output);
        await checkCode(config, spotbugsTreeDataProvider, treeView, outputFolderUri);
      } else {
        Logger.error('Could not determine the output folder for the Java project.');
        window.showErrorMessage("Could not determine the output folder for the Java project.");
      }
    } catch (error) {
      Logger.error('Failed to get project information from Java Language Server', error);
      window.showErrorMessage("Failed to get project information. Make sure you have a valid Java project open.");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error('An error occurred during workspace analysis', error);
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
      Logger.log('Cannot resolve full paths without an active workspace.');
      return bugs;
    }

    try {
      const classpathsResult = await commands.executeCommand<any>(
        JavaLanguageServerCommands.GET_CLASSPATHS
      );

      if (classpathsResult && classpathsResult.sourcepaths && Array.isArray(classpathsResult.sourcepaths) && classpathsResult.sourcepaths.length > 0) {
        const sourcepaths: string[] = classpathsResult.sourcepaths;
        Logger.log(`Found source paths: ${sourcepaths.join(', ')}`);

        for (const bug of bugs) {
          if (!bug.realSourcePath) continue;

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
        Logger.log('No source paths available from Java Language Server; skipping path enrichment');
      }
    } catch (error) {
      Logger.log(`Warning: Could not get source paths for path enrichment (${error instanceof Error ? error.message : String(error)})`);
    }
  } catch (e) {
    Logger.log(`Warning: Failed to enrich bugs with full paths (${e instanceof Error ? e.message : String(e)})`);
  }

  return bugs;
}
