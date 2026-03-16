import * as assert from 'assert';
import { mapBugToFinding } from '../lsp/spotbugsMapper';

describe('spotbugsMapper', () => {
  it('maps detailHtml into the finding model', () => {
    const finding = mapBugToFinding({
      type: 'NP_ALWAYS_NULL',
      abbrev: 'NP',
      message: 'Null pointer',
      detailHtml: '<p>Local detail.</p>',
      longDescription: 'Plain text detail',
      helpUri: 'https://example.test/rule',
      startLine: 3,
      endLine: 4,
      fullPath: '/tmp/Example.java',
    });

    assert.strictEqual(finding.detailHtml, '<p>Local detail.</p>');
    assert.strictEqual(finding.longDescription, 'Plain text detail');
    assert.strictEqual(finding.helpUri, 'https://example.test/rule');
    assert.strictEqual(finding.location.fullPath, '/tmp/Example.java');
  });
});
