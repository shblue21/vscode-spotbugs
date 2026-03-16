import * as assert from 'assert';
import {
  renderFindingDescriptionHtml,
  sanitizeFindingDetailHtml,
} from '../ui/findingDescriptionRenderer';
import { Finding } from '../model/finding';

describe('findingDescriptionPanel', () => {
  it('renders local HTML detail and keeps external docs secondary', () => {
    const html = renderFindingDescriptionHtml(
      makeFinding({
        detailHtml: '<p>Local detail body.</p>',
        helpUri: 'https://example.test/rule',
      })
    );

    assert.ok(html.includes('<p>Local detail body.</p>'));
    assert.ok(html.includes('Open external SpotBugs docs'));
  });

  it('sanitizes dangerous markup and falls back to plain text detail', () => {
    const sanitized = sanitizeFindingDetailHtml(
      '<script>alert(1)</script><p onclick="boom()">Safe body</p><a href="javascript:evil()">Bad link</a>'
    );
    assert.ok(!sanitized.includes('<script'));
    assert.ok(!sanitized.includes('onclick='));
    assert.ok(sanitized.includes('href="#"'));

    const html = renderFindingDescriptionHtml(
      makeFinding({
        longDescription: 'Plain text fallback',
      })
    );
    assert.ok(html.includes('Plain text fallback'));
  });
});

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    patternId: 'NP_ALWAYS_NULL',
    type: 'NP_ALWAYS_NULL',
    abbrev: 'NP',
    message: 'Null pointer',
    location: {
      fullPath: '/tmp/Example.java',
      startLine: 1,
      endLine: 1,
    },
    ...overrides,
  };
}
