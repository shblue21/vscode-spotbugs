import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import type { Finding } from '../model/finding';

installVscodeMock();

describe('spotbugsTreeDataProvider', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('renders analysis failure as a distinct tree state', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();

    provider.showAnalysisFailure(
      'SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
      'ANALYSIS_FAILED'
    );

    const children = await provider.getChildren();

    assert.strictEqual(children.length, 1);
    assert.strictEqual(
      children[0].label,
      'SpotBugs analysis failed: [ANALYSIS_FAILED] boom'
    );
    assert.strictEqual(children[0].description, 'ANALYSIS_FAILED');
    assert.strictEqual(children[0].contextValue, 'spotbugs.message.error');
    assert.deepStrictEqual(provider.getCachedFindings(), []);
    assert.deepStrictEqual(provider.getAllFindings(), []);
  });

  it('keeps workspace project failures visible when all projects fail', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();

    provider.showWorkspaceResults([
      {
        projectUri: 'file:///workspace/project-a',
        findings: [],
        error: 'SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
        errorCode: 'ANALYSIS_FAILED',
      },
      {
        projectUri: 'file:///workspace/project-b',
        findings: [],
        error: 'SpotBugs could not build the project.',
        errorCode: 'no-class-targets',
      },
    ]);

    const children = await provider.getChildren();

    assert.strictEqual(children.length, 2);
    assert.strictEqual(children[0].label, 'project-a');
    assert.strictEqual(
      children[0].description,
      'Failed: SpotBugs analysis failed: [ANALYSIS_FAILED] boom'
    );
    assert.strictEqual(children[1].label, 'project-b');
    assert.strictEqual(
      children[1].description,
      'Skipped: SpotBugs could not build the project.'
    );
    assert.ok(!children.some((item) => item.label === 'No issues found.'));
    assert.deepStrictEqual(provider.getCachedFindings(), []);
    assert.deepStrictEqual(provider.getAllFindings(), []);
  });

  it('renders workspace project failures before successful finding groups', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();

    provider.showWorkspaceResults([
      {
        projectUri: 'file:///workspace/project-a',
        findings: [],
        error: 'SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
        errorCode: 'ANALYSIS_FAILED',
      },
      {
        projectUri: 'file:///workspace/project-b',
        findings: [makeFinding()],
      },
    ]);

    const children = await provider.getChildren();

    assert.strictEqual(children.length, 2);
    assert.strictEqual(children[0].label, 'project-a');
    assert.strictEqual(
      children[0].description,
      'Failed: SpotBugs analysis failed: [ANALYSIS_FAILED] boom'
    );
    assert.strictEqual(children[1].label, 'Correctness (1)');
    assert.deepStrictEqual(provider.getCachedFindings(), [makeFinding()]);
    assert.deepStrictEqual(provider.getAllFindings(), [makeFinding()]);

    provider.setFilter('category', 'Correctness');
    const filteredChildren = await provider.getChildren();

    assert.strictEqual(filteredChildren.length, 2);
    assert.strictEqual(filteredChildren[0].label, 'project-a');
    assert.strictEqual(
      filteredChildren[0].description,
      'Failed: SpotBugs analysis failed: [ANALYSIS_FAILED] boom'
    );
    assert.strictEqual(filteredChildren[1].label, 'Correctness (1)');

    provider.clearFilters();
    const clearedChildren = await provider.getChildren();

    assert.strictEqual(clearedChildren.length, 2);
    assert.strictEqual(clearedChildren[0].label, 'project-a');
    assert.strictEqual(
      clearedChildren[0].description,
      'Failed: SpotBugs analysis failed: [ANALYSIS_FAILED] boom'
    );
    assert.strictEqual(clearedChildren[1].label, 'Correctness (1)');
  });

  it('preserves existing initial state wording before results exist', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();

    const children = await provider.getChildren();

    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].label, 'Ready to analyze. Click the bug icon to start.');
  });

  it('applies search before grouping and exposes visible findings', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();
    const visible = makeFinding({
      patternId: 'SQL_INJECTION',
      message: 'SQL: CWE-89 risk',
      cweId: 89,
    });
    const hidden = makeFinding({
      patternId: 'NP_ALWAYS_NULL',
      message: 'NP: Null pointer',
    });

    provider.showResults([hidden, visible]);
    provider.setSearchQuery('CWE-89');

    const children = await provider.getChildren();

    assert.deepStrictEqual(provider.getAllFindings(), [visible]);
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].label, 'Correctness (1)');
  });

  it('applies filters before search and exposes the same visible set to export selection', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const selection = await import('../ui/selection');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();
    const filterOnly = makeFinding({
      patternId: 'NP_ALWAYS_NULL',
      type: 'NP_ALWAYS_NULL',
      category: 'Correctness',
      message: 'NP: Null pointer',
    });
    const searchOnly = makeFinding({
      patternId: 'SQL_INJECTION',
      type: 'SQL_INJECTION',
      category: 'Security',
      message: 'SQL: CWE-89 risk',
      cweId: 89,
    });

    provider.showResults([filterOnly, searchOnly]);
    provider.setFilter('category', 'Correctness');
    provider.setSearchQuery('CWE-89');

    const children = await provider.getChildren();

    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].label, 'No cached findings match the current view.');
    assert.strictEqual(children[0].description, 'Category: Correctness | Search: "CWE-89"');
    assert.deepStrictEqual(provider.getAllFindings(), []);
    assert.deepStrictEqual(selection.resolveSpotBugsSelection(provider, undefined), []);
  });

  it('preserves the default category pattern tree and scoped findings', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();
    const first = makeFinding({
      patternId: 'NP',
      type: 'NP_NULL_ON_SOME_PATH',
      abbrev: 'NP',
      category: 'Correctness',
      message: 'NP: Null pointer in Foo',
    });
    const second = makeFinding({
      patternId: 'SQL',
      type: 'SQL_INJECTION',
      abbrev: 'SQL',
      category: 'Security',
      message: 'SQL: Injection risk',
    });

    provider.showResults([first, second]);

    const categories = await provider.getChildren();
    assert.strictEqual(categories.length, 2);
    assert.strictEqual(categories[0].label, 'Correctness (1)');
    assert.strictEqual(categories[0].contextValue, 'spotbugs.category');
    assert.deepStrictEqual(provider.getFindingsForNode(categories[0]), [first]);

    const patterns = await provider.getChildren(categories[0]);
    assert.strictEqual(patterns.length, 1);
    assert.strictEqual(patterns[0].contextValue, 'spotbugs.pattern');
    assert.deepStrictEqual(provider.getFindingsForNode(patterns[0]), [first]);

    const leaves = await provider.getChildren(patterns[0]);
    assert.strictEqual(leaves.length, 1);
    assert.strictEqual(leaves[0].contextValue, 'spotbugs.bug');
    assert.deepStrictEqual(provider.getFindingsForNode(leaves[0]), [first]);
  });

  it('renders generic package groups and preserves scoped findings', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const findingTreeItem = await import('../ui/findingTreeItem');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();
    const first = makeFinding({ className: 'com.acme.First' });
    const second = makeFinding({ className: undefined, location: {} });

    provider.showResults([first, second]);
    provider.setGroupBy('package');

    const children = await provider.getChildren();
    assert.strictEqual(children.length, 2);
    assert.ok(children[0] instanceof findingTreeItem.GenericGroupItem);
    assert.strictEqual(children[0].contextValue, 'spotbugs.group');
    assert.deepStrictEqual(provider.getFindingsForNode(children[0]), [first]);
    assert.strictEqual(children[1].label, 'Unknown package (1)');
    assert.deepStrictEqual(provider.getFindingsForNode(children[1]), [second]);
  });

  it('resolves generic group findings for scoped export', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const selection = await import('../ui/selection');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();
    const selected = makeFinding({ className: 'com.acme.Example' });
    const other = makeFinding({ className: 'org.example.Other' });

    provider.showResults([selected, other]);
    provider.setGroupBy('package');

    const children = await provider.getChildren();
    const selectedGroup = children.find((child) => child.label === 'com.acme (1)');

    assert.ok(selectedGroup, 'Expected com.acme package group');
    assert.deepStrictEqual(selection.resolveSpotBugsSelection(provider, selectedGroup), [selected]);
  });

  it('preserves group and sort on new results and resets them on reset', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();

    provider.showResults([makeFinding()]);
    provider.setGroupBy('path');
    provider.setSortBy('rule');
    provider.setSearchQuery('NP');
    provider.setFilter('category', 'Correctness');
    provider.showResults([makeFinding({ patternId: 'SQL' })]);

    assert.strictEqual(provider.getGroupBy(), 'path');
    assert.strictEqual(provider.getSortBy(), 'rule');
    assert.strictEqual(provider.getSearchQuery(), '');
    assert.deepStrictEqual(provider.getActiveFilters(), {});

    provider.showInitialMessage();

    assert.strictEqual(provider.getGroupBy(), 'category');
    assert.strictEqual(provider.getSortBy(), 'severityRank');
    assert.strictEqual(provider.getSearchQuery(), '');
  });

  it('preserves group and sort on new workspace results while clearing transient state', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();

    provider.showWorkspaceResults([
      { projectUri: 'file:///workspace/project-a', findings: [makeFinding()] },
    ]);
    provider.setGroupBy('path');
    provider.setSortBy('rule');
    provider.setSearchQuery('NP');
    provider.setFilter('category', 'Correctness');

    provider.showWorkspaceResults([
      {
        projectUri: 'file:///workspace/project-a',
        findings: [makeFinding({ patternId: 'SQL' })],
      },
    ]);

    assert.strictEqual(provider.getGroupBy(), 'path');
    assert.strictEqual(provider.getSortBy(), 'rule');
    assert.strictEqual(provider.getSearchQuery(), '');
    assert.deepStrictEqual(provider.getActiveFilters(), {});
    assert.strictEqual(provider.getCachedFindings().length, 1);
  });

  it('clears transient search and filters during loading, failure, and workspace progress without resetting group or sort', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();

    for (const transition of [
      () => provider.showLoading(),
      () => provider.showAnalysisFailure('SpotBugs analysis failed: boom', 'ANALYSIS_FAILED'),
      () => provider.showWorkspaceProgress(['file:///workspace/project-a']),
    ]) {
      provider.showResults([makeFinding()]);
      provider.setGroupBy('path');
      provider.setSortBy('rule');
      provider.setSearchQuery('NP');
      provider.setFilter('category', 'Correctness');

      transition();

      assert.strictEqual(provider.getGroupBy(), 'path');
      assert.strictEqual(provider.getSortBy(), 'rule');
      assert.strictEqual(provider.getSearchQuery(), '');
      assert.deepStrictEqual(provider.getActiveFilters(), {});
      assert.deepStrictEqual(provider.getCachedFindings(), []);
      assert.deepStrictEqual(provider.getAllFindings(), []);
    }
  });

  it('keeps no cached results distinct from search and filter empty states', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();

    provider.showResults([]);
    provider.setSearchQuery('NP');
    provider.setFilter('category', 'Correctness');

    const children = await provider.getChildren();

    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].label, 'No issues found.');
    assert.strictEqual(children[0].description, undefined);
    assert.deepStrictEqual(provider.getCachedFindings(), []);
    assert.deepStrictEqual(provider.getAllFindings(), []);
  });

  it('keeps workspace status items visible when search hides all findings', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();

    provider.showWorkspaceResults([
      {
        projectUri: 'file:///workspace/project-a',
        findings: [],
        error: 'SpotBugs analysis failed: [ANALYSIS_FAILED] boom',
        errorCode: 'ANALYSIS_FAILED',
      },
      {
        projectUri: 'file:///workspace/project-b',
        findings: [makeFinding({ patternId: 'NP_ALWAYS_NULL', message: 'NP: Null pointer' })],
      },
    ]);
    provider.setSearchQuery('CWE-89');

    const children = await provider.getChildren();

    assert.strictEqual(children.length, 2);
    assert.strictEqual(children[0].label, 'project-a');
    assert.strictEqual(
      children[0].description,
      'Failed: SpotBugs analysis failed: [ANALYSIS_FAILED] boom'
    );
    assert.strictEqual(children[1].label, 'No cached findings match the current view.');
    assert.strictEqual(children[1].description, 'Search: "CWE-89"');
    assert.deepStrictEqual(provider.getAllFindings(), []);
  });

  it('renders workspace cancellation without clearing group and sort', async () => {
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();

    provider.showResults([makeFinding()]);
    provider.setGroupBy('package');
    provider.setSortBy('rule');
    provider.showWorkspaceProgress(['file:///workspace/project-a']);
    provider.setSearchQuery('NP');
    provider.setFilter('category', 'Correctness');
    provider.showWorkspaceCancelled();

    const children = await provider.getChildren();
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].label, 'SpotBugs workspace analysis cancelled.');
    assert.strictEqual(children[0].contextValue, 'spotbugs.message');
    assert.deepStrictEqual(provider.getCachedFindings(), []);
    assert.deepStrictEqual(provider.getAllFindings(), []);
    assert.strictEqual(provider.getGroupBy(), 'package');
    assert.strictEqual(provider.getSortBy(), 'rule');
    assert.strictEqual(provider.getSearchQuery(), '');
    assert.deepStrictEqual(provider.getActiveFilters(), {});
  });
});

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    patternId: 'NP_ALWAYS_NULL',
    type: 'NP_ALWAYS_NULL',
    abbrev: 'NP',
    category: 'Correctness',
    message: 'NP: Null pointer in Foo',
    location: {
      fullPath: '/workspace/project-b/src/Foo.java',
      startLine: 10,
    },
    ...overrides,
  };
}
