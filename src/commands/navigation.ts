import {
  window,
  Uri,
  Range,
  Position,
  TextDocumentShowOptions,
  workspace,
  commands,
} from 'vscode';
import { BugInfo } from '../bugInfo';
import { Logger } from '../logger';
import { JavaLanguageServerCommands } from '../constants/commands';
import * as path from 'path';
import { getClasspaths } from '../services/classpathService';

/**
 * Resolves the absolute path for a bug's source file
 */
async function resolveBugFilePath(bug: BugInfo): Promise<string | null> {
  // If we already have a full path, use it
  if (bug.fullPath) {
    return bug.fullPath;
  }

  // If we don't have a realSourcePath, we can't resolve
  if (!bug.realSourcePath) {
    Logger.error('No realSourcePath available for bug');
    return null;
  }

  // Try to resolve using Java Language Server source paths via service (best-effort)
  try {
    const workspaceFolder = workspace.workspaceFolders
      ? workspace.workspaceFolders[0]
      : undefined;
    const cp = await getClasspaths(workspaceFolder?.uri);
    if (cp && Array.isArray(cp.sourcepaths) && cp.sourcepaths.length > 0) {
      const sourcepaths: string[] = cp.sourcepaths;
      Logger.log(
        `Resolving path for ${bug.realSourcePath} using source paths: ${sourcepaths.join(', ')}`
      );
      for (const sourcePath of sourcepaths) {
        const candidatePath = path.join(sourcePath, bug.realSourcePath);
        try {
          await workspace.fs.stat(Uri.file(candidatePath));
          Logger.log(`Found file at: ${candidatePath}`);
          return candidatePath;
        } catch {
          // try next source path
        }
      }
    } else {
      Logger.log('No source paths from Java Language Server; trying fallbacks');
    }
  } catch (error) {
    // Do not treat as hard error; fall back to common project paths
    const msg = error instanceof Error ? error.message : String(error);
    Logger.log(`Could not get source paths for navigation: ${msg}`);
  }

  // Try common Java project structure fallbacks
  const workspaceFolder = workspace.workspaceFolders
    ? workspace.workspaceFolders[0]
    : undefined;
  if (workspaceFolder) {
    // Gather candidate roots from real Java projects, then workspace folder
    let projectUris: string[] = [];
    try {
      projectUris = (await commands.executeCommand<string[]>('java.project.getAll')) || [];
    } catch {
      projectUris = [];
    }
    const rootCandidates: string[] = [];
    for (const p of projectUris) {
      try {
        const fsPath = Uri.parse(p).fsPath;
        rootCandidates.push(fsPath);
      } catch {
        // ignore parse errors
      }
    }
    if (rootCandidates.length === 0) {
      rootCandidates.push(workspaceFolder.uri.fsPath);
    }

    const sourceRoots = [
      ['src', 'main', 'java'],
      ['src', 'test', 'java'],
      ['src'],
      [],
    ];

    for (const root of rootCandidates) {
      for (const segs of sourceRoots) {
        const base = path.join(root, ...segs);
        const candidatePath = path.join(base, bug.realSourcePath);
        try {
          await workspace.fs.stat(Uri.file(candidatePath));
          Logger.log(`Found file at fallback path: ${candidatePath}`);
          return candidatePath;
        } catch {
          // Continue to next candidate
        }
      }
    }
  }

  Logger.error(`Could not resolve file path for: ${bug.realSourcePath}`);
  return null;
}

/**
 * Opens a source file and navigates to the specified bug location
 * @param bug The bug information containing file path and line details
 */
export async function openBugLocation(bug: BugInfo): Promise<void> {
  try {
    Logger.log(`Opening bug location: ${bug.message} at line ${bug.startLine}`);

    const filePath = await resolveBugFilePath(bug);

    if (!filePath) {
      const errorMsg = `Cannot open file: Could not resolve path for ${bug.realSourcePath || 'unknown file'}`;
      Logger.error(errorMsg);
      window.showErrorMessage(errorMsg);
      return;
    }

    const fileUri = Uri.file(filePath);

    // Calculate zero-based line numbers (VS Code uses zero-based indexing)
    const startLineZeroBased = Math.max(0, bug.startLine - 1);
    const endLineZeroBased = Math.max(0, bug.endLine - 1);

    // Create range for selection (highlight the bug lines)
    const range = new Range(
      new Position(startLineZeroBased, 0),
      new Position(endLineZeroBased, Number.MAX_SAFE_INTEGER)
    );

    const options: TextDocumentShowOptions = {
      selection: range,
      preserveFocus: false, // Focus the opened document
      preview: false, // Open in a permanent tab
    };

    Logger.log(`Opening file: ${filePath} at lines ${bug.startLine}-${bug.endLine}`);
    await window.showTextDocument(fileUri, options);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error('Failed to open bug location', error);
    window.showErrorMessage(`Failed to open file: ${errorMessage}`);
  }
}
