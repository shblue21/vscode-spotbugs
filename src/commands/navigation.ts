import { window, Uri, Range, Position, TextDocumentShowOptions } from 'vscode';
import { BugInfo } from '../models/bugInfo';
import { Logger } from '../core/logger';
import { resolveSourceFullPath } from '../services/pathResolver';
import { VsCodeNotifier } from '../core/notifier';

async function resolveBugFilePath(bug: BugInfo): Promise<string | null> {
  if (bug.fullPath) return bug.fullPath;
  if (!bug.realSourcePath) {
    Logger.error('No realSourcePath available for bug');
    return null;
  }
  const full = await resolveSourceFullPath(bug.realSourcePath);
  if (!full) {
    Logger.error(`Could not resolve file path for: ${bug.realSourcePath}`);
  }
  return full;
}

/**
 * Opens a source file and navigates to the specified bug location
 * @param bug The bug information containing file path and line details
 */
export async function openBugLocation(bug: BugInfo): Promise<void> {
  try {
    Logger.log(`Opening bug location: ${bug.message} at line ${bug.startLine}`);
    const notifier = new VsCodeNotifier();

    const filePath = await resolveBugFilePath(bug);

    if (!filePath) {
      const errorMsg = `Cannot open file: Could not resolve path for ${bug.realSourcePath || 'unknown file'}`;
      Logger.error(errorMsg);
      notifier.error(errorMsg);
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
    const notifier = new VsCodeNotifier();
    notifier.error(`Failed to open file: ${errorMessage}`);
  }
}
