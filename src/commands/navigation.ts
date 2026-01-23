import { window, Uri, Range, Position, TextDocumentShowOptions } from 'vscode';
import { Finding } from '../model/finding';
import { Logger } from '../core/logger';
import { defaultNotifier } from '../core/notifier';
import { resolveBugFilePath } from '../workspace/sourceLocator';

/**
 * Opens a source file and navigates to the specified finding location
 * @param finding The finding information containing file path and line details
 */
export async function openBugLocation(finding: Finding): Promise<void> {
  try {
    Logger.log(`Opening bug location: ${finding.message ?? 'SpotBugs finding'}`);
    const notifier = defaultNotifier;

    const filePath = await resolveBugFilePath(finding);

    if (!filePath) {
      const errorMsg = `Cannot open file: Could not resolve path for ${finding.location.realSourcePath || 'unknown file'}`;
      Logger.error(errorMsg);
      notifier.error(errorMsg);
      return;
    }

    const fileUri = Uri.file(filePath);

    const startLine = normalizeLineNumber(finding.location.startLine);
    const endLine = normalizeLineNumber(
      finding.location.endLine ?? finding.location.startLine
    );
    let range: Range | undefined;
    if (startLine !== undefined && endLine !== undefined) {
      // Calculate zero-based line numbers (VS Code uses zero-based indexing)
      const startLineZeroBased = Math.max(0, startLine - 1);
      const endLineZeroBased = Math.max(0, endLine - 1);
      range = new Range(
        new Position(startLineZeroBased, 0),
        new Position(endLineZeroBased, Number.MAX_SAFE_INTEGER)
      );
    }

    const options: TextDocumentShowOptions = {
      preserveFocus: false, // Focus the opened document
      preview: false, // Open in a permanent tab
    };
    if (range) {
      options.selection = range;
    }

    const lineInfo =
      startLine !== undefined ? ` at lines ${startLine}-${endLine ?? startLine}` : '';
    Logger.log(`Opening file: ${filePath}${lineInfo}`);
    await window.showTextDocument(fileUri, options);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error('Failed to open bug location', error);
    defaultNotifier.error(`Failed to open file: ${errorMessage}`);
  }
}

function normalizeLineNumber(line?: number): number | undefined {
  if (typeof line !== 'number' || Number.isNaN(line) || line <= 0) {
    return undefined;
  }
  return line;
}
