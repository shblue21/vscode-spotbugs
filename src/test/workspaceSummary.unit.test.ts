import * as assert from 'assert';
import { buildWorkspaceCompletionNotices } from '../orchestration/workspaceSummary';
import { NO_CLASS_TARGETS_CODE } from '../workspace/analysisTargetCodes';
import type { ProjectResult } from '../services/projectResult';

function makeProjectResult(overrides: Partial<ProjectResult> = {}): ProjectResult {
  return {
    projectUri: 'file:///workspace/project',
    findings: [],
    ...overrides,
  };
}

describe('workspaceSummary', () => {
  it('returns the existing build warning when all projects are skipped', () => {
    const notices = buildWorkspaceCompletionNotices(
      [
        makeProjectResult({ error: 'build failed', errorCode: NO_CLASS_TARGETS_CODE }),
        makeProjectResult({ error: 'build failed', errorCode: NO_CLASS_TARGETS_CODE }),
      ],
      0
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        message: 'SpotBugs could not build the project. Run a manual build, then try again.',
      },
    ]);
  });

  it('keeps skip warnings plus success summary when only skipped and successful projects exist', () => {
    const notices = buildWorkspaceCompletionNotices(
      [
        makeProjectResult({ findings: [{ patternId: 'X', location: {} }] }),
        makeProjectResult({ error: 'build failed', errorCode: NO_CLASS_TARGETS_CODE }),
      ],
      1
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        message: 'SpotBugs skipped 1 project because the build failed. Run a manual build, then try again.',
      },
      {
        level: 'info',
        message: 'SpotBugs: Workspace analysis completed - 1 issue found.',
      },
    ]);
  });

  it('returns a warning summary when some projects fail but successful ones still produce results', () => {
    const notices = buildWorkspaceCompletionNotices(
      [
        makeProjectResult({ findings: [{ patternId: 'X', location: {} }] }),
        makeProjectResult({ error: 'bad aux classpath', errorCode: 'CFG_AUX_CLASSPATH_NOT_FOUND' }),
      ],
      1
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        message:
          'SpotBugs: Workspace analysis completed with failures - 1 project failed. 1 issue found in successful projects.',
      },
    ]);
  });

  it('returns an error summary when no projects succeed and at least one project fails', () => {
    const notices = buildWorkspaceCompletionNotices(
      [
        makeProjectResult({ error: 'bad aux classpath', errorCode: 'CFG_AUX_CLASSPATH_NOT_FOUND' }),
        makeProjectResult({ error: 'build failed', errorCode: NO_CLASS_TARGETS_CODE }),
      ],
      0
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message:
          'SpotBugs: Workspace analysis failed - 1 project failed. 1 project skipped because the build failed. See the SpotBugs view for project errors.',
      },
    ]);
  });

  it('returns the clean success summary when nothing failed and no findings were produced', () => {
    const notices = buildWorkspaceCompletionNotices([makeProjectResult()], 0);

    assert.deepStrictEqual(notices, [
      {
        level: 'info',
        message: 'SpotBugs: Workspace analysis completed - No issues found.',
      },
    ]);
  });
});
