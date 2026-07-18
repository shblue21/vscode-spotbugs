import * as assert from 'assert';
import type { AnalysisReportRun } from '../model/analysisReport';
import type { Finding } from '../model/finding';
import {
  buildSpotBugsHtmlReport,
  scopeAnalysisReportRuns,
} from '../services/htmlExporter';

describe('htmlExporter', () => {
  it('renders the selected project with plain report data and safe HTML', () => {
    const selected = finding({
      longMessage: 'Null value reaches <sink>',
      categoryDescription: 'Correctness',
      annotationMessages: ['Method <init>'],
      detailHtml:
        '<p>Use <code>Objects.requireNonNull</code>.</p><table><tr><th>Replace</th><th>With</th></tr><tr><td>old</td><td>new</td></tr></table><script>alert(1)</script>',
    });
    const runs: AnalysisReportRun[] = [
      {
        projectUri: 'file:///workspace/project-a',
        findings: [selected, finding({ type: 'OTHER' })],
        spotbugsVersion: '4.9.8',
        summary: {
          analyzedCodeSize: 1000,
          analyzedClassCount: 2,
          analyzedPackageCount: 1,
        },
      },
      { projectUri: 'file:///workspace/project-b', findings: [finding()] },
    ];

    const html = buildSpotBugsHtmlReport(scopeAnalysisReportRuns(runs, [selected]));

    assert.ok(html.includes('Project: project-a'));
    assert.ok(!html.includes('project-b'));
    assert.ok(html.includes('1000 lines of code analyzed, in 2 classes, in 1 packages.'));
    assert.ok(html.includes('Null value reaches &lt;sink&gt;'));
    assert.ok(html.includes('Method &lt;init&gt;'));
    assert.ok(html.includes('<code>Objects.requireNonNull</code>'));
    assert.ok(html.includes('<table>'));
    assert.ok(html.includes('<th>Replace</th>'));
    assert.ok(html.includes('<td>new</td>'));
    assert.ok(!html.includes('<script'));
    assert.ok(html.includes('src/Example.java, line 10'));
    assert.ok(!html.includes('/workspace/project-a/src/Example.java'));
  });

  it('keeps multi-project summaries separate', () => {
    const selected = finding();
    const hidden = finding({ type: 'OTHER' });
    const html = buildSpotBugsHtmlReport(
      scopeAnalysisReportRuns(
        [
          { projectUri: 'file:///workspace/alpha', findings: [selected] },
          { projectUri: 'file:///workspace/beta', findings: [hidden] },
          { projectUri: 'file:///workspace/clean', findings: [] },
          {
            projectUri: 'file:///workspace/failed',
            findings: [],
            analysisStatus: 'failed',
          },
        ],
        [selected],
        true
      )
    );

    assert.ok(html.includes('Project: alpha'));
    assert.ok(!html.includes('Project: beta'));
    assert.ok(html.includes('Project: clean'));
    assert.ok(html.includes('Project: failed'));
    assert.ok(html.includes('<b>Incomplete report:</b>'));
    assert.ok(html.includes('<b>Analysis status: Failed.</b>'));
    assert.strictEqual((html.match(/<h2>Summary<\/h2>/g) ?? []).length, 2);
  });
});

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    patternId: 'NP',
    type: 'NP_NULL_ON_SOME_PATH',
    abbrev: 'NP',
    category: 'CORRECTNESS',
    priority: 'High',
    shortDescription: 'Possible null pointer dereference',
    message: 'NP: Possible null pointer dereference',
    location: {
      fullPath: '/workspace/project-a/src/Example.java',
      realSourcePath: 'src/Example.java',
      startLine: 10,
    },
    ...overrides,
  };
}
