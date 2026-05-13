import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import { Finding } from '../model/finding';

installVscodeMock();

describe('findingViewModel', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('uses shared facet labels in finding leaves', async () => {
    const { toFindingItemView } = await import('../ui/findingViewModel');
    const view = toFindingItemView(
      makeFinding({
        category: undefined,
        priority: 'unknown',
        rank: 14,
        location: { startLine: 0 },
      })
    );

    assert.strictEqual(view.description, 'Unknown source • Uncategorized');
    assert.ok(view.tooltip.includes('Category: Uncategorized'));
    assert.ok(view.tooltip.includes('Priority: Low'));
    assert.ok(view.tooltip.includes('File: Unknown source'));
    assert.ok(!view.tooltip.includes('Line: 0'));
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
