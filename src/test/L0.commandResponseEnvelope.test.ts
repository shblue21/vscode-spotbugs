import * as assert from 'assert';
import { decodeCommandResponseEnvelope } from '../lsp/commandResponseEnvelope';

describe('commandResponseEnvelope', () => {
  it('decodes results-only envelopes and preserves additional fields', () => {
    const envelope = {
      results: [{ value: 1 }],
      metadata: 'preserved',
    };

    const decoded = decodeCommandResponseEnvelope(envelope);

    assert.ok(decoded);
    assert.strictEqual(decoded.envelope.metadata, 'preserved');
    assert.deepStrictEqual(decoded.results, [{ value: 1 }]);
    assert.strictEqual(decoded.errors, undefined);
  });

  it('normalizes valid command issues in errors-only envelopes', () => {
    const decoded = decodeCommandResponseEnvelope({
      errors: [
        null,
        'bad',
        {},
        { code: 7, message: 'message only' },
        { code: 'CODE_ONLY', message: 9 },
        { code: 'VALID', message: 'valid message', extra: 'ignored' },
        { code: '', message: 'non-empty message' },
        { code: 'NON_EMPTY_CODE', message: '' },
        { code: '', message: '' },
      ],
    });

    assert.ok(decoded);
    assert.strictEqual(decoded.results, undefined);
    assert.deepStrictEqual(decoded.errors, [
      { message: 'message only' },
      { code: 'CODE_ONLY' },
      { code: 'VALID', message: 'valid message' },
      { code: '', message: 'non-empty message' },
      { code: 'NON_EMPTY_CODE', message: '' },
    ]);
  });

  it('rejects values without a usable command envelope or array fields', () => {
    const samples: unknown[] = [
      null,
      'bad',
      [],
      {},
      { errors: [] },
      { errors: [null, 'bad', {}] },
      { results: null },
      { results: {} },
      { errors: null },
      { errors: {} },
      { results: [], errors: null },
    ];

    for (const sample of samples) {
      assert.strictEqual(decodeCommandResponseEnvelope(sample), undefined);
    }
  });

  it('keeps present malformed errors as an empty array when results are present', () => {
    const decoded = decodeCommandResponseEnvelope({
      results: [],
      errors: [null, 'bad', {}],
    });

    assert.ok(decoded);
    assert.deepStrictEqual(decoded.results, []);
    assert.deepStrictEqual(decoded.errors, []);
  });
});
