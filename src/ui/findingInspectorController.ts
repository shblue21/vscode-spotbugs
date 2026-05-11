import { Disposable, TreeItem, TreeView } from 'vscode';
import {
  CategoryGroupItem,
  FindingItem,
  PatternGroupItem,
} from './findingTreeItem';
import { FindingInspectorState } from './findingInspectorState';
import { Finding } from '../model/finding';

export interface FindingSourcePreviewOptions {
  preserveFocus?: boolean;
  preview?: boolean;
  isCurrentRequest: () => boolean;
}

export interface FindingInspectorTreeBindingOptions {
  revealSourceOnSelection?: () => boolean;
  revealFindingSource?: (
    finding: Finding,
    options: FindingSourcePreviewOptions
  ) => Promise<void> | void;
}

export function bindFindingInspectorToTree(
  treeView: TreeView<TreeItem>,
  inspectorState: FindingInspectorState,
  options: FindingInspectorTreeBindingOptions = {}
): Disposable {
  let sourcePreviewRequestId = 0;

  return treeView.onDidChangeSelection(async (event) => {
    const requestId = ++sourcePreviewRequestId;
    const selected = event.selection[0];
    if (selected instanceof FindingItem) {
      inspectorState.select(selected.finding);
      if (options.revealSourceOnSelection?.() === true && options.revealFindingSource) {
        await options.revealFindingSource(selected.finding, {
          preserveFocus: true,
          preview: true,
          isCurrentRequest: () => requestId === sourcePreviewRequestId,
        });
      }
      return;
    }

    if (selected instanceof CategoryGroupItem || selected instanceof PatternGroupItem) {
      inspectorState.retainCurrent();
    }
  });
}
