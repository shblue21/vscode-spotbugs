import { Uri } from 'vscode';
import { Logger } from '../core/logger';
import { BugInfo } from '../models/bugInfo';
import { resolveSourceFullPath } from './pathResolver';

/**
 * Resolve SpotBugs findings to absolute file paths when possible.
 */
export async function enrichBugFindings(
  bugs: BugInfo[],
  preferredProject?: Uri
): Promise<BugInfo[]> {
  if (!bugs.length) {
    return [];
  }

  for (const bug of bugs) {
    if (!bug.realSourcePath) continue;
    try {
      const full = await resolveSourceFullPath(bug.realSourcePath, preferredProject);
      if (full) {
        bug.fullPath = full;
      } else {
        Logger.log(`Could not resolve full path for: ${bug.realSourcePath}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.log(`Path resolve failed for ${bug.realSourcePath}: ${message}`);
    }
  }
  return bugs;
}

