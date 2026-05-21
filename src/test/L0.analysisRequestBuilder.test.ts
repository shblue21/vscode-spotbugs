import * as assert from 'assert';
import { buildAnalysisRequestPayload } from '../lsp/analysisRequestBuilder';
import type { AnalysisRequest } from '../model/analysisProtocol';
import type { AnalysisSettings } from '../core/config';
import { readAnalysisProtocolFixtureJson } from './helpers/analysisProtocolFixtures';

function makeSettings(overrides: Partial<AnalysisSettings> = {}): AnalysisSettings {
  return {
    effort: 'default',
    ...overrides,
  };
}

describe('analysisRequestBuilder', () => {
  it('builds the shared run-analysis request payload fixture', () => {
    const fixture = readAnalysisProtocolFixtureJson<AnalysisRequest>(
      'run-analysis-request-full.json'
    );
    const includeFilterPaths = ['test-fixtures/analysis-protocol/include-filter.xml'];
    const excludeFilterPaths = ['test-fixtures/analysis-protocol/exclude-filter.xml'];
    const excludeBaselineBugsPaths = ['test-fixtures/analysis-protocol/baseline-bugs.xml'];
    const excludeFilterPath = 'test-fixtures/analysis-protocol/legacy-exclude-filter.xml';

    const payload = buildAnalysisRequestPayload(
      makeSettings({
        effort: 'max',
        extraAuxClasspaths: ['.'],
        includeFilterPaths,
        excludeFilterPaths,
        excludeBaselineBugsPaths,
        excludeFilterPath,
        plugins: ['/workspace/plugin-a.jar', '/workspace/plugin-b.jar'],
        priorityThreshold: 5,
      }),
      {
        targetResolutionRoots: ['/workspace/build/classes', '/workspace/build/generated'],
        runtimeClasspaths: ['/workspace/build/classes', '/workspace/lib/dependency.jar'],
        extraAuxClasspaths: ['.'],
        sourcepaths: ['/workspace/src/main/java', '/workspace/generated/sources'],
      }
    );

    assert.strictEqual(fixture.targetPath, '/workspace/build/classes');
    assert.deepStrictEqual(payload, fixture.payload);
  });

  it('includes include/exclude/excludeBaseline filter paths in payload', () => {
    const include = ['/tmp/spotbugs/include.xml'];
    const exclude = ['/tmp/spotbugs/exclude.xml'];
    const baseline = ['/tmp/spotbugs/baseline.xml'];
    const extraAux = ['/tmp/spotbugs/lib.jar'];
    const runtimeClasspaths = ['/workspace/build/classes', '/workspace/lib/dependency.jar'];
    const targetResolutionRoots = ['/workspace/build/classes'];

    const payload = buildAnalysisRequestPayload(
      makeSettings({
        extraAuxClasspaths: extraAux,
        includeFilterPaths: include,
        excludeFilterPaths: exclude,
        excludeBaselineBugsPaths: baseline,
      }),
      {
        targetResolutionRoots,
        runtimeClasspaths,
        extraAuxClasspaths: extraAux,
        sourcepaths: ['/workspace/src/main/java'],
      }
    );

    assert.deepStrictEqual(payload.targetResolutionRoots, targetResolutionRoots);
    assert.deepStrictEqual(payload.runtimeClasspaths, runtimeClasspaths);
    assert.deepStrictEqual(payload.extraAuxClasspaths, extraAux);
    assert.deepStrictEqual(payload.includeFilterPaths, include);
    assert.deepStrictEqual(payload.excludeFilterPaths, exclude);
    assert.deepStrictEqual(payload.excludeBaselineBugsPaths, baseline);
  });

  it('omits optional fields when arrays are empty', () => {
    const payload = buildAnalysisRequestPayload(
      makeSettings({
        extraAuxClasspaths: [],
        includeFilterPaths: [],
        excludeFilterPaths: [],
        excludeBaselineBugsPaths: [],
      }),
      {}
    );

    assert.strictEqual('targetResolutionRoots' in payload, true);
    assert.strictEqual(payload.targetResolutionRoots, null);
    assert.strictEqual('runtimeClasspaths' in payload, true);
    assert.strictEqual(payload.runtimeClasspaths, null);
    assert.strictEqual('extraAuxClasspaths' in payload, true);
    assert.strictEqual(payload.extraAuxClasspaths, null);
    assert.strictEqual('includeFilterPaths' in payload, false);
    assert.strictEqual('excludeFilterPaths' in payload, false);
    assert.strictEqual('excludeBaselineBugsPaths' in payload, false);
  });

  it('keeps legacy excludeFilterPath for backward compatibility', () => {
    const payload = buildAnalysisRequestPayload(
      makeSettings({
        excludeFilterPaths: ['/tmp/spotbugs/exclude.xml'],
        excludeFilterPath: '/tmp/spotbugs/exclude.xml',
      }),
      {}
    );

    assert.deepStrictEqual(payload.excludeFilterPaths, ['/tmp/spotbugs/exclude.xml']);
    assert.strictEqual(payload.excludeFilterPath, '/tmp/spotbugs/exclude.xml');
  });

  it('copies filter arrays to prevent payload mutation from caller arrays', () => {
    const include = ['/tmp/spotbugs/include.xml'];
    const exclude = ['/tmp/spotbugs/exclude.xml'];
    const baseline = ['/tmp/spotbugs/baseline.xml'];
    const extraAux = ['/tmp/spotbugs/lib.jar'];
    const runtimeClasspaths = ['/workspace/build/classes'];
    const targetResolutionRoots = ['/workspace/build/classes'];

    const payload = buildAnalysisRequestPayload(
      makeSettings({
        extraAuxClasspaths: extraAux,
        includeFilterPaths: include,
        excludeFilterPaths: exclude,
        excludeBaselineBugsPaths: baseline,
      }),
      {
        targetResolutionRoots,
        runtimeClasspaths,
        extraAuxClasspaths: extraAux,
      }
    );

    include.push('/tmp/spotbugs/include2.xml');
    exclude.push('/tmp/spotbugs/exclude2.xml');
    baseline.push('/tmp/spotbugs/baseline2.xml');
    extraAux.push('/tmp/spotbugs/lib2.jar');
    runtimeClasspaths.push('/workspace/lib/dependency.jar');
    targetResolutionRoots.push('/workspace/bin');

    assert.deepStrictEqual(payload.targetResolutionRoots, ['/workspace/build/classes']);
    assert.deepStrictEqual(payload.runtimeClasspaths, ['/workspace/build/classes']);
    assert.deepStrictEqual(payload.extraAuxClasspaths, ['/tmp/spotbugs/lib.jar']);
    assert.deepStrictEqual(payload.includeFilterPaths, ['/tmp/spotbugs/include.xml']);
    assert.deepStrictEqual(payload.excludeFilterPaths, ['/tmp/spotbugs/exclude.xml']);
    assert.deepStrictEqual(payload.excludeBaselineBugsPaths, ['/tmp/spotbugs/baseline.xml']);
  });
});
