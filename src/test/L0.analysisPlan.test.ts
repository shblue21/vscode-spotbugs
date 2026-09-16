import * as assert from 'assert';
import type { AnalysisPlan, PlannedAnalysisUnit } from '../model/analysisPlan';
import { installVscodeMock } from './helpers/mockVscode';

describe('analysis plan execution', () => {
  it('preserves every native run and nonterminal errors in a resource result', () => {
    const vscode = installVscodeMock();
    const { summarizeResourceResults } =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const uri = vscode.Uri.file('/workspace/A.java') as any;
    const first = { id: 'first' } as any;
    const second = { id: 'second' } as any;
    const result = summarizeResourceResults(uri, {
      results: [],
      context: { resolutionIssues: [] },
      cancelled: false,
      outcomes: [
        {
          selectionIndex: 0,
          outcome: {
            findings: [first],
            nativeSarif: 'first-report',
            errors: [{ message: 'Recoverable' }],
          },
        },
        { selectionIndex: 0, outcome: { findings: [second], nativeSarif: 'second-report' } },
      ],
    });
    assert.deepStrictEqual(result.outcome.findings, [first, second]);
    assert.strictEqual(result.outcome.failure, undefined);
    assert.deepStrictEqual(result.outcome.errors, [{ message: 'Recoverable' }]);
    assert.deepStrictEqual(
      result.reportRuns?.map((run) => run.nativeSarif),
      ['first-report', 'second-report'],
    );
    assert.deepStrictEqual(
      result.reportRuns?.map((run) => run.findings),
      [[first], [second]],
    );
  });

  it('does not hide a later failure or cancellation behind a first success', () => {
    const vscode = installVscodeMock();
    const { summarizeResourceResults } =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const uri = vscode.Uri.file('/workspace/A.java') as any;
    const planResult = {
      results: [],
      context: { resolutionIssues: [] },
      cancelled: false,
      outcomes: [
        { selectionIndex: 0, outcome: { findings: [] } },
        {
          selectionIndex: 0,
          outcome: {
            findings: [],
            failure: {
              kind: 'target' as const,
              level: 'error' as const,
              code: 'BROKEN',
              message: 'Second failed',
            },
          },
        },
      ],
    };
    assert.strictEqual(summarizeResourceResults(uri, planResult).outcome.failure?.code, 'BROKEN');
    assert.strictEqual(
      summarizeResourceResults(uri, { ...planResult, cancelled: true }).outcome.failure?.code,
      'ANALYSIS_CANCELLED',
    );
    assert.strictEqual(
      summarizeResourceResults(uri, { ...planResult, outcomes: [] }).outcome.failure?.code,
      'no-class-targets',
    );
  });

  it('does not silently replace diagnostics using incompatible unit scopes', () => {
    const vscode = installVscodeMock();
    const { summarizeResourceResults } =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const uri = vscode.Uri.file('/workspace/A.java') as any;
    const result = summarizeResourceResults(uri, {
      results: [],
      context: { resolutionIssues: [] },
      outcomes: ['/workspace/A.java', '/workspace/B.java'].map((file) => ({
        selectionIndex: 0,
        outcome: { findings: [] },
        diagnosticScope: { kind: 'file', uri: vscode.Uri.file(file) } as any,
      })),
    });
    assert.strictEqual(result.outcome.failure?.code, 'ANALYSIS_SCOPE_MISMATCH');
  });

  it('executes every unit, including multiple units for one selection, and retains planning failures', async () => {
    const vscode = installVscodeMock();
    const service =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const execution =
      require('../services/analysisExecution') as typeof import('../services/analysisExecution');
    const original = execution.runAnalysisTarget;
    const resource = vscode.Uri.file('/workspace/A.java') as any;
    const other = vscode.Uri.file('/workspace/B.java') as any;
    const unit = (path: string): PlannedAnalysisUnit => ({
      selectionIndex: 0,
      resource,
      settings: { effort: 'default' },
      inputs: [{ kind: 'source', path }],
      environment: {},
      sourceLookup: {},
    });
    const plan: AnalysisPlan = {
      selections: [
        { kind: 'source', resource },
        { kind: 'source', resource: other },
      ],
      units: [unit('/out/main/A.class'), unit('/out/test/A.class')],
      problems: [
        {
          selectionIndex: 1,
          resource: other,
          outcome: {
            findings: [],
            failure: {
              kind: 'target',
              level: 'warn',
              code: 'NO_CLASS_TARGETS',
              message: 'No classes',
            },
          },
        },
      ],
      resolutionIssues: [],
      cancelled: false,
    };
    const calls: string[] = [];
    execution.runAnalysisTarget = async (_config, item) => {
      calls.push(item.inputs[0].path);
      return { findings: [] };
    };
    try {
      const result = await service.executeAnalysisPlan(plan);
      assert.deepStrictEqual(calls, ['/out/main/A.class', '/out/test/A.class']);
      assert.strictEqual(result.results.length, 3);
      assert.strictEqual(result.results[2].errorCode, 'NO_CLASS_TARGETS');
    } finally {
      execution.runAnalysisTarget = original;
    }
  });
});
