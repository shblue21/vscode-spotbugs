import * as assert from 'assert';
import {
  buildAnalysisNotices,
  buildResolutionIssueNotices,
} from '../orchestration/analysisNotices';

describe('analysisNotices', () => {
  it('maps JAVA_LS_EMPTY_RUNTIME_CLASSPATH to a warning notice', () => {
    const notices = buildResolutionIssueNotices([
      {
        code: 'JAVA_LS_EMPTY_RUNTIME_CLASSPATH',
        level: 'warn',
        source: 'java-ls',
        phase: 'get-classpaths',
        message: 'Java LS classpath lookup returned no runtime classpath entries.',
      },
    ]);

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        code: 'JAVA_LS_EMPTY_RUNTIME_CLASSPATH',
        message:
          'SpotBugs: Java runtime classpath information is unavailable; results may be incomplete.',
      },
    ]);
  });

  it('suppresses WORKSPACE_FALLBACK_USED when a more specific workspace-discovery cause exists', () => {
    const notices = buildResolutionIssueNotices([
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
        code: 'JAVA_LS_EMPTY_PROJECT_LIST',
        message:
          'SpotBugs: No Java projects were reported by the Java Language Server; workspace-folder analysis was used.',
      },
    ]);
  });

  it('dedupes JAVA_LS_REQUEST_FAILED and JAVA_LS_NO_RESULT into one semantic warning notice', () => {
    const notices = buildResolutionIssueNotices([
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
      {
        code: 'OUTPUT_FALLBACK_USED',
        level: 'info',
        source: 'target-resolution',
        phase: 'output-fallback',
        message: 'Output folder fallback was used because Java build output metadata was unavailable.',
      },
    ]);

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        code: 'JAVA_LS_REQUEST_FAILED',
        message:
          'SpotBugs: Java project metadata lookup failed; analysis continued with fallback behavior.',
      },
      {
        level: 'info',
        code: 'OUTPUT_FALLBACK_USED',
        message:
          'SpotBugs: Java build output metadata was unavailable; output folder fallback was used.',
      },
    ]);
  });

  it('appends translated resolution notices to successful analysis outcomes', () => {
    const notices = buildAnalysisNotices(
      {
        findings: [],
        targetPath: '/workspace/src/main/java/Foo.java',
      },
      {
        resolutionIssues: [
          {
            code: 'OUTPUT_FALLBACK_USED',
            level: 'info',
            source: 'target-resolution',
            phase: 'output-fallback',
            message: 'Output folder fallback was used because Java build output metadata was unavailable.',
          },
        ],
      }
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'info',
        code: 'OUTPUT_FALLBACK_USED',
        message:
          'SpotBugs: Java build output metadata was unavailable; output folder fallback was used.',
      },
    ]);
  });

  it('keeps resolution notices on failure outcomes instead of returning early', () => {
    const notices = buildAnalysisNotices(
      {
        findings: [],
        targetPath: '/workspace/src/main/java/Foo.java',
        failure: {
          kind: 'target',
          level: 'warn',
          code: 'NO_CLASS_TARGETS',
          message: 'No compiled classes found.',
        },
      },
      {
        resolutionIssues: [
          {
            code: 'OUTPUT_FALLBACK_USED',
            level: 'info',
            source: 'target-resolution',
            phase: 'output-fallback',
            message:
              'Output folder fallback was used because Java build output metadata was unavailable.',
          },
        ],
      }
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        code: 'NO_CLASS_TARGETS',
        message: 'No compiled classes found.',
      },
      {
        level: 'info',
        code: 'OUTPUT_FALLBACK_USED',
        message:
          'SpotBugs: Java build output metadata was unavailable; output folder fallback was used.',
      },
    ]);
  });

  it('keeps only one terminal notice for failure + errors + no findings while preserving resolution notices', () => {
    const notices = buildAnalysisNotices(
      {
        findings: [],
        targetPath: '/workspace/src/main/java/Foo.java',
        failure: {
          kind: 'analysis-error',
          level: 'error',
          code: 'CFG_AUX_CLASSPATH_NOT_FOUND',
          message:
            'SpotBugs analysis failed: [CFG_AUX_CLASSPATH_NOT_FOUND] aux classpath is invalid',
        },
        errors: [
          {
            message: 'aux classpath is invalid',
            code: 'CFG_AUX_CLASSPATH_NOT_FOUND',
          },
        ],
      },
      {
        includeHints: true,
        resolutionIssues: [
          {
            code: 'JAVA_LS_REQUEST_FAILED',
            level: 'warn',
            source: 'java-ls',
            phase: 'get-classpaths',
            message: 'Java LS classpath lookup failed.',
          },
        ],
      }
    );

    const terminalNotices = notices.filter(
      (notice) => notice.message === 'SpotBugs analysis failed: [CFG_AUX_CLASSPATH_NOT_FOUND] aux classpath is invalid'
    );

    assert.strictEqual(terminalNotices.length, 1);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        code: 'CFG_AUX_CLASSPATH_NOT_FOUND',
        message:
          'SpotBugs analysis failed: [CFG_AUX_CLASSPATH_NOT_FOUND] aux classpath is invalid',
      },
    ]);
    assert.ok(
      notices.every(
        (notice) =>
          notice.message !==
          'SpotBugs: Java project metadata lookup failed; analysis continued with fallback behavior.'
      )
    );
    assert.ok(
      notices.every(
        (notice) =>
          notice.message !==
          'SpotBugs: No compiled classes found (target-resolution roots unavailable). Make sure the target is inside a Java project and build the workspace.'
      )
    );
  });

  it('keeps resolution notices on fatal error outcomes with no findings', () => {
    const notices = buildAnalysisNotices(
      {
        findings: [],
        errors: [
          {
            message: 'aux classpath is invalid',
            code: 'CFG_AUX_CLASSPATH_NOT_FOUND',
          },
        ],
      },
      {
        resolutionIssues: [
          {
            code: 'JAVA_LS_REQUEST_FAILED',
            level: 'warn',
            source: 'java-ls',
            phase: 'get-classpaths',
            message: 'Java LS classpath lookup failed.',
          },
        ],
      }
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: 'SpotBugs analysis failed: [CFG_AUX_CLASSPATH_NOT_FOUND] aux classpath is invalid',
      },
    ]);
  });

  it('suppresses JAVA_LS_REQUEST_FAILED on terminal target failures', () => {
    const notices = buildAnalysisNotices(
      {
        findings: [],
        failure: {
          kind: 'target',
          level: 'warn',
          code: 'NO_CLASS_TARGETS',
          message: 'No compiled classes found.',
        },
      },
      {
        resolutionIssues: [
          {
            code: 'JAVA_LS_REQUEST_FAILED',
            level: 'warn',
            source: 'java-ls',
            phase: 'get-classpaths',
            message: 'Java LS classpath lookup failed.',
          },
        ],
      }
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        code: 'NO_CLASS_TARGETS',
        message: 'No compiled classes found.',
      },
    ]);
    assert.ok(
      notices.every(
        (notice) =>
          notice.message !==
          'SpotBugs: Java project metadata lookup failed; analysis continued with fallback behavior.'
      )
    );
  });

  it('keeps a fatal error notice for errors-only outcomes with no findings', () => {
    const notices = buildAnalysisNotices({
      findings: [],
      errors: [
        {
          message: 'aux classpath is invalid',
          code: 'CFG_AUX_CLASSPATH_NOT_FOUND',
        },
      ],
    });

    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: 'SpotBugs analysis failed: [CFG_AUX_CLASSPATH_NOT_FOUND] aux classpath is invalid',
      },
    ]);
  });

  it('still surfaces JAVA_LS_REQUEST_FAILED on non-terminal analysis outcomes', () => {
    const notices = buildAnalysisNotices(
      {
        findings: [{ patternId: 'X', location: {} } as any],
        errors: [
          {
            message: 'minor warning',
            code: 'ANALYSIS_WARNING',
          },
        ],
      },
      {
        resolutionIssues: [
          {
            code: 'JAVA_LS_REQUEST_FAILED',
            level: 'warn',
            source: 'java-ls',
            phase: 'get-classpaths',
            message: 'Java LS classpath lookup failed.',
          },
        ],
      }
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        message: 'SpotBugs analysis completed with warnings: [ANALYSIS_WARNING] minor warning',
      },
      {
        level: 'warn',
        code: 'JAVA_LS_REQUEST_FAILED',
        message:
          'SpotBugs: Java project metadata lookup failed; analysis continued with fallback behavior.',
      },
    ]);
  });

  it('suppresses JAVA_LS_NO_RESULT on terminal outcomes', () => {
    const notices = buildAnalysisNotices(
      {
        findings: [],
        failure: {
          kind: 'target',
          level: 'warn',
          code: 'NO_CLASS_TARGETS',
          message: 'No compiled classes found.',
        },
      },
      {
        resolutionIssues: [
          {
            code: 'JAVA_LS_NO_RESULT',
            level: 'warn',
            source: 'java-ls',
            phase: 'get-classpaths',
            message: 'Java LS classpath lookup returned no usable result.',
          },
          {
            code: 'OUTPUT_FALLBACK_USED',
            level: 'info',
            source: 'target-resolution',
            phase: 'output-fallback',
            message:
              'Output folder fallback was used because Java build output metadata was unavailable.',
          },
        ],
      }
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        code: 'NO_CLASS_TARGETS',
        message: 'No compiled classes found.',
      },
      {
        level: 'info',
        code: 'OUTPUT_FALLBACK_USED',
        message:
          'SpotBugs: Java build output metadata was unavailable; output folder fallback was used.',
      },
    ]);
    assert.ok(
      notices.every(
        (notice) =>
          notice.message !==
          'SpotBugs: Java project metadata lookup failed; analysis continued with fallback behavior.'
      )
    );
  });

  it('still surfaces JAVA_LS_NO_RESULT on non-terminal analysis outcomes when behavior changed', () => {
    const notices = buildAnalysisNotices(
      {
        findings: [],
        targetPath: '/workspace/src/main/java/Foo.java',
      },
      {
        resolutionIssues: [
          {
            code: 'JAVA_LS_NO_RESULT',
            level: 'warn',
            source: 'java-ls',
            phase: 'get-classpaths',
            message: 'Java LS classpath lookup returned no usable result.',
          },
          {
            code: 'OUTPUT_FALLBACK_USED',
            level: 'info',
            source: 'target-resolution',
            phase: 'output-fallback',
            message:
              'Output folder fallback was used because Java build output metadata was unavailable.',
          },
        ],
      }
    );

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        code: 'JAVA_LS_NO_RESULT',
        message:
          'SpotBugs: Java project metadata lookup failed; analysis continued with fallback behavior.',
      },
      {
        level: 'info',
        code: 'OUTPUT_FALLBACK_USED',
        message:
          'SpotBugs: Java build output metadata was unavailable; output folder fallback was used.',
      },
    ]);
  });

  it('keeps a single failure notice for failure-only outcomes', () => {
    const notices = buildAnalysisNotices({
      findings: [],
      failure: {
        kind: 'target',
        level: 'warn',
        code: 'NO_CLASS_TARGETS',
        message: 'No compiled classes found.',
      },
    });

    assert.deepStrictEqual(notices, [
      {
        level: 'warn',
        code: 'NO_CLASS_TARGETS',
        message: 'No compiled classes found.',
      },
    ]);
  });
});
