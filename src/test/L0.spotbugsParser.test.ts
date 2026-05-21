import * as assert from 'assert';
import { parseAnalysisResponse } from '../lsp/spotbugsParser';
import type { AnalysisResponse } from '../model/analysisProtocol';
import { readAnalysisProtocolFixtureJson } from './helpers/analysisProtocolFixtures';

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

  it('rejects unsupported JSON protocol shapes', () => {
    const samples = [
      JSON.stringify({}),
      JSON.stringify({ stats: { durationMs: 1 } }),
      JSON.stringify({ errors: [] }),
      JSON.stringify(null),
      JSON.stringify('boom'),
    ];

    for (const sample of samples) {
      const result = parseAnalysisResponse(sample);
      assert.strictEqual(result.ok, false, sample);
      if (!result.ok) {
        assert.strictEqual(result.error.kind, 'invalid-json');
        assert.strictEqual(result.error.message, 'Invalid response payload.');
      }
    }
  });

  it('parses envelope responses with errors and stats', () => {
    const result = parseAnalysisResponse(
      JSON.stringify({
        schemaVersion: 2,
        results: [{ type: 'UR' }],
        errors: [{ code: 'X', message: 'warn' }],
        stats: { target: '/tmp/Foo', durationMs: 12 },
      })
    );
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.schemaVersion, 2);
      assert.strictEqual(result.value.bugs.length, 1);
      assert.strictEqual(result.value.errors?.length, 1);
      assert.strictEqual(result.value.errors?.[0]?.code, 'X');
      assert.strictEqual(result.value.errors?.[0]?.message, 'warn');
      assert.strictEqual(result.value.stats?.target, '/tmp/Foo');
    }
  });

  it('parses terminal analysis failure envelopes with stats', () => {
    const fixture = readAnalysisProtocolFixtureJson<AnalysisResponse>(
      'run-analysis-response-error-with-stats.json'
    );
    const result = parseAnalysisResponse(JSON.stringify(fixture));

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.schemaVersion, fixture.schemaVersion);
      assert.deepStrictEqual(result.value.bugs, fixture.results);
      assert.deepStrictEqual(result.value.errors, fixture.errors);
      assert.deepStrictEqual(result.value.stats, fixture.stats);
    }
  });

  it('parses terminal analysis cancellation envelopes with stats', () => {
    const result = parseAnalysisResponse(
      JSON.stringify({
        schemaVersion: 2,
        results: [],
        errors: [
          {
            code: 'ANALYSIS_CANCELLED',
            message: 'Command cancelled',
          },
        ],
        stats: {
          target: '/workspace/build/classes',
          durationMs: 4,
          spotbugsVersion: '4.8.3',
        },
      })
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.schemaVersion, 2);
      assert.deepStrictEqual(result.value.bugs, []);
      assert.strictEqual(result.value.errors?.[0]?.code, 'ANALYSIS_CANCELLED');
      assert.strictEqual(result.value.errors?.[0]?.message, 'Command cancelled');
      assert.strictEqual(result.value.stats?.target, '/workspace/build/classes');
      assert.strictEqual(result.value.stats?.durationMs, 4);
    }
  });
});
