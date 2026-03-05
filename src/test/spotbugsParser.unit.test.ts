import * as assert from 'assert';
import { parseAnalysisResponse } from '../lsp/spotbugsParser';

describe('spotbugsParser', () => {
  it('returns invalid-json error for malformed payloads', () => {
    const result = parseAnalysisResponse('{');
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.kind, 'invalid-json');
      assert.strictEqual(result.error.message, 'Invalid response payload.');
    }
  });

  it('returns analysis-error when payload contains top-level error', () => {
    const result = parseAnalysisResponse(JSON.stringify({ error: 'boom' }));
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.kind, 'analysis-error');
      assert.strictEqual(result.error.message, 'boom');
    }
  });

  it('parses array responses as bugs', () => {
    const result = parseAnalysisResponse(JSON.stringify([{ type: 'NP' }]));
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.bugs.length, 1);
    }
  });

  it('parses envelope responses with errors and stats', () => {
    const result = parseAnalysisResponse(
      JSON.stringify({
        schemaVersion: 1,
        results: [{ type: 'UR' }],
        errors: [{ code: 'X', message: 'warn' }],
        stats: { target: '/tmp/Foo', durationMs: 12 },
      })
    );
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.schemaVersion, 1);
      assert.strictEqual(result.value.bugs.length, 1);
      assert.strictEqual(result.value.errors?.length, 1);
      assert.strictEqual(result.value.stats?.target, '/tmp/Foo');
    }
  });
});
