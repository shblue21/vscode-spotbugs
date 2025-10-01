import { Uri } from 'vscode';
import { executeJavaLanguageServerCommand } from '../core/command';
import { SpotBugsLSCommands } from '../constants/commands';
import { Logger } from '../core/logger';
import { Config } from '../core/config';
import { BugInfo } from '../models/bugInfo';
import { getClasspaths } from './classpathService';
import { enrichBugFindings } from './findingEnricher';

export async function analyzeFile(config: Config, uri: Uri): Promise<BugInfo[]> {
  try {
    if (uri.fsPath.endsWith('.java') || uri.fsPath.endsWith('.class')) {
      try {
        const cp = await getClasspaths(uri);
        if (cp && Array.isArray(cp.classpaths) && cp.classpaths.length > 0) {
          config.setClasspaths(cp.classpaths);
          Logger.log(`Set ${cp.classpaths.length} classpaths for analysis`);
        } else {
          Logger.log('No classpaths returned from Java Language Server; using system classpath');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.log(
          `Warning: Could not get project classpaths (${message}), using system classpath`
        );
      }
    }

    return await runConfiguredAnalysis(config, uri.fsPath, uri);
  } catch (error) {
    Logger.error('Analyzer: analyzeFile failed', error);
    return [];
  }
}

export async function runConfiguredAnalysis(
  config: Config,
  targetPath: string,
  preferredProject?: Uri
): Promise<BugInfo[]> {
  const result = await executeJavaLanguageServerCommand<string>(
    SpotBugsLSCommands.RUN_ANALYSIS,
    targetPath,
    JSON.stringify(config)
  );

  if (!result) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch (error) {
    Logger.error('Failed to parse analysis result', error);
    return [];
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    (parsed as { error?: unknown }).error
  ) {
    const message = String((parsed as { error?: unknown }).error);
    Logger.error(`SpotBugs analysis error: ${message}`);
    return [];
  }

  const bugs = Array.isArray(parsed) ? (parsed as BugInfo[]) : [];
  const enriched = await enrichBugFindings(bugs, preferredProject);
  Logger.log(`Successfully parsed and enriched ${enriched.length} bugs.`);
  return enriched;
}

