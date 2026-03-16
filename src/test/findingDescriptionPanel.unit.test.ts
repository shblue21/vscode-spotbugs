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

  it('removes disallowed tags, event handlers, and javascript links', () => {
    const sanitized = sanitizeFindingDetailHtml(
      '<script>alert(1)</script><p onclick="boom()">Safe body</p><a href="javascript:evil()">Bad link</a>'
    );

    assert.ok(!sanitized.includes('<script'));
    assert.ok(!sanitized.includes('alert(1)'));
    assert.ok(!sanitized.includes('onclick='));
    assert.ok(!sanitized.includes('javascript:'));
    assert.ok(sanitized.includes('<p>Safe body</p>'));
    assert.ok(sanitized.includes('<a>Bad link</a>'));
  });

  it('preserves allowlisted formatting tags and safe https links', () => {
    const sanitized = sanitizeFindingDetailHtml(
      [
        '<p>Intro with <code>code()</code>.</p>',
        '<pre>line 1\nline 2</pre>',
        '<a href="https://example.test/rule" title="Rule docs">Docs</a>',
      ].join('')
    );

    assert.ok(sanitized.includes('<p>Intro with <code>code()</code>.</p>'));
    assert.ok(sanitized.includes('<pre>line 1\nline 2</pre>'));
    assert.ok(
      sanitized.includes('<a href="https://example.test/rule" title="Rule docs">Docs</a>')
    );
  });

  it('falls back to plain text detail when sanitized html becomes empty', () => {
    const html = renderFindingDescriptionHtml(
      makeFinding({
        detailHtml: '<script>alert(1)</script><style>p { color: red; }</style>',
        longDescription: 'Plain text fallback',
      })
    );

    assert.ok(html.includes('Plain text fallback'));
    assert.ok(!html.includes('<script'));
    assert.ok(!html.includes('p { color: red; }'));
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
