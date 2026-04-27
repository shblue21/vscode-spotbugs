import * as assert from 'assert';
import { formatFindingSummary } from '../formatters/findingFormatting';
import { Bug } from '../model/bug';

function makeBug(overrides: Partial<Bug>): Bug {
  return {
    type: 'NP',
    rank: 10,
    priority: 'M',
    category: 'BAD_PRACTICE',
    abbrev: 'NP',
    message: 'NP: Something in Foo',
    sourceFile: 'Foo.java',
    startLine: 10,
    endLine: 10,
    realSourcePath: 'com/foo/Foo.java',
    ...overrides,
  };
}

describe('formatFindingSummary', () => {
  it('strips pattern prefix and " in " suffix', () => {
    const bug = makeBug({ message: 'NP: Null pointer in foo.Bar' });
    assert.strictEqual(formatFindingSummary(bug), '[NP] Null pointer');
  });

  it('uses plain message when no prefix exists', () => {
    const bug = makeBug({ abbrev: 'UR', type: 'UR', message: 'Uninitialized read in foo.Baz' });
    assert.strictEqual(formatFindingSummary(bug), '[UR] Uninitialized read');
  });

  it('falls back to bug type when message is empty', () => {
    const bug = makeBug({ abbrev: '', type: 'DMI', message: '   ' });
    assert.strictEqual(formatFindingSummary(bug), '[DMI] DMI');
  });
});
