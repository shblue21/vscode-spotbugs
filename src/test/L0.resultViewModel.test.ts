import * as assert from 'assert';
import {
  buildResultView,
  type FindingResultGroup,
  type FindingResultNode,
  matchesFindingSearch,
  sortFindings,
} from '../ui/resultViewModel';
import { Finding } from '../model/finding';

describe('resultViewModel', () => {
  it('matches search across rule, text, class, path, category, and CWE values', () => {
    const finding = makeFinding({
      patternId: 'SQL_INJECTION',
      type: 'SQL_INJECTION',
      abbrev: 'SQL',
      category: 'SECURITY',
      cweId: 89,
      rank: 6,
      priority: '2',
      className: 'com.acme.UserService',
      message: 'SQL: Risk in UserService',
      shortDescription: 'Tainted input reaches SQL',
      longDescription: 'Parameterized query should be used for this sink',
      location: {
        fullPath: '/workspace/src/UserService.java',
        realSourcePath: 'com/acme/UserService.java',
        sourceFile: 'UserService.java',
        startLine: 7,
      },
    });

    assert.strictEqual(matchesFindingSearch(finding, 'sql_'), true);
    assert.strictEqual(matchesFindingSearch(finding, 'security'), true);
    assert.strictEqual(matchesFindingSearch(finding, 'userservice'), true);
    assert.strictEqual(matchesFindingSearch(finding, 'com.acme'), true);
    assert.strictEqual(
      matchesFindingSearch(finding, '/workspace/src/userservice.java'),
      true
    );
    assert.strictEqual(
      matchesFindingSearch(finding, 'com/acme/userservice.java'),
      true
    );
    assert.strictEqual(matchesFindingSearch(finding, 'UserService.java'), true);
    assert.strictEqual(matchesFindingSearch(finding, 'CWE-89'), true);
    assert.strictEqual(matchesFindingSearch(finding, '89'), true);
    assert.strictEqual(matchesFindingSearch(finding, 'tainted input'), true);
    assert.strictEqual(matchesFindingSearch(finding, 'parameterized query'), true);
    assert.strictEqual(matchesFindingSearch(finding, 'medium'), true);
    assert.strictEqual(matchesFindingSearch(finding, '2'), true);
    assert.strictEqual(matchesFindingSearch(finding, '6'), true);
    assert.strictEqual(matchesFindingSearch(finding, 'missing-value'), false);

    const missingRule = makeFinding({
      patternId: undefined,
      type: undefined,
      abbrev: undefined,
    });
    assert.strictEqual(matchesFindingSearch(missingRule, 'unknown rule'), true);
  });

  it('sorts by severity rank, path line, and rule', () => {
    const first = makeFinding({
      patternId: 'B_RULE',
      type: 'B_RULE',
      rank: 10,
      location: { fullPath: '/b.java', startLine: 3 },
    });
    const second = makeFinding({
      patternId: 'A_RULE',
      type: 'A_RULE',
      rank: 2,
      location: { fullPath: '/z.java', startLine: 1 },
    });
    const third = makeFinding({
      patternId: 'C_RULE',
      type: 'C_RULE',
      rank: 2,
      location: { fullPath: '/a.java', startLine: 8 },
    });
    const knownLine = makeFinding({
      patternId: 'D_RULE',
      type: 'D_RULE',
      rank: 1,
      location: { fullPath: '/a.java', startLine: 2 },
    });
    const unknownLine = makeFinding({
      patternId: 'E_RULE',
      type: 'E_RULE',
      rank: 1,
      location: { fullPath: '/a.java', startLine: 0 },
    });
    const validLowRank = makeFinding({
      patternId: 'VALID_LOW',
      type: 'VALID_LOW',
      rank: 20,
      location: { fullPath: '/z.java', startLine: 1 },
    });
    const invalidZeroRank = makeFinding({
      patternId: 'INVALID_ZERO',
      type: 'INVALID_ZERO',
      rank: 0,
      location: { fullPath: '/a.java', startLine: 1 },
    });

    assert.deepStrictEqual(sortFindings([first, second, third], 'severityRank'), [
      third,
      second,
      first,
    ]);
    assert.deepStrictEqual(sortFindings([first, second, third], 'pathLine'), [
      third,
      first,
      second,
    ]);
    assert.deepStrictEqual(sortFindings([first, second, third], 'rule'), [
      second,
      first,
      third,
    ]);
    assert.deepStrictEqual(sortFindings([unknownLine, knownLine], 'pathLine'), [
      knownLine,
      unknownLine,
    ]);
    assert.deepStrictEqual(
      sortFindings([invalidZeroRank, validLowRank], 'severityRank'),
      [validLowRank, invalidZeroRank]
    );
  });

  it('applies documented sort tie-breakers and unknown placement', () => {
    const sameRankLaterPath = makeFinding({
      patternId: 'B_RULE',
      type: 'B_RULE',
      rank: 2,
      location: { fullPath: '/b.java', startLine: 1 },
    });
    const sameRankEarlierPath = makeFinding({
      patternId: 'A_RULE',
      type: 'A_RULE',
      rank: 2,
      location: { fullPath: '/a.java', startLine: 2 },
    });
    const samePathLaterLine = makeFinding({
      patternId: 'LINE_B',
      type: 'LINE_B',
      rank: 5,
      location: { fullPath: '/same.java', startLine: 20 },
    });
    const samePathEarlierLine = makeFinding({
      patternId: 'LINE_A',
      type: 'LINE_A',
      rank: 10,
      location: { fullPath: '/same.java', startLine: 3 },
    });
    const unknownPath = makeFinding({
      patternId: 'UNKNOWN_PATH',
      type: 'UNKNOWN_PATH',
      rank: 1,
      location: {},
    });
    const sameRuleLowerRank = makeFinding({
      patternId: 'SAME_RULE',
      type: 'SAME_RULE',
      rank: 10,
      location: { fullPath: '/a.java', startLine: 5 },
    });
    const sameRuleHigherRank = makeFinding({
      patternId: 'SAME_RULE',
      type: 'SAME_RULE',
      rank: 1,
      location: { fullPath: '/z.java', startLine: 1 },
    });

    assert.deepStrictEqual(
      sortFindings([sameRankLaterPath, sameRankEarlierPath], 'severityRank'),
      [sameRankEarlierPath, sameRankLaterPath]
    );
    assert.deepStrictEqual(
      sortFindings([samePathLaterLine, samePathEarlierLine], 'pathLine'),
      [samePathEarlierLine, samePathLaterLine]
    );
    assert.deepStrictEqual(
      sortFindings([unknownPath, samePathEarlierLine], 'pathLine'),
      [samePathEarlierLine, unknownPath]
    );
    assert.deepStrictEqual(
      sortFindings([sameRuleLowerRank, sameRuleHigherRank], 'rule'),
      [sameRuleHigherRank, sameRuleLowerRank]
    );
  });

  it('builds default category rule groups and generic package, class, and path groups', () => {
    const npFinding = makeFinding({
      patternId: 'NP',
      type: 'NP_NULL_ON_SOME_PATH',
      abbrev: 'NP',
      category: 'CORRECTNESS',
      className: 'com.acme.Foo',
    });
    const sqlFinding = makeFinding({
      patternId: 'SQL',
      type: 'SQL_INJECTION',
      abbrev: 'SQL',
      category: 'SECURITY',
      className: 'com.acme.Bar',
    });
    const findings = [npFinding, sqlFinding];

    const categoryView = buildResultView(findings, {
      searchQuery: '',
      groupBy: 'category',
      sortBy: 'severityRank',
    });
    assert.strictEqual(categoryView.visibleFindings.length, 2);
    assert.strictEqual(categoryView.nodes.length, 2);
    const categoryGroup = categoryView.nodes[0];
    assertResultGroup(categoryGroup);
    assert.strictEqual(categoryGroup.groupKind, 'category');
    assert.strictEqual(categoryGroup.key, 'CORRECTNESS');
    assert.deepStrictEqual(categoryGroup.findings, [npFinding]);
    const ruleGroup = categoryGroup.children[0];
    assertResultGroup(ruleGroup);
    assert.strictEqual(ruleGroup.groupKind, 'rule');
    assert.strictEqual(ruleGroup.key, 'NP_NULL_ON_SOME_PATH');
    assert.strictEqual(ruleGroup.total, 1);
    assert.deepStrictEqual(ruleGroup.findings, [npFinding]);
    assertFindingLeaf(ruleGroup.children[0]);
    assert.strictEqual(ruleGroup.children[0].finding, npFinding);

    const packageView = buildResultView(findings, {
      searchQuery: '',
      groupBy: 'package',
      sortBy: 'rule',
    });
    assert.strictEqual(packageView.nodes.length, 1);
    const packageGroup = packageView.nodes[0];
    assertResultGroup(packageGroup);
    assert.strictEqual(packageGroup.groupKind, 'package');
    assert.strictEqual(packageGroup.key, 'com.acme');
    assert.deepStrictEqual(packageGroup.findings, [npFinding, sqlFinding]);
    assert.strictEqual(packageGroup.children.length, 2);
    assertFindingLeaf(packageGroup.children[0]);
    assert.strictEqual(packageGroup.children[0].finding, npFinding);
    assertFindingLeaf(packageGroup.children[1]);
    assert.strictEqual(packageGroup.children[1].finding, sqlFinding);

    const classView = buildResultView(findings, {
      searchQuery: '',
      groupBy: 'class',
      sortBy: 'rule',
    });
    assert.strictEqual(classView.nodes.length, 2);
    const classGroup = classView.nodes[0];
    assertResultGroup(classGroup);
    assert.strictEqual(classGroup.groupKind, 'class');
    assert.strictEqual(classGroup.key, 'com.acme.Bar');
    assert.strictEqual(classGroup.total, 1);
    assert.deepStrictEqual(classGroup.findings, [sqlFinding]);

    const pathView = buildResultView(findings, {
      searchQuery: '',
      groupBy: 'path',
      sortBy: 'rule',
    });
    assert.strictEqual(pathView.nodes.length, 1);
    const pathGroup = pathView.nodes[0];
    assertResultGroup(pathGroup);
    assert.strictEqual(pathGroup.groupKind, 'path');
    assert.strictEqual(pathGroup.key, '/workspace/Example.java');
    assert.strictEqual(pathGroup.label, '/workspace/Example.java');
    assert.strictEqual(pathGroup.total, 2);
    assert.deepStrictEqual(pathGroup.findings, [npFinding, sqlFinding]);
  });

  it('orders priority groups as High, Medium, Low, then Unknown priority', () => {
    const findings = [
      makeFinding({ patternId: 'UNKNOWN_RULE', priority: undefined, rank: undefined }),
      makeFinding({ patternId: 'LOW_RULE', priority: undefined, rank: 12 }),
      makeFinding({ patternId: 'MEDIUM_RULE', priority: 'M', rank: 6 }),
      makeFinding({ patternId: 'HIGH_RULE_ONE', priority: 'H', rank: 2 }),
      makeFinding({ patternId: 'HIGH_RULE_TWO', priority: undefined, rank: 4 }),
    ];

    const view = buildResultView(findings, {
      searchQuery: '',
      groupBy: 'priority',
      sortBy: 'severityRank',
    });
    const groups = view.nodes.map((node: FindingResultNode) => {
      assertResultGroup(node);
      return { key: node.key, label: node.label, total: node.total };
    });

    assert.deepStrictEqual(groups, [
      { key: 'high', label: 'High', total: 2 },
      { key: 'medium', label: 'Medium', total: 1 },
      { key: 'low', label: 'Low', total: 1 },
      { key: '__missing_priority__', label: 'Unknown priority', total: 1 },
    ]);
  });

  it('uses unknown groups for missing concrete values and filters by search before grouping', () => {
    const lowMatch = makeFinding({
      patternId: 'LOW_MATCH',
      type: 'LOW_MATCH',
      rank: 12,
      className: undefined,
      location: {},
    });
    const hidden = makeFinding({
      patternId: 'HIDDEN',
      type: 'HIDDEN',
      rank: 1,
      className: 'com.hidden.Foo',
      location: { fullPath: '/hidden/Foo.java', startLine: 1 },
    });
    const highMatch = makeFinding({
      patternId: 'HIGH_MATCH',
      type: 'HIGH_MATCH',
      rank: 2,
      className: undefined,
      location: {},
    });
    const visible = buildResultView([lowMatch, hidden, highMatch], {
      searchQuery: 'unknown source',
      groupBy: 'path',
      sortBy: 'severityRank',
    });

    assert.deepStrictEqual(visible.visibleFindings, [highMatch, lowMatch]);
    const pathGroup = visible.nodes[0];
    assertResultGroup(pathGroup);
    assert.strictEqual(pathGroup.key, '__missing_path__');
    assert.strictEqual(pathGroup.label, 'Unknown source');
    assert.strictEqual(pathGroup.total, 2);
    assert.deepStrictEqual(pathGroup.findings, [highMatch, lowMatch]);
    assert.strictEqual(pathGroup.children.length, 2);
    assertFindingLeaf(pathGroup.children[0]);
    assert.strictEqual(pathGroup.children[0].finding, highMatch);
    assertFindingLeaf(pathGroup.children[1]);
    assert.strictEqual(pathGroup.children[1].finding, lowMatch);

    const priorityView = buildResultView(
      [makeFinding({ priority: undefined, rank: undefined })],
      {
        searchQuery: '',
        groupBy: 'priority',
        sortBy: 'severityRank',
      }
    );
    const priorityGroup = priorityView.nodes[0];
    assertResultGroup(priorityGroup);
    assert.strictEqual(priorityGroup.key, '__missing_priority__');
    assert.strictEqual(priorityGroup.label, 'Unknown priority');
  });

  it('keeps rule group labels stable while sorting findings inside the group', () => {
    const first = makeFinding({
      patternId: 'SAME_RULE',
      type: 'SAME_RULE',
      abbrev: 'SR',
      rank: 10,
      message: 'SR: Later detail',
      location: { fullPath: '/b.java', startLine: 20 },
    });
    const second = makeFinding({
      patternId: 'SAME_RULE',
      type: 'SAME_RULE',
      abbrev: 'SR',
      rank: 1,
      message: 'SR: Earlier detail',
      location: { fullPath: '/a.java', startLine: 1 },
    });

    const severityView = buildResultView([first, second], {
      searchQuery: '',
      groupBy: 'rule',
      sortBy: 'severityRank',
    });
    const pathView = buildResultView([first, second], {
      searchQuery: '',
      groupBy: 'rule',
      sortBy: 'pathLine',
    });

    const severityGroup = severityView.nodes[0];
    const pathGroup = pathView.nodes[0];
    assertResultGroup(severityGroup);
    assertResultGroup(pathGroup);
    assert.strictEqual(severityGroup.key, 'SAME_RULE');
    assert.strictEqual(pathGroup.label, severityGroup.label);
    assert.deepStrictEqual(severityGroup.findings, [second, first]);
  });

  it('orders rule groups by canonical full rule key before display label', () => {
    const laterKey = makeFinding({
      patternId: 'SQL',
      type: 'ZZZ_SQL_RULE',
      abbrev: 'SQL',
      message: 'SQL: Label sorts before type',
    });
    const earlierKey = makeFinding({
      patternId: 'SQL',
      type: 'AAA_SQL_RULE',
      abbrev: 'SQL',
      message: 'SQL: Label sorts after type',
    });

    const view = buildResultView([laterKey, earlierKey], {
      searchQuery: '',
      groupBy: 'rule',
      sortBy: 'severityRank',
    });

    const firstGroup = view.nodes[0];
    const secondGroup = view.nodes[1];
    assertResultGroup(firstGroup);
    assertResultGroup(secondGroup);
    assert.strictEqual(firstGroup.key, 'AAA_SQL_RULE');
    assert.strictEqual(secondGroup.key, 'ZZZ_SQL_RULE');
  });

  it('keeps stable order for values that differ only by case', () => {
    const lower = makeFinding({
      patternId: 'same_rule',
      type: 'same_rule',
      location: { fullPath: '/same/Example.java', startLine: 1 },
    });
    const upper = makeFinding({
      patternId: 'SAME_RULE',
      type: 'SAME_RULE',
      location: { fullPath: '/same/Example.java', startLine: 1 },
    });

    assert.deepStrictEqual(sortFindings([lower, upper], 'rule'), [lower, upper]);
    assert.deepStrictEqual(sortFindings([upper, lower], 'rule'), [upper, lower]);
  });

  it('keeps case-only group order stable across sort modes', () => {
    const lower = makeFinding({
      patternId: 'ZZZ_RULE',
      type: 'ZZZ_RULE',
      rank: 20,
      className: 'com.acme.Lower',
      location: { fullPath: '/z.java', startLine: 5 },
    });
    const upper = makeFinding({
      patternId: 'AAA_RULE',
      type: 'AAA_RULE',
      rank: 1,
      className: 'Com.Acme.Upper',
      location: { fullPath: '/a.java', startLine: 1 },
    });

    for (const sortBy of ['severityRank', 'pathLine', 'rule'] as const) {
      const view = buildResultView([lower, upper], {
        searchQuery: '',
        groupBy: 'package',
        sortBy,
      });
      const labels = view.nodes.map((node: FindingResultNode) => {
        assertResultGroup(node);
        return node.label;
      });

      assert.deepStrictEqual(labels, ['com.acme', 'Com.Acme']);
    }
  });

  it('keeps case-only rule group order stable even when labels differ', () => {
    const lower = makeFinding({
      patternId: 'same_rule',
      type: 'same_rule',
      abbrev: 'ZZ',
      rank: 20,
      message: 'ZZ: Later label',
      location: { fullPath: '/z.java', startLine: 5 },
    });
    const upper = makeFinding({
      patternId: 'SAME_RULE',
      type: 'SAME_RULE',
      abbrev: 'AA',
      rank: 1,
      message: 'AA: Earlier label',
      location: { fullPath: '/a.java', startLine: 1 },
    });

    const view = buildResultView([lower, upper], {
      searchQuery: '',
      groupBy: 'rule',
      sortBy: 'severityRank',
    });
    const keys = view.nodes.map((node: FindingResultNode) => {
      assertResultGroup(node);
      return node.key;
    });

    assert.deepStrictEqual(keys, ['same_rule', 'SAME_RULE']);
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
    message: 'NP: Null pointer',
    className: 'com.acme.Example',
    location: {
      fullPath: '/workspace/Example.java',
      startLine: 1,
    },
    ...overrides,
  };
}

function assertResultGroup(node: FindingResultNode): asserts node is FindingResultGroup {
  assert.strictEqual(node.type, 'group');
}

function assertFindingLeaf(
  node: FindingResultNode
): asserts node is Exclude<FindingResultNode, FindingResultGroup> {
  assert.strictEqual(node.type, 'finding');
}
