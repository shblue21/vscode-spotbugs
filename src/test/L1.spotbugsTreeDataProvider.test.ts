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
});

function makeFinding(): Finding {
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
  };
}
