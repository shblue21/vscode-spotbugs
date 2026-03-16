import * as assert from 'assert';
import {
  applyFindingFilters,
  createFilteredEmptyState,
  formatFindingFilterQuery,
  getFindingFilterOptions,
  parseFindingFilterQuery,
  validateFindingFilterQuery,
} from '../ui/findingFilters';
import { Finding } from '../model/finding';

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    patternId: 'NP',
    type: 'NP',
    rank: 10,
    priority: 'M',
    category: 'BAD_PRACTICE',
    abbrev: 'NP',
    message: 'NP: Null pointer in foo.Bar',
    className: 'com.acme.Foo',
    location: {
      sourceFile: 'Foo.java',
      realSourcePath: 'com/acme/Foo.java',
      fullPath: '/workspace/com/acme/Foo.java',
      startLine: 10,
      endLine: 10,
    },
    ...overrides,
  };
}

describe('findingFilters', () => {
  const findings: Finding[] = [
    makeFinding({ rank: 2 }),
    makeFinding({
      rank: 4,
      className: 'com.other.Foo',
      location: {
        sourceFile: 'Foo.java',
        realSourcePath: 'com/other/Foo.java',
        fullPath: '/workspace/com/other/Foo.java',
      },
    }),
    makeFinding({
      patternId: 'UR',
      type: 'UR',
      rank: 6,
      category: 'CORRECTNESS',
      abbrev: 'UR',
      message: 'UR: Unread value in foo.Bar',
      className: 'com.acme.Bar',
      location: {
        sourceFile: 'Bar.java',
        realSourcePath: 'com/acme/Bar.java',
      },
    }),
    makeFinding({
      patternId: 'DMI',
      type: 'DMI',
      rank: 14,
      category: 'PERFORMANCE',
      abbrev: 'DMI',
      message: 'DMI: Inefficient call in helper.Util',
      className: 'Helper',
      location: {
        sourceFile: 'Helper.java',
        realSourcePath: 'Helper.java',
      },
    }),
  ];

  it('extracts ordered severity options with counts', () => {
    const options = getFindingFilterOptions(findings, {}, 'severity');
    assert.deepStrictEqual(
      options.map((option) => ({ label: option.label, count: option.count })),
      [
        { label: 'Error', count: 2 },
        { label: 'Warning', count: 1 },
        { label: 'Info', count: 1 },
      ]
    );
  });

  it('extracts package and rule options from cached findings', () => {
    const packageOptions = getFindingFilterOptions(findings, {}, 'package');
    assert.deepStrictEqual(
      packageOptions.map((option) => option.label),
      ['<default package>', 'com.acme', 'com.other']
    );

    const ruleOptions = getFindingFilterOptions(findings, {}, 'rule');
    assert.deepStrictEqual(
      ruleOptions.map((option) => ({ value: option.value, label: option.label, count: option.count })),
      [
        { value: 'DMI', label: '[DMI] Inefficient call', count: 1 },
        { value: 'NP', label: '[NP] Null pointer', count: 2 },
        { value: 'UR', label: '[UR] Unread value', count: 1 },
      ]
    );
  });

  it('narrows available values using other active filters', () => {
    const options = getFindingFilterOptions(findings, { severity: 'Error' }, 'package');
    assert.deepStrictEqual(
      options.map((option) => option.label),
      ['com.acme', 'com.other']
    );
  });

  it('applies multiple filter kinds to the cached findings', () => {
    const filtered = applyFindingFilters(findings, {
      severity: 'Warning',
      package: 'com.acme',
      class: 'com.acme.Bar',
      rule: 'UR',
      path: 'com/acme/Bar.java',
      category: 'CORRECTNESS',
    });

    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].className, 'com.acme.Bar');
  });

  it('supports partial case-insensitive matching for text filters', () => {
    const filtered = applyFindingFilters(findings, {
      severity: 'warn',
      category: 'correct',
      package: 'ACME',
      class: 'bar',
      path: 'bar.java',
      rule: 'unread',
    });

    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].className, 'com.acme.Bar');
  });

  it('normalizes severity aliases and path separators in query values', () => {
    const filtered = applyFindingFilters(findings, {
      severity: 'medium',
      path: 'com\\acme\\Bar.java',
    });

    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].className, 'com.acme.Bar');
  });

  it('parses combined key:value queries and preserves quoted values', () => {
    const parsed = parseFindingFilterQuery(
      'severity:high category:CORRECTNESS path:"/workspace/My Project/com/acme/Bar.java" rule:UR'
    );

    assert.deepStrictEqual(parsed, {
      severity: 'Error',
      category: 'CORRECTNESS',
      path: '/workspace/My Project/com/acme/Bar.java',
      rule: 'UR',
    });
  });

  it('formats active filters back into an input-box query string', () => {
    const query = formatFindingFilterQuery({
      severity: 'Error',
      path: '/workspace/My Project/com/acme/Foo.java',
      rule: 'NP',
    });

    assert.strictEqual(
      query,
      'severity:Error path:"/workspace/My Project/com/acme/Foo.java" rule:NP'
    );
  });

  it('reports invalid query syntax for unsupported keys', () => {
    assert.strictEqual(
      validateFindingFilterQuery('owner:me'),
      'Unsupported filter key "owner". Supported keys: severity, category, package, class, path, rule.'
    );
  });

  it('describes the active filters in the zero-result empty state', () => {
    const emptyState = createFilteredEmptyState(findings, {
      severity: 'Error',
      rule: 'NP',
    });

    assert.strictEqual(emptyState.label, 'No cached findings match the current filters.');
    assert.strictEqual(emptyState.description, 'Severity: Error • Rule: [NP] Null pointer');
  });
});
