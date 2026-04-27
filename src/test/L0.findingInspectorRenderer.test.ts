import * as assert from 'assert';
import { renderFindingInspectorHtml } from '../ui/findingInspectorRenderer';
import { Finding } from '../model/finding';
import { FindingInspectorSnapshot } from '../ui/findingInspectorState';

describe('findingInspectorRenderer', () => {
  it('renders empty state without finding actions', () => {
    const html = renderFindingInspectorHtml({ status: 'empty' }, 'nonce-1');

    assert.ok(html.includes('Select a finding to inspect it.'));
    assert.ok(!html.includes('data-command="openDetails"'));
  });

  it('renders selected finding as reported context, rule metadata, and actions without details prose', () => {
    const html = renderFindingInspectorHtml(makeSnapshot('selected'), 'nonce-1');

    assert.ok(html.includes('Selected finding'));
    assert.ok(html.includes('class="severity"'));
    assert.ok(html.includes('Reported here'));
    assert.ok(
      html.includes(
        'NP_ALWAYS_NULL: Possible null pointer dereference in com.acme.Example.run()'
      )
    );
    assert.ok(html.includes('Rule'));
    assert.ok(html.includes('NP_ALWAYS_NULL'));
    assert.ok(html.includes('CORRECTNESS'));
    assert.ok(html.includes('High'));
    assert.ok(html.includes('<dt>Rank</dt><dd>3</dd>'));
    assert.ok(html.includes('<dt>CWE</dt><dd>476</dd>'));
    assert.ok(html.includes('/tmp/Example.java:12-14'));
    assert.ok(html.includes('data-command="revealSource"'));
    assert.ok(html.includes('data-command="openDetails"'));
    assert.ok(html.includes('data-command="copyRuleId"'));
    assert.ok(html.includes('data-command="openDocs"'));
    assert.ok(!html.includes('Quick context'));
    assert.ok(!html.includes('What this rule checks'));
    assert.ok(!html.includes('&lt;escaped&gt; rule summary.'));
    assert.ok(!html.includes('<escaped> rule summary.'));
    assert.ok(!html.includes('Rule summary'));
    assert.ok(!html.includes('Full details paragraph'));
    assert.ok(!html.includes('Long plain text rule explanation.'));
    assert.ok(!html.includes('Open details for the full rule explanation.'));
  });

  it('renders retained finding label', () => {
    const html = renderFindingInspectorHtml(makeSnapshot('retained'), 'nonce-1');

    assert.ok(html.includes('Last inspected finding'));
  });

  it('omits docs action when no docs target exists', () => {
    const snapshot: FindingInspectorSnapshot = {
      status: 'selected',
      finding: makeFinding({ helpUri: undefined }),
    };

    const html = renderFindingInspectorHtml(snapshot, 'nonce-1');

    assert.ok(!html.includes('data-command="openDocs"'));
  });

  it('omits docs action for non-web docs targets', () => {
    const snapshot: FindingInspectorSnapshot = {
      status: 'selected',
      finding: makeFinding({ helpUri: 'command:workbench.action.closeWindow' }),
    };

    const html = renderFindingInspectorHtml(snapshot, 'nonce-1');

    assert.ok(!html.includes('data-command="openDocs"'));
  });
});

function makeSnapshot(status: 'selected' | 'retained'): FindingInspectorSnapshot {
  return {
    status,
    finding: makeFinding({}),
  };
}

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    patternId: 'NP_ALWAYS_NULL',
    type: 'NP_ALWAYS_NULL',
    abbrev: 'NP',
    category: 'CORRECTNESS',
    priority: 'High',
    rank: 3,
    cweId: 476,
    message: 'NP_ALWAYS_NULL: Possible null pointer dereference in com.acme.Example.run()',
    shortDescription: 'Null pointer dereference',
    detailHtml:
      '<p>&lt;escaped&gt; rule summary.</p><p>Full details paragraph.</p><pre>example();</pre>',
    longDescription: 'Long plain text rule explanation.',
    helpUri:
      'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html#NP_ALWAYS_NULL',
    className: 'com.acme.Example',
    methodName: 'run',
    location: {
      fullPath: '/tmp/Example.java',
      startLine: 12,
      endLine: 14,
    },
    ...overrides,
  };
}
