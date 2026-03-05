import * as assert from 'assert';
import { buildAnalysisRequestPayload } from '../lsp/analysisRequestBuilder';
import type { AnalysisSettings } from '../core/config';

function makeSettings(overrides: Partial<AnalysisSettings> = {}): AnalysisSettings {
  return {
    effort: 'default',
    ...overrides,
  };
}

describe('analysisRequestBuilder', () => {
  it('includes include/exclude/excludeBaseline filter paths in payload', () => {
    const include = ['/tmp/spotbugs/include.xml'];
    const exclude = ['/tmp/spotbugs/exclude.xml'];
    const baseline = ['/tmp/spotbugs/baseline.xml'];

    const payload = buildAnalysisRequestPayload(
      makeSettings({
        includeFilterPaths: include,
        excludeFilterPaths: exclude,
        excludeBaselineBugsPaths: baseline,
      }),
      {
        classpaths: ['/workspace/build/classes'],
        sourcepaths: ['/workspace/src/main/java'],
      }
    );

    assert.deepStrictEqual(payload.includeFilterPaths, include);
    assert.deepStrictEqual(payload.excludeFilterPaths, exclude);
    assert.deepStrictEqual(payload.excludeBaselineBugsPaths, baseline);
  });

  it('omits filter fields when arrays are empty', () => {
    const payload = buildAnalysisRequestPayload(
      makeSettings({
        includeFilterPaths: [],
        excludeFilterPaths: [],
        excludeBaselineBugsPaths: [],
      }),
      {}
    );

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

    const payload = buildAnalysisRequestPayload(
      makeSettings({
        includeFilterPaths: include,
        excludeFilterPaths: exclude,
        excludeBaselineBugsPaths: baseline,
      }),
      {}
    );

    include.push('/tmp/spotbugs/include2.xml');
    exclude.push('/tmp/spotbugs/exclude2.xml');
    baseline.push('/tmp/spotbugs/baseline2.xml');

    assert.deepStrictEqual(payload.includeFilterPaths, ['/tmp/spotbugs/include.xml']);
    assert.deepStrictEqual(payload.excludeFilterPaths, ['/tmp/spotbugs/exclude.xml']);
    assert.deepStrictEqual(payload.excludeBaselineBugsPaths, ['/tmp/spotbugs/baseline.xml']);
  });
});
