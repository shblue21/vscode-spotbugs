import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import { Finding } from '../model/finding';

installVscodeMock();

describe('findingViewModel', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('omits source metadata from findings without paths', async () => {
    const { toFindingItemView } = await import('../ui/findingViewModel');
    const view = toFindingItemView(
      makeFinding({
        category: undefined,
        priority: 'unknown',
        rank: 14,
        location: { startLine: 10, endLine: 10 },
      })
    );

    assert.strictEqual(view.description, 'Uncategorized');
    assert.ok(view.tooltip.includes('Category: Uncategorized'));
    assert.ok(view.tooltip.includes('Priority: Low'));
    assert.ok(!view.tooltip.includes('File:'));
    assert.ok(!view.tooltip.includes('Line: 10'));
  });
});

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    patternId: 'NP',
    type: 'NP_ALWAYS_NULL',
    abbrev: 'NP',
    category: 'CORRECTNESS',
    priority: 'M',
    rank: 6,
    message: 'NP: Null pointer',
    location: {
      fullPath: '/workspace/src/Example.java',
      startLine: 10,
    },
    ...overrides,
  };
}
