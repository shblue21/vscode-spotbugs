import * as assert from 'assert';
import type { AnalysisPlan, PlannedAnalysisUnit } from '../model/analysisPlan';
import { installVscodeMock } from './helpers/mockVscode';

describe('analysis plan execution', () => {
  it('keeps a failure, prefers cancellation, and reports a missing outcome', () => {
    const vscode = installVscodeMock();
    const { summarizeResourceResults } =
      require('../services/analysisService') as typeof import('../services/analysisService');
    const uri = vscode.Uri.file('/workspace/A.java') as any;
    const planResult = {
      results: [],
      context: { resolutionIssues: [] },
      cancelled: false,
      outcomes: [
        {
          selectionIndex: 0,
          outcome: {
            findings: [],
            failure: {
              kind: 'target' as const,
              level: 'error' as const,
              code: 'BROKEN',
              message: 'Failed',
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

  it('executes every unit, including multiple units for one selection, and retains planning failures', async () => {
    const vscode = installVscodeMock();
    const service =
      require('../services/analysisService') as typeof import('../services/analysisService');
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
    const calls: unknown[][] = [];
    vscode.commands.executeCommand = async (...args: unknown[]) => {
      calls.push(args);
      return JSON.stringify({ results: [], errors: [] });
    };

    const result = await service.executeAnalysisPlan(plan);
    assert.deepStrictEqual(
      calls.map(([command, operation, target, payload]) => [
        command,
        operation,
        target,
        JSON.parse(payload as string).inputs,
      ]),
      ['/out/main/A.class', '/out/test/A.class'].map((target) => [
        'java.execute.workspaceCommand',
        'java.spotbugs.analyzeSources',
        target,
        [{ kind: 'source', path: target }],
      ]),
    );
    assert.strictEqual(result.results.length, 3);
    assert.ok(result.results.slice(0, 2).every((project) => !project.error));
    assert.strictEqual(result.results[2].errorCode, 'NO_CLASS_TARGETS');
  });
});
