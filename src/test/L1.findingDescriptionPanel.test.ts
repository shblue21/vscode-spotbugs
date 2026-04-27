import * as assert from 'assert';
import {
  renderFindingDescriptionHtml,
  sanitizeFindingDetailHtml,
} from '../ui/findingDescriptionRenderer';
import { Finding } from '../model/finding';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();

describe('findingDescriptionPanel', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('renders local HTML detail and rewrites external docs to the slug anchor', () => {
    const html = renderFindingDescriptionHtml(
      makeFinding({
        detailHtml: '<p>Local detail body.</p>',
        helpUri:
          'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html#NP_ALWAYS_NULL',
      })
    );

    assert.ok(html.includes('<p>Local detail body.</p>'));
    assert.ok(html.includes('Open external SpotBugs docs'));
    assert.ok(
      html.includes(
        'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html#np-always-null'
      )
    );
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

  it('preserves allowlisted formatting tags and rewrites matching SpotBugs detail links', () => {
    const sanitized = sanitizeFindingDetailHtml(
      [
        '<p>Intro with <code>code()</code>.</p>',
        '<pre>line 1\nline 2</pre>',
        '<a href="https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html#NP_ALWAYS_NULL" title="Rule docs">Docs</a>',
        '<a href="https://example.test/rule">External</a>',
      ].join(''),
      'NP_ALWAYS_NULL'
    );

    assert.ok(sanitized.includes('<p>Intro with <code>code()</code>.</p>'));
    assert.ok(sanitized.includes('<pre>line 1\nline 2</pre>'));
    assert.ok(
      sanitized.includes(
        '<a href="https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html#np-always-null" title="Rule docs">Docs</a>'
      )
    );
    assert.ok(sanitized.includes('<a href="https://example.test/rule">External</a>'));
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

  it('reuses the existing details panel across repeated show calls', async () => {
    let createCount = 0;
    let revealCount = 0;
    let disposeCount = 0;
    const webview = { html: '' };
    resetVscodeMock({
      window: {
        createWebviewPanel: () => {
          createCount += 1;
          return {
            title: '',
            webview,
            reveal: () => {
              revealCount += 1;
            },
            dispose: () => {
              disposeCount += 1;
            },
            onDidDispose: () => ({ dispose: () => undefined }),
          };
        },
      } as never,
    });
    const detailsPanelModule = await import('../ui/findingDescriptionPanel');
    const panel = new detailsPanelModule.FindingDescriptionPanel();

    panel.show(makeFinding({ patternId: 'NP_ALWAYS_NULL', type: 'NP_ALWAYS_NULL' }));
    const firstHtml = webview.html;
    panel.show(makeFinding({ patternId: 'URF_UNREAD_FIELD', type: 'URF_UNREAD_FIELD' }));

    assert.strictEqual(createCount, 1);
    assert.strictEqual(revealCount, 2);
    assert.strictEqual(disposeCount, 0);
    assert.ok(firstHtml.includes('NP_ALWAYS_NULL'));
    assert.ok(webview.html.includes('URF_UNREAD_FIELD'));
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
