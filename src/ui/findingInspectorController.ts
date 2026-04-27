import { Disposable, TreeItem, TreeView } from 'vscode';
import {
  CategoryGroupItem,
  FindingItem,
  PatternGroupItem,
} from './findingTreeItem';
import { FindingInspectorState } from './findingInspectorState';

export function bindFindingInspectorToTree(
  treeView: TreeView<TreeItem>,
  inspectorState: FindingInspectorState
): Disposable {
  return treeView.onDidChangeSelection((event) => {
    const selected = event.selection[0];
    if (selected instanceof FindingItem) {
      inspectorState.select(selected.finding);
      return;
    }

    if (selected instanceof CategoryGroupItem || selected instanceof PatternGroupItem) {
      inspectorState.retainCurrent();
    }
  });
}
