/* eslint-disable @typescript-eslint/naming-convention */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

function clearModule(moduleId: string): void {
  delete require.cache[require.resolve(moduleId)];
}

function loadService() {
  const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
  const service = require('../workspace/classpathService') as typeof import('../workspace/classpathService');
  return { gateway, service };
}

describe('Java classpath contract', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
    clearModule('../workspace/classpathService');
    clearModule('../workspace/classpathCommandRunner');
    clearModule('../lsp/javaLsGateway');
    clearModule('../core/logger');
  });

  it('uses the exact cancellable workspace-command arguments', async () => {
    const calls: unknown[][] = [];
    const token = { isCancellationRequested: false } as any;
    resetVscodeMock({
      commands: {
        executeCommand: async (...args: unknown[]) => {
          calls.push(args);
          return undefined;
        },
        getCommands: async () => [],
      },
    });
    const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');

    await gateway.requestJavaClasspaths('file:///workspace/project', 'test', token);
    await gateway.requestJavaProjectSettings(
      'file:///workspace/project',
      ['source', 'output'],
      token
    );
    await gateway.requestJavaIsTestFile('file:///workspace/Test.java', token);
    await gateway.requestAllJavaProjects(token);

    assert.deepStrictEqual(calls, [
      [
        'java.execute.workspaceCommand',
        'java.project.getClasspaths',
        'file:///workspace/project',
        '{"scope":"test"}',
        token,
      ],
      [
        'java.execute.workspaceCommand',
        'java.project.getSettings',
        'file:///workspace/project',
        ['source', 'output'],
        token,
      ],
      [
        'java.execute.workspaceCommand',
        'java.project.isTestFile',
        'file:///workspace/Test.java',
        token,
      ],
      ['java.execute.workspaceCommand', 'java.project.getAll', token],
    ]);
  });

  it('maps source-specific outputs and keeps classpath/modulepath aux-only', async () => {
    const { gateway, service } = loadService();
    const scopes: string[] = [];
    gateway.requestJavaIsTestFile = async (uri) => uri.includes('/integration/');
    gateway.requestJavaClasspaths = async (_uri, scope) => {
      scopes.push(scope);
      return {
        projectRoot: 'file:///workspace/project',
        classpaths: ['/deps/classes', '/shared'],
        modulepaths: ['/modules/classes', '/shared'],
      };
    };
    const settings = {
      'org.eclipse.jdt.ls.core.sourcePaths': [
        '/workspace/project/src/main/java',
        '/workspace/project/src/integration/java',
      ],
      'org.eclipse.jdt.ls.core.outputPath': '/workspace/project/target/classes',
      'org.eclipse.jdt.ls.core.classpathEntries': [
        {
          kind: 1,
          path: '/workspace/project/src/main/java',
          output: null,
          attributes: {},
        },
        {
          kind: 1,
          path: '/workspace/project/src/integration/java',
          output: '/workspace/project/target/integration-classes',
          attributes: { gradle_scope: 'integrationTest' },
        },
      ],
    };
    gateway.requestJavaProjectSettings = async (uri) =>
      uri.endsWith('.class')
        ? {
            'org.eclipse.jdt.ls.core.sourcePaths': ['/wrong/source'],
            'org.eclipse.jdt.ls.core.outputPath': '/wrong/output',
            'org.eclipse.jdt.ls.core.classpathEntries': [],
          }
        : settings;

    const main = await service.getClasspathsOutcome(
      'file:///workspace/project/src/main/java/demo/Main.java'
    );
    const test = await service.getClasspathsOutcome('file:///workspace/project', {
      expectedProjectRoot: 'file:///workspace/project',
      analysisResource: 'file:///workspace/project/src/integration/java',
    });
    const classFile = await service.getClasspathsOutcome(
      'file:///workspace/project/target/classes/demo/Main.class'
    );

    assert.strictEqual(main.status, 'resolved');
    assert.strictEqual(test.status, 'resolved');
    assert.strictEqual(classFile.status, 'resolved');
    if (
      main.status === 'resolved' &&
      test.status === 'resolved' &&
      classFile.status === 'resolved'
    ) {
      assert.deepStrictEqual(main.classpath.runtimeClasspaths, [
        '/deps/classes',
        '/shared',
        '/modules/classes',
      ]);
      assert.deepStrictEqual(main.classpath.targetResolutionRoots, [
        '/workspace/project/target/classes',
      ]);
      assert.deepStrictEqual(test.classpath.targetResolutionRoots, [
        '/workspace/project/target/integration-classes',
      ]);
      assert.deepStrictEqual(test.classpath.sourcepaths, [
        '/workspace/project/src/integration/java',
      ]);
      assert.deepStrictEqual(classFile.classpath.sourceOutputs, {
        '/workspace/project/src/main/java': '/workspace/project/target/classes',
      });
    }
    assert.deepStrictEqual(scopes, ['runtime', 'test', 'runtime']);
  });

  it('changes only output mappings for sources selected from captured JDT settings', async () => {
    const { gateway, service } = loadService();
    // Captured from JDT LS 1.61.0 on 2026-09-13; project prefix normalized only.
    const settings = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../../src/test/fixtures/jdt-project-settings.json'), 'utf8',
    ));
    gateway.requestJavaProjectSettings = async () => settings;
    gateway.requestJavaIsTestFile = async (uri) => uri.includes('/src/test/');
    gateway.requestJavaClasspaths = async () => ({
      projectRoot: 'file:///workspace/project', classpaths: ['/deps/library.jar'], modulepaths: [],
    });
    for (const [source, output] of [
      ['src/main/java', 'custom/main'],
      ['src/main/java/nested', 'custom/nested'],
      ['src/test/java', 'custom/test'],
      ['generated/java', 'custom/generated'],
    ]) {
      const result = await service.getClasspathsOutcome(`file:///workspace/project/${source}/demo/A.java`);
      assert.strictEqual(result.status, 'resolved');
      if (result.status !== 'resolved') throw new Error('Expected resolved metadata');
      assert.deepStrictEqual(result.classpath.sourcepaths, [`/workspace/project/${source}`]);
      assert.deepStrictEqual(result.classpath.sourceOutputs, {
        [`/workspace/project/${source}`]: `/workspace/project/${output}`,
      });
      assert.deepStrictEqual(result.classpath.targetResolutionRoots, [`/workspace/project/${output}`]);
      assert.deepStrictEqual(result.classpath.runtimeClasspaths, ['/deps/library.jar']);
    }
  });

  it('preserves existing source selection even when JDT test attributes disagree with path conventions', async () => {
    const { gateway, service } = loadService();
    gateway.requestJavaProjectSettings = async () => ({
      'org.eclipse.jdt.ls.core.outputPath': '/workspace/project/bin',
      'org.eclipse.jdt.ls.core.sourcePaths': ['/workspace/project/src/test/java', '/workspace/project/custom-source'],
      'org.eclipse.jdt.ls.core.classpathEntries': [
        { kind: 3, path: '/workspace/project/src/test/java', output: '/workspace/project/test-out', attributes: {} },
        { kind: 3, path: '/workspace/project/custom-source', output: '/workspace/project/custom-out', attributes: { test: 'true' } },
      ],
    });
    gateway.requestJavaClasspaths = async () => ({
      projectRoot: 'file:///workspace/project', classpaths: [], modulepaths: [],
    });
    const result = await service.getClasspathsOutcome('file:///workspace/project', { scope: 'runtime' });
    assert.strictEqual(result.status, 'resolved');
    if (result.status !== 'resolved') throw new Error('Expected resolved metadata');
    // Keep the pre-change selection policy; correcting that policy is a separate change.
    assert.deepStrictEqual(result.classpath.sourcepaths, ['/workspace/project/custom-source']);
    assert.deepStrictEqual(result.classpath.sourceOutputs, { '/workspace/project/custom-source': '/workspace/project/custom-out' });
  });

  it('retains the existing Gradle project selection while preserving declared outputs', async () => {
    const { gateway, service } = loadService();
    gateway.requestJavaProjectSettings = async () => JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../../src/test/fixtures/jdt-gradle-project-settings.json'), 'utf8',
    ));
    gateway.requestJavaClasspaths = async () => ({
      projectRoot: 'file:///workspace/project', classpaths: [], modulepaths: [],
    });
    const result = await service.getClasspathsOutcome('file:///workspace/project', { scope: 'runtime' });
    assert.strictEqual(result.status, 'resolved');
    if (result.status !== 'resolved') throw new Error('Expected resolved metadata');
    assert.deepStrictEqual(result.classpath.sourcepaths, [
      '/workspace/project/libs/compile-only.jar',
      '/workspace/project/src/main/java',
      '/workspace/project/generated/java',
      '/workspace/project/src/integrationTest/java',
    ]);
    assert.strictEqual(result.classpath.sourceOutputs?.['/workspace/project/src/main/java'], '/workspace/project/bin/main');
    assert.strictEqual(result.classpath.sourceOutputs?.['/workspace/project/generated/java'], '/workspace/project/bin/main');
    assert.strictEqual(result.classpath.sourceOutputs?.['/workspace/project/src/integrationTest/java'], '/workspace/project/bin/integrationTest');
  });

  it('rejects mismatched provenance and preserves aux when settings degrade', async () => {
    const { gateway, service } = loadService();
    gateway.requestJavaClasspaths = async (uri) => ({
      projectRoot: uri.includes('wrong')
        ? 'file:///workspace/project-a'
        : 'file:///workspace/project-b/',
      classpaths: ['/deps/classes'],
      modulepaths: ['/modules/classes'],
    });
    gateway.requestJavaProjectSettings = async () => undefined;

    const mismatch = await service.getClasspathsOutcome(
      'file:///workspace/wrong',
      {
        scope: 'runtime',
        expectedProjectRoot: 'file:///workspace/project-b',
      }
    );
    const degraded = await service.getClasspathsOutcome(
      'file:///workspace/project-b',
      { scope: 'runtime' }
    );

    assert.strictEqual(mismatch.status, 'unavailable');
    assert.ok(!('classpath' in mismatch));
    assert.deepStrictEqual(mismatch.issues.map((issue) => issue.code), [
      'JAVA_PROJECT_METADATA_MISMATCH',
    ]);
    assert.strictEqual(degraded.status, 'resolved');
    if (degraded.status === 'resolved') {
      assert.deepStrictEqual(degraded.classpath.runtimeClasspaths, [
        '/deps/classes',
        '/modules/classes',
      ]);
      assert.deepStrictEqual(degraded.classpath.targetResolutionRoots, []);
      assert.deepStrictEqual(degraded.issues.map((issue) => issue.code), [
        'JAVA_LS_PROJECT_SETTINGS_FAILED',
      ]);
    }

    gateway.requestJavaProjectSettings = async () => ({
      'org.eclipse.jdt.ls.core.outputPath': '/workspace/project-b/test-output',
      'org.eclipse.jdt.ls.core.classpathEntries': [
        {
          kind: 1,
          path: '/workspace/project-b/test-source',
          output: '/workspace/project-b/test-output',
          attributes: { test: 'true' },
        },
      ],
    });
    const runtimeOnly = await service.getClasspathsOutcome(
      'file:///workspace/project-b',
      {
        scope: 'runtime',
        expectedProjectRoot: 'file:///workspace/project-b',
      }
    );
    assert.deepStrictEqual(
      runtimeOnly.status === 'resolved'
        ? runtimeOnly.classpath.targetResolutionRoots
        : undefined,
      []
    );

    gateway.requestJavaClasspaths = async () => ({
      projectRoot: 'c:\\work\\project\\',
      classpaths: [],
      modulepaths: [],
    });
    const windows = await service.getClasspathsOutcome('C:\\Work\\Project', {
      scope: 'runtime',
      expectedProjectRoot: 'C:\\Work\\Project',
    });
    assert.strictEqual(windows.status, 'resolved');
  });

});
