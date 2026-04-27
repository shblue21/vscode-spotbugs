import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import { Finding } from '../model/finding';

installVscodeMock();

describe('findingInspectorController', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('selects finding leaves and retains on category selection', async () => {
    const { bindFindingInspectorToTree } = await import('../ui/findingInspectorController');
    const findingInspectorState = await import('../ui/findingInspectorState');
    const findingTreeItem = await import(
      '../ui/findingTreeItem'
    );
    const finding = makeFinding();
    const leaf = new findingTreeItem.FindingItem(finding);
    const pattern = new findingTreeItem.PatternGroupItem('NP_ALWAYS_NULL', [finding]);
    const category = new findingTreeItem.CategoryGroupItem('CORRECTNESS', [pattern], 1);
    const state = new findingInspectorState.FindingInspectorState();
    const tree = createTreeHarness();

    bindFindingInspectorToTree(tree.view, state);
    tree.fireSelection(leaf);
    assert.strictEqual(state.current.status, 'selected');
    assert.strictEqual(state.current.finding, finding);

    tree.fireSelection(category);
    assertInspectorFinding(state.current, 'retained', finding);
  });

  it('retains current finding on pattern selection', async () => {
    const { bindFindingInspectorToTree } = await import('../ui/findingInspectorController');
    const findingInspectorState = await import('../ui/findingInspectorState');
    const findingTreeItem = await import('../ui/findingTreeItem');
    const finding = makeFinding();
    const leaf = new findingTreeItem.FindingItem(finding);
    const pattern = new findingTreeItem.PatternGroupItem('NP_ALWAYS_NULL', [finding]);
    const state = new findingInspectorState.FindingInspectorState();
    const tree = createTreeHarness();

    bindFindingInspectorToTree(tree.view, state);
    tree.fireSelection(leaf);
    tree.fireSelection(pattern);

    assert.strictEqual(state.current.status, 'retained');
    assert.strictEqual(state.current.finding, finding);
  });

  it('ignores unknown and status selections', async () => {
    const { bindFindingInspectorToTree } = await import('../ui/findingInspectorController');
    const findingInspectorState = await import('../ui/findingInspectorState');
    const findingTreeItem = await import('../ui/findingTreeItem');
    const finding = makeFinding();
    const state = new findingInspectorState.FindingInspectorState();
    const tree = createTreeHarness();

    bindFindingInspectorToTree(tree.view, state);
    tree.fireSelection(new findingTreeItem.ProjectStatusItem('project', 'Analyzing project'));
    tree.fireSelection({ label: 'message' });
    assert.strictEqual(state.current.status, 'empty');

    tree.fireSelection(new findingTreeItem.FindingItem(finding));
    tree.fireSelection(new findingTreeItem.ProjectStatusItem('project', 'Analyzing project'));
    tree.fireSelection({ label: 'message' });

    assertInspectorFinding(state.current, 'selected', finding);
  });
});

function assertInspectorFinding(
  snapshot: { status: string; finding?: Finding },
  status: string,
  finding: Finding
): void {
  assert.strictEqual(snapshot.status, status);
  assert.strictEqual(snapshot.finding, finding);
}

function createTreeHarness(): {
  view: never;
  fireSelection: (selection: unknown) => void;
} {
  let listener: ((event: { selection: unknown[] }) => unknown) | undefined;
  return {
    view: {
      onDidChangeSelection: (nextListener: (event: { selection: unknown[] }) => unknown) => {
        listener = nextListener;
        return { dispose: () => undefined };
      },
    } as never,
    fireSelection: (selection: unknown) => {
      listener?.({ selection: [selection] });
    },
  };
}

function makeFinding(): Finding {
  return {
    patternId: 'NP_ALWAYS_NULL',
    type: 'NP_ALWAYS_NULL',
    abbrev: 'NP',
    message: 'Null pointer',
    location: {
      fullPath: '/tmp/Example.java',
      startLine: 1,
    },
  };
}
