import { window, Uri, Range, Position, TextDocumentShowOptions, workspace, commands } from "vscode";
import { BugInfo } from "../bugInfo";
import { Logger } from "../logger";
import { JavaLanguageServerCommands } from "../constants/commands";
import * as path from "path";

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
    Logger.error("No realSourcePath available for bug");
    return null;
  }

  // Try to resolve using Java Language Server classpaths
  try {
    const classpathsResult = await commands.executeCommand<any>(
      JavaLanguageServerCommands.GET_CLASSPATHS,
    );

    if (classpathsResult && classpathsResult.sourcepaths) {
      const sourcepaths: string[] = classpathsResult.sourcepaths;
      Logger.log(
        `Resolving path for ${bug.realSourcePath} using source paths: ${sourcepaths.join(", ")}`,
      );

      for (const sourcePath of sourcepaths) {
        const candidatePath = path.join(sourcePath, bug.realSourcePath);
        try {
          await workspace.fs.stat(Uri.file(candidatePath));
          Logger.log(`Found file at: ${candidatePath}`);
          return candidatePath;
        } catch {
          // File doesn't exist at this path, try next
        }
      }
    }
  } catch (error) {
    Logger.error("Failed to get classpaths", error);
  }

  // Try common Java project structure fallbacks
  const workspaceFolder = workspace.workspaceFolders ? workspace.workspaceFolders[0] : undefined;
  if (workspaceFolder) {
    const commonPaths = [
      path.join(workspaceFolder.uri.fsPath, "src", "main", "java", bug.realSourcePath), // Maven standard
      path.join(workspaceFolder.uri.fsPath, "src", bug.realSourcePath), // Simple src structure
      path.join(workspaceFolder.uri.fsPath, bug.realSourcePath), // Direct workspace relative
    ];

    for (const candidatePath of commonPaths) {
      try {
        await workspace.fs.stat(Uri.file(candidatePath));
        Logger.log(`Found file at fallback path: ${candidatePath}`);
        return candidatePath;
      } catch {
        // Continue to next candidate
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
      const errorMsg = `Cannot open file: Could not resolve path for ${bug.realSourcePath || "unknown file"}`;
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
      new Position(endLineZeroBased, Number.MAX_SAFE_INTEGER),
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
    Logger.error("Failed to open bug location", error);
    window.showErrorMessage(`Failed to open file: ${errorMessage}`);
  }
}
