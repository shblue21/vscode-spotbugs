import * as assert from 'assert';
import type { AnalysisReportRun } from '../model/analysisReport';
import type { Finding } from '../model/finding';
import { buildNativeSarifLog } from '../services/nativeSarifExporter';

function finding(type: string): Finding {
  return { patternId: type, type, location: {} };
}

function nativeSarif(ruleIds: string[]): string {
  return JSON.stringify({
    version: '2.1.0',
    $schema: 'https://example.test/sarif-schema.json',
    runs: [
      {
        tool: { driver: { name: 'SpotBugs', rules: ruleIds.map((id) => ({ id })) } },
        invocations: [{ executionSuccessful: true }],
        results: ruleIds.map((ruleId, ruleIndex) => ({ ruleId, ruleIndex })),
        taxonomies: [{ name: 'CWE' }],
      },
    ],
  });
}

describe('buildNativeSarifLog', () => {
  it('filters only native results while preserving native run metadata', () => {
    const first = finding('NP_NULL');
    const second = finding('UR_UNINIT_READ');
    const log = buildNativeSarifLog(
      [
        {
          projectUri: 'file:///workspace/a',
          findings: [first, second],
          nativeSarif: nativeSarif([first.type!, second.type!]),
        },
      ],
      [second]
    );

    assert.deepStrictEqual(log.runs[0].results, [
      { ruleId: 'UR_UNINIT_READ', ruleIndex: 1 },
    ]);
    assert.deepStrictEqual(
      (log.runs[0].tool as any).driver.rules,
      [{ id: 'NP_NULL' }, { id: 'UR_UNINIT_READ' }]
    );
    assert.deepStrictEqual(log.runs[0].invocations, [
      { executionSuccessful: true },
    ]);
    assert.deepStrictEqual(log.runs[0].taxonomies, [{ name: 'CWE' }]);
  });

  it('combines successful workspace runs and retains an originally empty run', () => {
    const selected = finding('NP_NULL');
    const runs: AnalysisReportRun[] = [
      {
        projectUri: 'file:///workspace/a',
        findings: [selected],
        nativeSarif: nativeSarif([selected.type!]),
      },
      {
        projectUri: 'file:///workspace/b',
        findings: [],
        nativeSarif: nativeSarif([]),
      },
      {
        projectUri: 'file:///workspace/c',
        findings: [],
        analysisStatus: 'failed',
      },
    ];

    const log = buildNativeSarifLog(runs, [selected], true);

    assert.strictEqual(log.runs.length, 2);
    assert.deepStrictEqual(log.runs.map((run) => run.results.length), [1, 0]);
  });

  it('rejects missing, malformed, or misaligned native reports', () => {
    const selected = finding('NP_NULL');
    const cases: AnalysisReportRun[][] = [
      [{ projectUri: 'file:///workspace', findings: [selected] }],
      [
        {
          projectUri: 'file:///workspace',
          findings: [selected],
          nativeSarif: '{',
        },
      ],
      [
        {
          projectUri: 'file:///workspace',
          findings: [selected],
          nativeSarif: nativeSarif([]),
        },
      ],
      [
        {
          projectUri: 'file:///workspace',
          findings: [selected],
          nativeSarif: nativeSarif(['OTHER_RULE']),
        },
      ],
    ];

    for (const reportRuns of cases) {
      assert.throws(() => buildNativeSarifLog(reportRuns, [selected]));
    }
    assert.throws(() =>
      buildNativeSarifLog(
        [
          {
            projectUri: 'file:///workspace',
            findings: [selected],
            nativeSarif: nativeSarif([selected.type!]),
          },
        ],
        [finding('NP_NULL')]
      )
    );
  });
});
