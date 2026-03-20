import * as assert from 'assert';
import { projectResultFromOutcome } from '../services/projectResult';
import type { AnalysisOutcome } from '../model/analysisOutcome';

function makeOutcome(overrides: Partial<AnalysisOutcome> = {}): AnalysisOutcome {
  return {
    findings: [],
    ...overrides,
  };
}

describe('projectResult', () => {
  it('propagates failure state into the project result', () => {
    const result = projectResultFromOutcome(
      'file:///workspace/project',
      makeOutcome({
        failure: {
          kind: 'analysis-error',
          level: 'error',
          code: 'CFG_AUX_CLASSPATH_NOT_FOUND',
          message: 'SpotBugs analysis failed: extra aux classpath entry not found: /tmp/missing.jar',
        },
      })
    );

    assert.deepStrictEqual(result, {
      projectUri: 'file:///workspace/project',
      findings: [],
      error: 'SpotBugs analysis failed: extra aux classpath entry not found: /tmp/missing.jar',
      errorCode: 'CFG_AUX_CLASSPATH_NOT_FOUND',
    });
  });

  it('treats fatal error payloads without findings as project failures', () => {
    const result = projectResultFromOutcome(
      'file:///workspace/project',
      makeOutcome({
        errors: [
          {
            code: 'CFG_AUX_CLASSPATH_INVALID_ENTRY',
            message: 'extra aux classpath entry must be a directory or .jar/.zip file: /tmp/bad.txt',
          },
        ],
      })
    );

    assert.deepStrictEqual(result, {
      projectUri: 'file:///workspace/project',
      findings: [],
      error:
        'SpotBugs analysis failed: [CFG_AUX_CLASSPATH_INVALID_ENTRY] extra aux classpath entry must be a directory or .jar/.zip file: /tmp/bad.txt',
      errorCode: 'CFG_AUX_CLASSPATH_INVALID_ENTRY',
    });
  });

  it('keeps successful outcomes as done results', () => {
    const result = projectResultFromOutcome(
      'file:///workspace/project',
      makeOutcome({
        findings: [
          {
            patternId: 'NP_NULL_ON_SOME_PATH',
            message: 'possible null dereference',
            location: {},
          },
        ],
        errors: [
          {
            code: 'WARN_PARTIAL',
            message: 'partial results',
          },
        ],
      })
    );

    assert.deepStrictEqual(result, {
      projectUri: 'file:///workspace/project',
      findings: [
        {
          patternId: 'NP_NULL_ON_SOME_PATH',
          message: 'possible null dereference',
          location: {},
        },
      ],
    });
  });
});
