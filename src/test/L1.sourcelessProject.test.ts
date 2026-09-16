/* eslint-disable @typescript-eslint/naming-convention */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

describe('source-less project target selection', () => {
  beforeEach(() => {
    installVscodeMock();
    resetVscodeMock();
    for (const module of ['../lsp/javaLsGateway', '../workspace/classpathCommandRunner',
      '../workspace/classpathService', '../workspace/analysisTargetResolver']) {
      delete require.cache[require.resolve(module)];
    }
  });

  for (const rootOutput of [false, true]) {
    it(`routes confirmed source-less output to artifacts${rootOutput ? ' even at the project root' : ''}`, async () => {
      const vscode = installVscodeMock();
      const project = fs.mkdtempSync(path.join(os.tmpdir(), 'spotbugs-source-less-'));
      const output = rootOutput ? project : path.join(project, 'bin');
      fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(path.join(output, 'A.class'), 'target inventory fixture');
      const library = path.join(project, 'helper.jar');
      fs.writeFileSync(library, 'library fixture');
      const uri = vscode.Uri.file(project) as any;
      const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
      gateway.requestJavaClasspaths = async () => ({ projectRoot: uri.toString(), classpaths: [library], modulepaths: [] });
      let settings: Record<string, unknown> | undefined = {
        'org.eclipse.jdt.ls.core.sourcePaths': [],
        'org.eclipse.jdt.ls.core.outputPath': output,
        'org.eclipse.jdt.ls.core.classpathEntries': [{ kind: 1, path: library, attributes: {} }],
      };
      gateway.requestJavaProjectSettings = async () => settings ? { settings, declaredSourceOutputs: {} } : undefined;
      const runner = require('../workspace/classpathCommandRunner') as typeof import('../workspace/classpathCommandRunner');
      const resolver = require('../workspace/analysisTargetResolver') as typeof import('../workspace/analysisTargetResolver');
      try {
        const metadata = await runner.lookupJavaProjectClasspath(uri, { scope: 'runtime' });
        assert.strictEqual(metadata.status, 'resolved');
        if (metadata.status !== 'resolved') throw new Error('Expected resolved');
        assert.strictEqual(metadata.classpath.sourceRootsAbsent, true);
        // Do not rewrite the existing candidate list or runtime policy in this fix.
        assert.deepStrictEqual(metadata.classpath.sourcepaths, [library]);
        assert.deepStrictEqual(metadata.classpath.runtimeClasspaths, [library]);
        const target = await resolver.resolveProjectAnalysisTargetDetailed(uri, uri);
        assert.strictEqual(target.resolution.status, 'ok');
        if (target.resolution.status !== 'ok') throw new Error('Expected target');
        assert.strictEqual(target.resolution.target.unit.inputs[0].kind, 'artifact');
        assert.strictEqual(target.resolution.target.unit.inputs[0].path, output);
        const previousSettings = settings;
        const emptySource = path.join(project, 'empty-source');
        fs.mkdirSync(emptySource);
        settings = { ...settings, 'org.eclipse.jdt.ls.core.sourcePaths': [emptySource] };
        const withSource = await resolver.resolveProjectAnalysisTargetDetailed(uri, uri);
        assert.strictEqual(withSource.resolution.status, 'ok');
        if (withSource.resolution.status === 'ok') {
          assert.strictEqual(withSource.resolution.target.unit.inputs[0].kind, 'source');
          assert.strictEqual(withSource.resolution.target.unit.inputs[0].path, project);
        }
        settings = previousSettings;
        if (!rootOutput) {
          fs.unlinkSync(path.join(output, 'A.class'));
          assert.notStrictEqual((await resolver.resolveProjectAnalysisTargetDetailed(uri, uri)).resolution.status, 'ok');
        }
        settings = undefined;
        const failed = await runner.lookupJavaProjectClasspath(uri, { scope: 'runtime' });
        assert.strictEqual(failed.status, 'resolved');
        if (failed.status === 'resolved') assert.strictEqual(failed.classpath.sourceRootsAbsent, undefined);
      } finally {
        fs.rmSync(project, { recursive: true, force: true });
      }
    });
  }

  it('does not infer no sources from incomplete, contradictory, or nonempty settings', async () => {
    const gateway = require('../lsp/javaLsGateway') as typeof import('../lsp/javaLsGateway');
    gateway.requestJavaClasspaths = async () => ({ projectRoot: 'file:///p', classpaths: [], modulepaths: [] });
    const { lookupJavaProjectClasspath } = require('../workspace/classpathCommandRunner') as typeof import('../workspace/classpathCommandRunner');
    for (const settings of [
      {},
      { 'org.eclipse.jdt.ls.core.sourcePaths': [] },
      { 'org.eclipse.jdt.ls.core.sourcePaths': null, 'org.eclipse.jdt.ls.core.classpathEntries': [] },
      { 'org.eclipse.jdt.ls.core.sourcePaths': [''], 'org.eclipse.jdt.ls.core.classpathEntries': [] },
      { 'org.eclipse.jdt.ls.core.sourcePaths': [], 'org.eclipse.jdt.ls.core.classpathEntries': [{ kind: 3, path: '/p/src' }] },
      { 'org.eclipse.jdt.ls.core.sourcePaths': ['/p/empty-src'], 'org.eclipse.jdt.ls.core.classpathEntries': [] },
    ]) {
      gateway.requestJavaProjectSettings = async () => ({ settings, declaredSourceOutputs: {} });
      const result = await lookupJavaProjectClasspath('file:///p', { scope: 'runtime' });
      assert.strictEqual(result.status, 'resolved');
      if (result.status === 'resolved') assert.strictEqual(result.classpath.sourceRootsAbsent, undefined);
    }
  });
});
