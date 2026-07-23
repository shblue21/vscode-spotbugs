import * as assert from 'assert';
import {
  groupKeyFor,
  MISSING_GROUP_KEYS,
  toFindingFacets,
} from '../ui/findingFacets';
import { Finding } from '../model/finding';
import { mapBugToFinding } from '../lsp/spotbugsMapper';

describe('findingFacets', () => {
  it('normalizes priority and keeps severity separate', () => {
    for (const { priority, rank, expected } of [
      { priority: 'H', rank: 9, expected: 'High' },
      { priority: '2', rank: 2, expected: 'Medium' },
      { priority: 'unknown', rank: 14, expected: 'Low' },
      { priority: undefined, rank: 0, expected: 'Unknown priority' },
      { priority: undefined, rank: 21, expected: 'Unknown priority' },
      { priority: undefined, rank: undefined, expected: 'Unknown priority' },
    ] as const) {
      assert.strictEqual(
        toFindingFacets(makeFinding({ priority, rank })).priorityLabel,
        expected,
        `priority=${priority}, rank=${rank}`
      );
    }
    assert.strictEqual(
      toFindingFacets(makeFinding({ priority: 'H', rank: 9 })).severityLabel,
      'Warning'
    );
  });

  it('extracts package, class, path, rule, filter values, and search values', () => {
    const facets = toFindingFacets(
      makeFinding({
        patternId: 'SQL_INJECTION',
        type: 'SQL_INJECTION',
        abbrev: 'SQL',
        category: 'SECURITY',
        cweId: 89,
        message: 'SQL: Risk in com.acme.UserService',
        className: 'com.acme.UserService',
        methodName: 'loadUser',
        fieldName: 'query',
        location: {
          fullPath: '/workspace/src/com/acme/UserService.java',
          realSourcePath: 'src/com/acme/UserService.java',
          sourceFile: 'UserService.java',
          startLine: 12,
        },
      })
    );

    assert.strictEqual(facets.categoryKey, 'SECURITY');
    assert.strictEqual(facets.categoryGroupKey, 'SECURITY');
    assert.strictEqual(facets.packageKey, 'com.acme');
    assert.strictEqual(facets.packageLabel, 'com.acme');
    assert.strictEqual(facets.classKey, 'com.acme.UserService');
    assert.strictEqual(facets.pathKey, '/workspace/src/com/acme/UserService.java');
    assert.strictEqual(facets.ruleKey, 'SQL_INJECTION');
    assert.strictEqual(facets.filterValues.package, 'com.acme');
    assert.strictEqual(facets.filterValues.class, 'com.acme.UserService');
    assert.strictEqual(
      facets.filterValues.path,
      '/workspace/src/com/acme/UserService.java'
    );
    assert.strictEqual(facets.filterValues.rule, 'SQL_INJECTION');
    assert.ok(facets.searchableValues.includes('CWE-89'));
    assert.ok(facets.searchableValues.includes('89'));
    assert.ok(facets.searchableValues.includes('loadUser'));
    assert.ok(facets.searchableValues.includes('query'));
  });

  it('uses required fallback keys and labels while preserving filter compatibility', () => {
    const facets = toFindingFacets(
      makeFinding({
        category: undefined,
        patternId: undefined,
        type: undefined,
        abbrev: undefined,
        className: undefined,
        location: {},
      })
    );

    assert.strictEqual(facets.categoryKey, 'Uncategorized');
    assert.strictEqual(facets.categoryGroupKey, MISSING_GROUP_KEYS.category);
    assert.strictEqual(facets.categoryLabel, 'Uncategorized');
    assert.strictEqual(facets.packageKey, undefined);
    assert.strictEqual(facets.packageLabel, 'Unknown package');
    assert.strictEqual(facets.classKey, undefined);
    assert.strictEqual(facets.classLabel, 'Unknown class');
    assert.strictEqual(facets.pathKey, undefined);
    assert.strictEqual(facets.pathLabel, 'Unknown source');
    assert.strictEqual(facets.ruleKey, 'Unknown rule');
    assert.strictEqual(facets.ruleLabel, 'Unknown rule');
    assert.strictEqual(facets.filterValues.category, 'Uncategorized');
    assert.strictEqual(facets.filterValues.package, undefined);
    assert.strictEqual(facets.filterValues.class, undefined);
    assert.strictEqual(facets.filterValues.path, undefined);
    assert.strictEqual(facets.filterValues.rule, undefined);
    assert.ok(facets.searchableValues.includes('Uncategorized'));
    assert.ok(facets.searchableValues.includes('Unknown rule'));
    assert.ok(!facets.searchableValues.includes(MISSING_GROUP_KEYS.category));
  });

  it('treats mapper-synthetic UNKNOWN pattern IDs as a missing rule', () => {
    const finding = mapBugToFinding({});
    const facets = toFindingFacets(finding);

    assert.strictEqual(finding.patternId, 'UNKNOWN');
    assert.strictEqual(facets.ruleKey, 'Unknown rule');
    assert.strictEqual(facets.ruleLabel, 'Unknown rule');
    assert.strictEqual(facets.filterValues.rule, undefined);
    assert.strictEqual(groupKeyFor('rule', facets), MISSING_GROUP_KEYS.rule);
    assert.ok(facets.searchableValues.includes('Unknown rule'));
    assert.ok(!facets.searchableValues.includes('UNKNOWN'));
  });

  it('extracts package and path fallbacks from realSourcePath', () => {
    const fromPath = toFindingFacets(
      makeFinding({
        className: undefined,
        location: {
          realSourcePath: 'com/acme/UserDao.java',
          sourceFile: 'UserDao.java',
          startLine: 1,
        },
      })
    );
    const defaultPackage = toFindingFacets(
      makeFinding({
        className: 'Main',
        location: {
          realSourcePath: 'Main.java',
          sourceFile: 'Main.java',
          startLine: 1,
        },
      })
    );

    assert.strictEqual(fromPath.packageKey, 'com.acme');
    assert.strictEqual(fromPath.packageLabel, 'com.acme');
    assert.strictEqual(fromPath.pathKey, 'com/acme/UserDao.java');
    assert.ok(fromPath.searchableValues.includes('com/acme/UserDao.java'));
    assert.strictEqual(defaultPackage.packageKey, '<default package>');
    assert.strictEqual(defaultPackage.packageLabel, '<default package>');
  });

  it('uses full SpotBugs type for rule identity while preserving patternId filters', () => {
    const facets = toFindingFacets(
      makeFinding({
        patternId: 'SQL',
        type: 'SQL_INJECTION',
        abbrev: 'SQL',
        message: 'SQL: Risk in query construction',
      })
    );

    assert.strictEqual(facets.ruleKey, 'SQL_INJECTION');
    assert.strictEqual(facets.filterValues.rule, 'SQL');
    assert.strictEqual(groupKeyFor('rule', facets), 'SQL_INJECTION');
    assert.ok(facets.searchableValues.includes('SQL_INJECTION'));
    assert.ok(facets.searchableValues.includes('SQL'));
  });

  it('returns stable group keys for concrete and missing values', () => {
    const concrete = toFindingFacets(makeFinding({ className: 'com.acme.Service' }));
    const missing = toFindingFacets(
      makeFinding({ className: undefined, location: {} })
    );
    const missingCategoryRule = toFindingFacets(
      makeFinding({
        category: undefined,
        patternId: undefined,
        type: undefined,
        abbrev: undefined,
      })
    );
    const missingPriority = toFindingFacets(
      makeFinding({ priority: undefined, rank: undefined })
    );

    assert.strictEqual(groupKeyFor('category', concrete), 'CORRECTNESS');
    assert.strictEqual(groupKeyFor('package', concrete), 'com.acme');
    assert.strictEqual(groupKeyFor('class', concrete), 'com.acme.Service');
    assert.strictEqual(groupKeyFor('rule', concrete), 'NP_ALWAYS_NULL');
    assert.strictEqual(
      groupKeyFor('category', missingCategoryRule),
      MISSING_GROUP_KEYS.category
    );
    assert.strictEqual(groupKeyFor('path', missing), MISSING_GROUP_KEYS.path);
    assert.strictEqual(groupKeyFor('package', missing), MISSING_GROUP_KEYS.package);
    assert.strictEqual(groupKeyFor('class', missing), MISSING_GROUP_KEYS.class);
    assert.strictEqual(
      groupKeyFor('rule', missingCategoryRule),
      MISSING_GROUP_KEYS.rule
    );
    assert.strictEqual(groupKeyFor('priority', concrete), 'medium');
    assert.strictEqual(
      groupKeyFor('priority', missingPriority),
      MISSING_GROUP_KEYS.priority
    );
  });
});

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    patternId: 'NP_ALWAYS_NULL',
    type: 'NP_ALWAYS_NULL',
    abbrev: 'NP',
    rank: 6,
    priority: 'M',
    category: 'CORRECTNESS',
    message: 'NP: Null pointer in com.acme.Example',
    className: 'com.acme.Example',
    location: {
      fullPath: '/workspace/src/com/acme/Example.java',
      realSourcePath: 'src/com/acme/Example.java',
      sourceFile: 'Example.java',
      startLine: 10,
    },
    ...overrides,
  };
}
