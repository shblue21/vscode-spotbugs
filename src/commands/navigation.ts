import { l10n, window, Uri, Range, Position, TextDocumentShowOptions } from 'vscode';
import { Finding } from '../model/finding';
import { Logger } from '../core/logger';
import { defaultNotifier } from '../core/notifier';
import { resolveFindingFilePath } from '../workspace/findingLocator';

export interface RevealFindingSourceOptions {
  preserveFocus?: boolean;
  preview?: boolean;
  isCurrentRequest?: () => boolean;
}

/**
 * Reveals a source file and navigates to the specified finding location
 * @param finding The finding information containing file path and line details
 */
export async function revealFindingSource(
  finding: Finding,
  revealOptions: RevealFindingSourceOptions = {}
): Promise<void> {
  try {
    Logger.log(`Revealing finding source: ${finding.message ?? 'SpotBugs finding'}`);
    const notifier = defaultNotifier;

    const filePath = await resolveFindingFilePath(finding);

    if (revealOptions.isCurrentRequest?.() === false) {
      Logger.log('Skipping stale finding source reveal request.');
      return;
    }

    if (!filePath) {
      const errorMsg = l10n.t(
        'Cannot open file: Could not resolve path for {0}',
        finding.location.realSourcePath || l10n.t('unknown file')
      );
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
      preserveFocus: revealOptions.preserveFocus ?? false,
      preview: revealOptions.preview ?? false,
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
    Logger.error('Failed to reveal finding source', error);
    defaultNotifier.error(l10n.t('Failed to open file: {0}', errorMessage));
  }
}

function normalizeLineNumber(line?: number): number | undefined {
  if (typeof line !== 'number' || Number.isNaN(line) || line <= 0) {
    return undefined;
  }
  return line;
}
