import * as assert from 'assert';
import { NO_CLASS_TARGETS_CODE } from '../workspace/analysisTargetCodes';
import type { ProjectResult } from '../services/projectResult';
import { installVscodeMock } from './helpers/mockVscode';

installVscodeMock();
const { buildWorkspaceCompletionNotices } =
  require('../orchestration/workspaceSummary') as typeof import('../orchestration/workspaceSummary');

function makeProjectResult(overrides: Partial<ProjectResult> = {}): ProjectResult {
  return {
    projectUri: 'file:///workspace/project',
    findings: [],
    ...overrides,
  };
}

describe('workspaceSummary', () => {
  it('reports missing compiled classes when all projects are skipped', () => {
    const notices = buildWorkspaceCompletionNotices(
      [
        makeProjectResult({ error: 'no compiled classes', errorCode: NO_CLASS_TARGETS_CODE }),
        makeProjectResult({ error: 'no compiled classes', errorCode: NO_CLASS_TARGETS_CODE }),
      ],
      0,
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        message:
          'SpotBugs could not find compiled classes to analyze. Run a manual build, then try again.',
      },
    ]);
  });

  it('keeps skip warnings plus success summary when only skipped and successful projects exist', () => {
    const notices = buildWorkspaceCompletionNotices(
      [
        makeProjectResult({ findings: [{ patternId: 'X', location: {} }] }),
        makeProjectResult({ error: 'no compiled classes', errorCode: NO_CLASS_TARGETS_CODE }),
      ],
      1,
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        message:
          'Skipped 1 of 2 projects because no compiled classes were found. Run a manual build, then try again.',
      },
      {
        level: 'info',
        message: 'SpotBugs: Workspace analysis completed. Findings: 1.',
      },
    ]);
  });

  it('limits the zero-finding summary to analyzed projects when another project was skipped', () => {
    const projects = [
      makeProjectResult(),
      makeProjectResult({ error: 'no compiled classes', errorCode: NO_CLASS_TARGETS_CODE }),
    ];

    assert.deepStrictEqual(buildWorkspaceCompletionNotices(projects, 0), [
      {
        level: 'warn',
        message:
          'Skipped 1 of 2 projects because no compiled classes were found. Run a manual build, then try again.',
      },
      {
        level: 'info',
        message: 'SpotBugs: Workspace analysis completed - No issues found in analyzed projects.',
      },
    ]);
  });

  it('keeps partial-success summaries with and without Java LS notices', () => {
    const makeProjects = () => [
      makeProjectResult({ findings: [{ patternId: 'X', location: {} }] }),
      makeProjectResult({ error: 'bad aux classpath', errorCode: 'CFG_AUX_CLASSPATH_NOT_FOUND' }),
    ];
    const expectedSummary = [
      {
        level: 'warn',
        message:
          'SpotBugs: Analysis completed. Failed projects: 1. Findings in successful projects: 1.',
      },
    ];
    assert.deepStrictEqual(buildWorkspaceCompletionNotices(makeProjects(), 1), expectedSummary);
    assert.deepStrictEqual(
      buildWorkspaceCompletionNotices(makeProjects(), 1, [
        {
          code: 'JAVA_LS_REQUEST_FAILED',
          level: 'warn',
          source: 'java-ls',
          phase: 'get-classpaths',
          message: 'Java LS classpath lookup failed.',
        },
      ]),
      [
        ...expectedSummary,
        {
          level: 'warn',
          code: 'JAVA_LS_REQUEST_FAILED',
          message:
            'SpotBugs: Java project metadata lookup failed; analysis continued with fallback behavior.',
        },
      ],
    );
  });

  it('counts successful projects in the total when failures and skips occur together', () => {
    const projects = [
      makeProjectResult(),
      makeProjectResult({ error: 'analysis failed' }),
      makeProjectResult({ error: 'another analysis failed' }),
      makeProjectResult({ errorCode: NO_CLASS_TARGETS_CODE }),
      makeProjectResult({ errorCode: NO_CLASS_TARGETS_CODE }),
    ];

    assert.deepStrictEqual(buildWorkspaceCompletionNotices(projects, 0), [
      {
        level: 'warn',
        message:
          'SpotBugs: Analysis completed. Failed projects: 2. Skipped 2 of 5 projects because no compiled classes were found. Successful projects produced no findings.',
      },
    ]);
  });

  it('keeps terminal failure summaries and suppresses Java LS notices', () => {
    const makeProjects = () => [
      makeProjectResult({ error: 'bad aux classpath', errorCode: 'CFG_AUX_CLASSPATH_NOT_FOUND' }),
      makeProjectResult({ error: 'no compiled classes', errorCode: NO_CLASS_TARGETS_CODE }),
    ];
    const expectedSummary = [
      {
        level: 'error',
        message:
          'SpotBugs: Workspace analysis failed. Failed projects: 1. Skipped 1 of 2 projects because no compiled classes were found. See the SpotBugs view for project errors.',
      },
    ];
    assert.deepStrictEqual(buildWorkspaceCompletionNotices(makeProjects(), 0), expectedSummary);
    assert.deepStrictEqual(
      buildWorkspaceCompletionNotices(makeProjects(), 0, [
        {
          code: 'JAVA_LS_REQUEST_FAILED',
          level: 'warn',
          source: 'java-ls',
          phase: 'get-classpaths',
          message: 'Java LS classpath lookup failed.',
        },
        {
          code: 'JAVA_LS_NO_RESULT',
          level: 'warn',
          source: 'java-ls',
          phase: 'get-classpaths',
          message: 'Java LS classpath lookup returned no usable result.',
        },
      ]),
      expectedSummary,
    );
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

  it('does not report a clean workspace when analysis is incomplete', () => {
    const notices = buildWorkspaceCompletionNotices(
      [makeProjectResult()],
      0,
      [],
      [
        {
          projectUri: 'file:///workspace/project-a',
          warning: {
            code: 'ANALYSIS_INCOMPLETE',
            message: 'Some checks may have been skipped.',
          },
        },
      ],
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        message:
          'SpotBugs: Workspace analysis completed - No findings reported. Projects with warnings: 1. See the SpotBugs output for details.',
      },
    ]);
  });

  it('appends translated resolution notices while suppressing generic workspace fallback notices', () => {
    const notices = buildWorkspaceCompletionNotices([makeProjectResult()], 0, [
      {
        code: 'JAVA_LS_EMPTY_PROJECT_LIST',
        level: 'info',
        source: 'project-discovery',
        phase: 'get-all-projects',
        message: 'Java LS reported no Java projects.',
      },
      {
        code: 'WORKSPACE_FALLBACK_USED',
        level: 'info',
        source: 'project-discovery',
        phase: 'workspace-fallback',
        message: 'Workspace-folder fallback was used for project discovery.',
      },
    ]);

    assert.deepStrictEqual(notices, [
      {
        level: 'info',
        message: 'SpotBugs: Workspace analysis completed - No issues found.',
      },
      {
        level: 'info',
        code: 'JAVA_LS_EMPTY_PROJECT_LIST',
        message:
          'SpotBugs: No Java projects were reported by the Java Language Server; workspace-folder analysis was used.',
      },
    ]);
  });

  it('dedupes repeated translated resolution notices in the final workspace summary', () => {
    const notices = buildWorkspaceCompletionNotices([makeProjectResult()], 0, [
      {
        code: 'OUTPUT_FALLBACK_USED',
        level: 'info',
        source: 'target-resolution',
        phase: 'output-fallback',
        message:
          'Output folder fallback was used because Java build output metadata was unavailable or unusable for the selected target.',
      },
      {
        code: 'OUTPUT_FALLBACK_USED',
        level: 'info',
        source: 'target-resolution',
        phase: 'output-fallback',
        message:
          'Output folder fallback was used because Java build output metadata was unavailable or unusable for the selected target.',
      },
    ]);

    assert.deepStrictEqual(notices, [
      {
        level: 'info',
        message: 'SpotBugs: Workspace analysis completed - No issues found.',
      },
      {
        level: 'info',
        code: 'OUTPUT_FALLBACK_USED',
        message:
          'SpotBugs: Java build output metadata was unavailable or unusable for the selected target; output folder fallback was used.',
      },
    ]);
  });
});
