import * as path from 'path';
import type { AnalysisReportRun } from '../model/analysisReport';
import type { Finding } from '../model/finding';
import { sanitizeFindingDetailHtml } from '../ui/findingDescriptionRenderer';

type CategoryGroup = { description: string; findings: Finding[] };

export function scopeAnalysisReportRuns(
  runs: AnalysisReportRun[],
  selectedFindings: Finding[],
  includeOriginallyEmptyRuns = false
): AnalysisReportRun[] {
  const selected = new Set(selectedFindings);
  return runs
    .map((run) => ({
      ...run,
      findings: run.findings.filter((finding) => selected.has(finding)),
    }))
    .filter(
      (run, index) =>
        run.findings.length > 0 ||
        (includeOriginallyEmptyRuns && runs[index].findings.length === 0)
    );
}

export function buildSpotBugsHtmlReport(runs: AnalysisReportRun[]): string {
  const reportRuns = runs.length > 0 ? runs : [{ projectUri: 'workspace', findings: [] }];
  const incomplete = reportRuns.some((run) => run.analysisStatus);
  return `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SpotBugs Report</title>
  <style>
    body{margin:2rem;color:#1f2328;background:#fff;font:14px/1.5 Arial,sans-serif}a{color:#0969da}
    table{width:100%;border-collapse:collapse;margin:.75rem 0 2rem}th,td{padding:.55rem;border:1px solid #d0d7de;text-align:left;vertical-align:top}
    .tableheader{background:#b9b9fe;font-size:larger}.tablerow0{background:#eee}.tablerow1{background:#fff}.number{text-align:right}
    .project-report+.project-report{margin-top:4rem;padding-top:2rem;border-top:2px solid #d0d7de}.rule-detail{max-width:80rem}pre{white-space:pre-wrap}
  </style>
</head><body data-spotbugs-report-format="plain">
  <h1>SpotBugs Report</h1>
  ${incomplete ? '<p><b>Incomplete report:</b> One or more projects were not analyzed successfully.</p>' : ''}
  ${reportRuns.map((run, index) => renderRun(run, index, reportRuns.length)).join('\n')}
</body></html>`;
}

function renderRun(run: AnalysisReportRun, index: number, runCount: number): string {
  const prefix = `run-${index + 1}`;
  const categories = groupByCategory(run.findings);
  const rules = uniqueRules(run.findings);
  const ruleAnchors = new Map(
    rules.map((finding, ruleIndex) => [ruleKey(finding), `${prefix}-rule-${ruleIndex + 1}`])
  );
  const project = escapeHtml(projectName(run.projectUri));
  if (run.analysisStatus) {
    const status = run.analysisStatus === 'skipped' ? 'Skipped' : 'Failed';
    return `<section class="project-report" id="${prefix}">
    ${runCount > 1 ? `<h2>Project: ${project}</h2>` : `<p>Project: ${project}</p>`}
    <p><b>Analysis status: ${status}.</b> No SpotBugs results were produced for this project.</p>
  </section>`;
  }
  const version = run.spotbugsVersion ? ` ${escapeHtml(run.spotbugsVersion)}` : '';

  return `<section class="project-report" id="${prefix}">
    ${runCount > 1 ? `<h2>Project: ${project}</h2>` : ''}
    <p>Produced using <a href="https://spotbugs.github.io">SpotBugs</a>${version}.</p>
    ${runCount === 1 ? `<p>Project: ${project}</p>` : ''}
    ${renderMetrics(run)}
    ${renderSummary(categories, run.findings.length, prefix)}
    ${renderWarnings(categories, ruleAnchors, prefix)}
    ${renderRules(rules, ruleAnchors)}
  </section>`;
}

function renderMetrics(run: AnalysisReportRun): string {
  const summary = run.summary;
  if (
    typeof summary?.analyzedCodeSize !== 'number' ||
    typeof summary.analyzedClassCount !== 'number' ||
    typeof summary.analyzedPackageCount !== 'number'
  ) {
    return '';
  }
  const counts = { high: 0, medium: 0, low: 0 };
  for (const finding of run.findings) {
    const priority = finding.priority?.trim().toLowerCase();
    if (priority === 'high' || priority === 'medium' || priority === 'low') {
      counts[priority]++;
    }
  }
  const metricRows: Array<[string, number]> = [
    ['High Priority Warnings', counts.high],
    ['Medium Priority Warnings', counts.medium],
    ['Low Priority Warnings', counts.low],
    ['Total Warnings', run.findings.length],
  ];
  const density = (count: number) =>
    (summary.analyzedCodeSize! > 0 ? count / (summary.analyzedCodeSize! / 1000) : 0).toFixed(2);

  return `<h2>Metrics</h2>
    <p>${summary.analyzedCodeSize} lines of code analyzed, in ${summary.analyzedClassCount} classes, in ${summary.analyzedPackageCount} packages.</p>
    <table style="max-width:500px"><tr class="tableheader"><th>Metric</th><th class="number">Total</th><th class="number">Density*</th></tr>
      ${metricRows.map(([label, count], i) => `<tr class="tablerow${i % 2}"><td>${label}</td><td class="number">${count}</td><td class="number">${density(count)}</td></tr>`).join('')}
    </table><p><i>(* Defects per Thousand lines of non-commenting source statements)</i></p>`;
}

function renderSummary(
  categories: Array<[string, CategoryGroup]>,
  total: number,
  prefix: string
): string {
  const rows = categories
    .map(
      ([, group], index) =>
        `<tr class="tablerow${index % 2}"><td><a href="#${prefix}-category-${index + 1}">${escapeHtml(group.description)} Warnings</a></td><td class="number">${group.findings.length}</td></tr>`
    )
    .join('');
  return `<h2>Summary</h2><table style="max-width:500px">
    <tr class="tableheader"><th>Warning Type</th><th class="number">Number</th></tr>
    ${rows}<tr class="tablerow${categories.length % 2}"><td><b>Total</b></td><td class="number"><b>${total}</b></td></tr>
  </table>`;
}

function renderWarnings(
  categories: Array<[string, CategoryGroup]>,
  ruleAnchors: Map<string, string>,
  prefix: string
): string {
  const sections = categories
    .map(([, group], index) => {
      const rows = group.findings
        .slice()
        .sort(compareFindings)
        .map((finding, rowIndex) => renderFinding(finding, rowIndex, ruleAnchors))
        .join('');
      return `<h2 id="${prefix}-category-${index + 1}">${escapeHtml(group.description)} Warnings</h2>
        <table><tr class="tableheader"><th>Warning</th><th>Priority</th><th>Details</th></tr>${rows}</table>`;
    })
    .join('\n');
  return `<h1>Warnings</h1><p>Click on each warning link to see a full description of the issue, and details of how to resolve it.</p>${sections || '<p><i>None</i></p>'}`;
}

function renderFinding(
  finding: Finding,
  index: number,
  ruleAnchors: Map<string, string>
): string {
  const shortMessage = finding.shortDescription || finding.message || ruleKey(finding);
  const longMessage = finding.longMessage || finding.message || shortMessage;
  const annotations = (finding.annotationMessages ?? [])
    .map((message) => `<br>${escapeHtml(message)}`)
    .join('');
  return `<tr class="tablerow${index % 2}"><td style="width:20%"><a href="#${ruleAnchors.get(ruleKey(finding))}">${escapeHtml(shortMessage)}</a></td>
    <td style="width:10%">${normalizedPriority(finding.priority)}</td>
    <td style="width:70%"><p>${escapeHtml(longMessage)}${renderLocation(finding)}${annotations}</p></td></tr>`;
}

function renderRules(rules: Finding[], anchors: Map<string, string>): string {
  const details = rules
    .slice()
    .sort(
      (left, right) =>
        (left.abbrev ?? '').localeCompare(right.abbrev ?? '') ||
        (left.shortDescription ?? '').localeCompare(right.shortDescription ?? '')
    )
    .map((finding) => {
      const title = finding.shortDescription || finding.message || ruleKey(finding);
      const sanitized = finding.detailHtml
        ? sanitizeFindingDetailHtml(finding.detailHtml, finding.type)
        : '';
      const detail =
        sanitized ||
        (finding.longDescription
          ? `<p>${escapeHtml(finding.longDescription).replace(/\n/g, '<br>')}</p>`
          : '');
      return `<section class="rule-detail"><h2 id="${anchors.get(ruleKey(finding))}">${escapeHtml(title)}</h2>${detail}</section>`;
    })
    .join('\n');
  return `<h1>Warning Types</h1>${details || '<p><i>None</i></p>'}`;
}

function groupByCategory(findings: Finding[]): Array<[string, CategoryGroup]> {
  const groups = new Map<string, CategoryGroup>();
  for (const finding of findings) {
    const key = finding.category?.trim() || 'Unknown';
    const group = groups.get(key) ?? {
      description: finding.categoryDescription?.trim() || key,
      findings: [],
    };
    group.findings.push(finding);
    groups.set(key, group);
  }
  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function uniqueRules(findings: Finding[]): Finding[] {
  return Array.from(
    findings
      .reduce((rules, finding) => rules.set(ruleKey(finding), rules.get(ruleKey(finding)) ?? finding), new Map<string, Finding>())
      .values()
  );
}

function renderLocation(finding: Finding): string {
  const sourcePath = finding.location.realSourcePath || finding.location.sourceFile;
  if (!sourcePath) {
    return '';
  }
  const start = validLine(finding.location.startLine);
  const end = validLine(finding.location.endLine);
  const lines = start ? (end && end !== start ? `, lines ${start} to ${end}` : `, line ${start}`) : '';
  return `<br><br>In file ${escapeHtml(sourcePath)}${lines}`;
}

function compareFindings(left: Finding, right: Finding): number {
  return (
    priorityOrder(left.priority) - priorityOrder(right.priority) ||
    (left.abbrev ?? '').localeCompare(right.abbrev ?? '') ||
    (left.className ?? '').localeCompare(right.className ?? '')
  );
}

function normalizedPriority(priority?: string): 'High' | 'Medium' | 'Low' | 'Unknown' {
  const value = priority?.trim().toLowerCase();
  return value === 'high' ? 'High' : value === 'medium' ? 'Medium' : value === 'low' ? 'Low' : 'Unknown';
}

function priorityOrder(priority?: string): number {
  const normalized = normalizedPriority(priority);
  return normalized === 'High' ? 1 : normalized === 'Medium' ? 2 : normalized === 'Low' ? 3 : 4;
}

function validLine(value?: number): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function ruleKey(finding: Finding): string {
  return finding.type || finding.patternId || finding.abbrev || 'Unknown';
}

function projectName(projectUri: string): string {
  try {
    return path.basename(decodeURIComponent(new URL(projectUri).pathname).replace(/[\\/]+$/, '')) || projectUri;
  } catch {
    return path.basename(projectUri) || projectUri || 'workspace';
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
