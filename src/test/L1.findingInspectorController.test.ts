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
    await tree.fireSelection(leaf);
    assert.strictEqual(state.current.status, 'selected');
    assert.strictEqual(state.current.finding, finding);

    await tree.fireSelection(category);
    assertInspectorFinding(state.current, 'retained', finding);
  });

  it('selects finding leaves then previews the finding source when enabled', async () => {
    const { bindFindingInspectorToTree } = await import('../ui/findingInspectorController');
    const findingInspectorState = await import('../ui/findingInspectorState');
    const findingTreeItem = await import('../ui/findingTreeItem');
    const finding = makeFinding();
    const leaf = new findingTreeItem.FindingItem(finding);
    const state = new findingInspectorState.FindingInspectorState();
    const tree = createTreeHarness();
    const previews: Array<{
      finding: Finding;
      preserveFocus?: boolean;
      preview?: boolean;
      isCurrentRequest: () => boolean;
    }> = [];

    bindFindingInspectorToTree(tree.view, state, {
      revealSourceOnSelection: () => true,
      revealFindingSource: async (nextFinding, options) => {
        previews.push({ finding: nextFinding, ...options });
      },
    });
    await tree.fireSelection(leaf);

    assert.strictEqual(state.current.status, 'selected');
    assert.strictEqual(state.current.finding, finding);
    assert.strictEqual(previews.length, 1);
    assert.strictEqual(previews[0].finding, finding);
    assert.strictEqual(previews[0].preserveFocus, true);
    assert.strictEqual(previews[0].preview, true);
    assert.strictEqual(previews[0].isCurrentRequest(), true);
  });

  it('marks older finding source previews stale after a newer finding selection', async () => {
    const { bindFindingInspectorToTree } = await import('../ui/findingInspectorController');
    const findingInspectorState = await import('../ui/findingInspectorState');
    const findingTreeItem = await import('../ui/findingTreeItem');
    const firstFinding = makeFinding({ patternId: 'FIRST' });
    const secondFinding = makeFinding({ patternId: 'SECOND' });
    const state = new findingInspectorState.FindingInspectorState();
    const tree = createTreeHarness();
    const previews: Array<{ finding: Finding; isCurrentRequest: () => boolean }> = [];

    bindFindingInspectorToTree(tree.view, state, {
      revealSourceOnSelection: () => true,
      revealFindingSource: async (nextFinding, options) => {
        previews.push({
          finding: nextFinding,
          isCurrentRequest: options.isCurrentRequest,
        });
      },
    });

    const firstSelection = tree.fireSelection(new findingTreeItem.FindingItem(firstFinding));
    const secondSelection = tree.fireSelection(new findingTreeItem.FindingItem(secondFinding));
    await Promise.all([firstSelection, secondSelection]);

    assert.strictEqual(previews.length, 2);
    assert.strictEqual(previews[0].finding, firstFinding);
    assert.strictEqual(previews[0].isCurrentRequest(), false);
    assert.strictEqual(previews[1].finding, secondFinding);
    assert.strictEqual(previews[1].isCurrentRequest(), true);
  });

  it('marks pending finding source previews stale after group selection', async () => {
    const { bindFindingInspectorToTree } = await import('../ui/findingInspectorController');
    const findingInspectorState = await import('../ui/findingInspectorState');
    const findingTreeItem = await import('../ui/findingTreeItem');
    const finding = makeFinding();
    const pattern = new findingTreeItem.PatternGroupItem('NP_ALWAYS_NULL', [finding]);
    const state = new findingInspectorState.FindingInspectorState();
    const tree = createTreeHarness();
    let isCurrentRequest: (() => boolean) | undefined;

    bindFindingInspectorToTree(tree.view, state, {
      revealSourceOnSelection: () => true,
      revealFindingSource: async (_nextFinding, options) => {
        isCurrentRequest = options.isCurrentRequest;
      },
    });

    await tree.fireSelection(new findingTreeItem.FindingItem(finding));
    assert.strictEqual(isCurrentRequest?.(), true);

    await tree.fireSelection(pattern);

    assert.strictEqual(isCurrentRequest?.(), false);
  });

  it('does not preview the finding source when selection reveal is disabled', async () => {
    const { bindFindingInspectorToTree } = await import('../ui/findingInspectorController');
    const findingInspectorState = await import('../ui/findingInspectorState');
    const findingTreeItem = await import('../ui/findingTreeItem');
    const finding = makeFinding();
    const leaf = new findingTreeItem.FindingItem(finding);
    const state = new findingInspectorState.FindingInspectorState();
    const tree = createTreeHarness();
    let previewCount = 0;

    bindFindingInspectorToTree(tree.view, state, {
      revealSourceOnSelection: () => false,
      revealFindingSource: async () => {
        previewCount += 1;
      },
    });
    await tree.fireSelection(leaf);

    assert.strictEqual(state.current.status, 'selected');
    assert.strictEqual(state.current.finding, finding);
    assert.strictEqual(previewCount, 0);
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
    await tree.fireSelection(leaf);
    await tree.fireSelection(pattern);

    assert.strictEqual(state.current.status, 'retained');
    assert.strictEqual(state.current.finding, finding);
  });

  it('retains current finding and stales preview on generic group selection', async () => {
    const { bindFindingInspectorToTree } = await import('../ui/findingInspectorController');
    const findingInspectorState = await import('../ui/findingInspectorState');
    const findingTreeItem = await import('../ui/findingTreeItem');
    const finding = makeFinding();
    const state = new findingInspectorState.FindingInspectorState();
    const tree = createTreeHarness();
    let isCurrentRequest: (() => boolean) | undefined;

    bindFindingInspectorToTree(tree.view, state, {
      revealSourceOnSelection: () => true,
      revealFindingSource: async (_nextFinding, options) => {
        isCurrentRequest = options.isCurrentRequest;
      },
    });

    await tree.fireSelection(new findingTreeItem.FindingItem(finding));
    assert.strictEqual(isCurrentRequest?.(), true);

    await tree.fireSelection(
      new findingTreeItem.GenericGroupItem('com.acme', 'package', 'com.acme', [finding], [])
    );

    assert.strictEqual(state.current.status, 'retained');
    assert.strictEqual(state.current.finding, finding);
    assert.strictEqual(isCurrentRequest?.(), false);
  });

  it('ignores unknown and status selections', async () => {
    const { bindFindingInspectorToTree } = await import('../ui/findingInspectorController');
    const findingInspectorState = await import('../ui/findingInspectorState');
    const findingTreeItem = await import('../ui/findingTreeItem');
    const finding = makeFinding();
    const state = new findingInspectorState.FindingInspectorState();
    const tree = createTreeHarness();

    bindFindingInspectorToTree(tree.view, state);
    await tree.fireSelection(
      new findingTreeItem.ProjectStatusItem('project', 'Analyzing project')
    );
    await tree.fireSelection({ label: 'message' });
    assert.strictEqual(state.current.status, 'empty');

    await tree.fireSelection(new findingTreeItem.FindingItem(finding));
    await tree.fireSelection(
      new findingTreeItem.ProjectStatusItem('project', 'Analyzing project')
    );
    await tree.fireSelection({ label: 'message' });

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
  fireSelection: (selection: unknown) => Promise<unknown>;
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
      return Promise.resolve(listener?.({ selection: [selection] }));
    },
  };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    patternId: 'NP_ALWAYS_NULL',
    type: 'NP_ALWAYS_NULL',
    abbrev: 'NP',
    message: 'Null pointer',
    location: {
      fullPath: '/tmp/Example.java',
      startLine: 1,
    },
    ...overrides,
  };
}
