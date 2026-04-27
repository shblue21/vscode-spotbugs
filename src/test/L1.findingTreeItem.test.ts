import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();

describe('findingTreeItem', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('does not attach a primary click command to finding leaves', async () => {
    const findingTreeItem = await import('../ui/findingTreeItem');
    const item = new findingTreeItem.FindingItem({
      patternId: 'NP_ALWAYS_NULL',
      type: 'NP_ALWAYS_NULL',
      abbrev: 'NP',
      message: 'Null pointer',
      location: {
        fullPath: '/tmp/Example.java',
        startLine: 10,
      },
    });

    assert.strictEqual(item.contextValue, 'spotbugs.bug');
    assert.strictEqual(item.command, undefined);
  });
});
