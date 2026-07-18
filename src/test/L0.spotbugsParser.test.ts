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

  it('rejects array responses with non-object entries', () => {
    const samples = [JSON.stringify([null]), JSON.stringify(['NP']), JSON.stringify([[]])];

    for (const sample of samples) {
      const result = parseAnalysisResponse(sample);
      assert.strictEqual(result.ok, false, sample);
      if (!result.ok) {
        assert.strictEqual(result.error.kind, 'invalid-json');
        assert.strictEqual(result.error.message, 'Invalid response payload.');
      }
    }
  });

  it('rejects unsupported JSON protocol shapes', () => {
    const samples = [
      JSON.stringify({}),
      JSON.stringify({ stats: { durationMs: 1 } }),
      JSON.stringify({ errors: [] }),
      JSON.stringify({ errors: [null, 'bad', {}] }),
      JSON.stringify({
        schemaVersion: 2,
        warnings: [{ code: 'PLUGIN_CLEANUP_FAILED', message: 'Could not delete plugin' }],
      }),
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

  it('parses empty results with warnings as a successful response', () => {
    const result = parseAnalysisResponse(
      JSON.stringify({
        schemaVersion: 2,
        results: [],
        warnings: [{ code: 'PLUGIN_CLEANUP_FAILED', message: 'Could not delete plugin' }],
      })
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.deepStrictEqual(result.value.bugs, []);
      assert.deepStrictEqual(result.value.warnings, [
        { code: 'PLUGIN_CLEANUP_FAILED', message: 'Could not delete plugin' },
      ]);
    }
  });

  it('rejects envelope result arrays with non-object entries', () => {
    const samples = [
      JSON.stringify({ schemaVersion: 2, results: [null] }),
      JSON.stringify({ schemaVersion: 2, results: ['NP'] }),
      JSON.stringify({ schemaVersion: 2, results: [[]] }),
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

  it('normalizes envelope errors to string code and message fields', () => {
    const result = parseAnalysisResponse(
      JSON.stringify({
        schemaVersion: 2,
        results: [],
        errors: [
          null,
          'bad',
          { code: 7, message: 'message only' },
          { code: 'CODE_ONLY', message: 9 },
          { code: 'VALID', message: 'valid message', extra: 'ignored' },
          {},
        ],
      })
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.deepStrictEqual(result.value.errors, [
        { message: 'message only' },
        { code: 'CODE_ONLY' },
        { code: 'VALID', message: 'valid message' },
      ]);
    }
  });

  it('normalizes envelope stats and schemaVersion without failing usable results', () => {
    const result = parseAnalysisResponse(
      JSON.stringify({
        schemaVersion: '2',
        results: [{ type: 'UR' }],
        stats: {
          target: '/tmp/Foo',
          durationMs: '12',
          findingCount: 1,
          spotbugsVersion: '4.9.8',
          targetResolutionRootCount: 2,
          runtimeClasspathCount: false,
          extraAuxClasspathCount: 3,
          auxClasspathCount: 4,
          targetCount: null,
          pluginCount: 5,
          ignored: 'value',
        },
        reportSummary: {
          analyzedCodeSize: 1200,
          analyzedClassCount: 4,
          analyzedPackageCount: 2,
        },
      })
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.schemaVersion, undefined);
      assert.deepStrictEqual(result.value.stats, {
        target: '/tmp/Foo',
        findingCount: 1,
        spotbugsVersion: '4.9.8',
        targetResolutionRootCount: 2,
        extraAuxClasspathCount: 3,
        auxClasspathCount: 4,
        pluginCount: 5,
      });
      assert.deepStrictEqual(result.value.reportSummary, {
        analyzedCodeSize: 1200,
        analyzedClassCount: 4,
        analyzedPackageCount: 2,
      });
    }
  });

  it('ignores malformed stats values without rejecting the envelope', () => {
    const samples = [
      JSON.stringify({
        schemaVersion: 2,
        results: [],
        errors: [{ code: 'ANALYSIS_FAILED', message: 'boom' }],
        stats: 'bad',
      }),
      JSON.stringify({
        schemaVersion: 2,
        results: [],
        errors: [{ code: 'ANALYSIS_FAILED', message: 'boom' }],
        stats: { ignored: 'value', durationMs: '12' },
      }),
    ];

    for (const sample of samples) {
      const result = parseAnalysisResponse(sample);
      assert.strictEqual(result.ok, true, sample);
      if (result.ok) {
        assert.strictEqual(result.value.stats, undefined);
        assert.strictEqual(result.value.errors?.[0]?.code, 'ANALYSIS_FAILED');
      }
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
