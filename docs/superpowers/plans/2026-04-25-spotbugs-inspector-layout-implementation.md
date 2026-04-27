# SpotBugs Inspector Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two-view SpotBugs sidebar: native results `TreeView`, native inspector `WebviewView`, explicit source/details commands, and regression coverage for the new triage workflow.

**Architecture:** Keep the existing findings tree as the result list and add a separate inspector controller/state/provider path. Split source navigation from full details, remove tree leaf primary-click side effects, and reuse the existing full details panel for explicit deep reading. Keep backend analysis unchanged; only `java.spotbugs.run` remains the LS delegate command.

**Tech Stack:** TypeScript, VS Code extension API, VS Code `TreeView`, VS Code `WebviewView`, Mocha, Node `assert`, existing `sanitize-html` dependency, existing VS Code integration tests.

---

## Source Spec

Design document: `docs/superpowers/specs/2026-04-20-spotbugs-inspector-layout-design.md`

Key implementation contracts:

- Results stay in `spotbugs-view` as a native `TreeView`.
- Inspector is a new native `WebviewView` with id `spotbugs-inspector-view`.
- `spotbugs.openBugLocation` is removed without a shim.
- New frontend commands:
  - `spotbugs.revealFindingSource`
  - `spotbugs.openFindingDetails`
- Tree leaf single click updates inspector only.
- Finding leaf context menu exposes `Go to code` and `Open details`.
- Diagnostic quick fix `Show SpotBugs details` opens full details, not source.
- Category/pattern selection keeps the last inspected leaf in the inspector and preserves scoped export.
- Loading, reset, rerun, workspace progress, and filter invalidation clear inspector state.
- Already opened full details panel stays open across reset/rerun/filter invalidation.

## File Structure

Create:

- `src/commands/findingCommandTarget.ts`: resolves explicit `Finding` payloads and no-argument command-palette targets from inspector state.
- `src/commands/findingInspectorLifecycle.ts`: wraps result lifecycle commands so they clear or reconcile inspector state without touching the full details panel.
- `src/ui/findingPreview.ts`: extracts a sanitized, normalized, structurally bounded plain-text rule summary for inspector.
- `src/ui/findingInspectorState.ts`: owns current inspector state, retained state, clearing, and visible-result reconciliation.
- `src/ui/findingInspectorRenderer.ts`: pure HTML renderer for empty and finding inspector states.
- `src/ui/findingInspectorViewProvider.ts`: VS Code `WebviewViewProvider`, handles webview messages and delegates to commands/clipboard/docs.
- `src/ui/findingInspectorController.ts`: wires tree selection events into inspector state.
- `src/test/L0.findingPreview.test.ts`
- `src/test/L0.findingInspectorState.test.ts`
- `src/test/L0.findingInspectorRenderer.test.ts`
- `src/test/L1.findingInspectorViewProvider.test.ts`
- `src/test/L1.findingTreeItem.test.ts`
- `src/test/L1.findingInspectorController.test.ts`
- `src/test/L1.findingCommandTarget.test.ts`
- `src/test/L1.findingInspectorLifecycle.test.ts`
- `src/test/L1.packageContributions.test.ts`

Modify:

- `package.json`: add inspector view, replace command contribution, add menus for inspector title and finding leaf context.
- `src/constants/commands.ts`: replace `OPEN_BUG_LOCATION` with split command constants.
- `src/commands/navigation.ts`: rename source-only behavior to `revealFindingSource`.
- `src/extension.ts`: register inspector provider, tree selection controller, split commands, and lifecycle clearing/reconciliation.
- `src/ui/findingTreeItem.ts`: remove `TreeItem.command` from finding leaves.
- `src/services/spotbugsDiagnosticCodeActionProvider.ts`: move quick fix to `spotbugs.openFindingDetails`.
- `src/test/helpers/mockVscode.ts`: add VS Code API mocks needed by new unit tests.
- `src/test/L1.diagnosticsRuleDocs.vscode.test.ts`: expect quick fix command split.
- `src/test/L1.extension.vscode.test.ts`: expect new command ids and absence of `spotbugs.openBugLocation`.

Do not modify:

- `src/lsp/spotbugsClient.ts`
- `src/lsp/javaLsGateway.ts`
- `server/com.spotbugs.runner.jar`
- JDT LS delegate command protocol

## Task 1: Rule Summary Extraction Utility

**Files:**
- Create: `src/ui/findingPreview.ts`
- Create: `src/test/L0.findingPreview.test.ts`
- Modify: none

- [ ] **Step 1: Write failing rule-summary tests**

Create `src/test/L0.findingPreview.test.ts`:

```ts
import * as assert from 'assert';
import { extractFindingRuleSummary } from '../ui/findingPreview';
import { Finding } from '../model/finding';

describe('findingPreview', () => {
  it('extracts the first prose paragraph from detail html without example content', () => {
    const summary = extractFindingRuleSummary(
      makeFinding({
        detailHtml:
          '<p onclick="bad()">This <a href="https://example.test">link text</a> explains the rule.</p><pre>bad();</pre><ul><li>Example detail</li></ul><p>Later documentation.</p><script>alert(1)</script>',
      })
    );

    assert.strictEqual(summary, 'This link text explains the rule.');
  });

  it('does not concatenate multiple html blocks into a compact full-details copy', () => {
    const summary = extractFindingRuleSummary(
      makeFinding({
        detailHtml:
          '<p>First summary paragraph.</p><p>Second detail paragraph.</p><blockquote>Recommendation details.</blockquote>',
      })
    );

    assert.strictEqual(summary, 'First summary paragraph.');
  });

  it('falls back to the first longDescription paragraph when html has no usable prose', () => {
    const summary = extractFindingRuleSummary(
      makeFinding({
        detailHtml: '<script>alert(1)</script><pre>bad();</pre>',
        longDescription: '  Plain fallback summary. \\n\\n Full explanation follows. ',
      })
    );

    assert.strictEqual(summary, 'Plain fallback summary.');
  });

  it('uses a safety cap only after structural summary extraction', () => {
    const longText = Array.from({ length: 90 }, (_, index) => `word${index}`).join(' ');
    const summary = extractFindingRuleSummary(
      makeFinding({ detailHtml: `<p>${longText}</p><p>Second paragraph.</p>` })
    );

    assert.ok(summary.length <= 423, `summary was ${summary.length} chars`);
    assert.ok(summary.endsWith('...'));
    assert.ok(!summary.includes('word89'));
    assert.ok(!summary.includes('Second paragraph'));
  });

  it('returns undefined when no rule summary text is available', () => {
    assert.strictEqual(extractFindingRuleSummary(makeFinding({})), undefined);
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
```

- [ ] **Step 2: Run rule-summary tests and verify they fail**

Run:

```bash
npm run compile && npx mocha "out/test/L0.findingPreview.test.js"
```

Expected: compile fails because `src/ui/findingPreview.ts` does not exist or `extractFindingRuleSummary` is not exported.

- [ ] **Step 3: Implement rule-summary extraction**

Create `src/ui/findingPreview.ts`:

```ts
import * as sanitizeHtml from 'sanitize-html';
import { Finding } from '../model/finding';
import { sanitizeFindingDetailHtml } from './findingDescriptionRenderer';

const SUMMARY_HARD_CAP = 420;
const SUMMARY_MIN_SENTENCE_LENGTH = 160;
const PROSE_PARAGRAPH_PATTERN = /<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi;

export function extractFindingRuleSummary(finding: Finding): string | undefined {
  const detailHtml = finding.detailHtml?.trim();
  if (detailHtml) {
    const sanitized = sanitizeFindingDetailHtml(detailHtml, finding.type);
    const text = extractFirstProseParagraph(sanitized);
    if (text) {
      return truncateSummary(text);
    }
  }

  const fallback = extractFirstPlainTextParagraph(finding.longDescription ?? '');
  if (fallback) {
    return truncateSummary(fallback);
  }

  return undefined;
}

function extractFirstProseParagraph(html: string): string | undefined {
  let match: RegExpExecArray | null;
  PROSE_PARAGRAPH_PATTERN.lastIndex = 0;

  while ((match = PROSE_PARAGRAPH_PATTERN.exec(html)) !== null) {
    const text = normalizeSummaryText(htmlToPlainText(match[1]));
    if (text) {
      return text;
    }
  }

  return undefined;
}

function extractFirstPlainTextParagraph(value: string): string | undefined {
  for (const paragraph of value.split(/\n\s*\n/)) {
    const text = normalizeSummaryText(paragraph);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function htmlToPlainText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });
}

function normalizeSummaryText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateSummary(value: string): string {
  if (value.length <= SUMMARY_HARD_CAP) {
    return value;
  }

  const sentenceCut = findSentenceBoundary(value);
  if (sentenceCut !== undefined) {
    return `${value.slice(0, sentenceCut).trim()}...`;
  }

  const wordCut = value.lastIndexOf(' ', SUMMARY_HARD_CAP);
  const cut = wordCut > 0 ? wordCut : SUMMARY_HARD_CAP;
  return `${value.slice(0, cut).trim()}...`;
}

function findSentenceBoundary(value: string): number | undefined {
  const max = Math.min(SUMMARY_HARD_CAP, value.length);
  for (let index = max - 1; index >= SUMMARY_MIN_SENTENCE_LENGTH; index -= 1) {
    if (/[.!?]/.test(value[index])) {
      return index + 1;
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Run rule-summary tests and verify they pass**

Run:

```bash
npm run compile && npx mocha "out/test/L0.findingPreview.test.js"
```

Expected: all `findingPreview` tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/ui/findingPreview.ts src/test/L0.findingPreview.test.ts
git commit -m "test: add finding rule summary extraction"
```

## Task 2: Command Split and Tree Leaf Click Removal

**Files:**
- Modify: `src/constants/commands.ts`
- Modify: `src/commands/navigation.ts`
- Modify: `src/ui/findingTreeItem.ts`
- Modify: `src/services/spotbugsDiagnosticCodeActionProvider.ts`
- Create: `src/test/L1.findingTreeItem.test.ts`
- Modify: `src/test/L1.diagnosticsRuleDocs.vscode.test.ts`
- Modify: `src/test/L1.extension.vscode.test.ts`
- Modify: `src/test/helpers/mockVscode.ts`

- [ ] **Step 1: Extend VS Code mock for tree item unit tests**

Modify `src/test/helpers/mockVscode.ts` by adding these classes near `MockUri` and returning them from `createVscodeMock`:

```ts
class MockThemeIcon {
  constructor(public readonly id: string) {}
}

class MockTreeItem {
  public description?: string;
  public tooltip?: string;
  public iconPath?: unknown;
  public contextValue?: string;
  public command?: unknown;

  constructor(
    public readonly label: string,
    public readonly collapsibleState?: number
  ) {}
}

const MockTreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};
```

Add these fields to the `VscodeMock` type:

```ts
TreeItem: typeof MockTreeItem;
TreeItemCollapsibleState: typeof MockTreeItemCollapsibleState;
ThemeIcon: typeof MockThemeIcon;
```

Add these values to the object returned by `createVscodeMock`:

```ts
TreeItem: MockTreeItem,
TreeItemCollapsibleState: MockTreeItemCollapsibleState,
ThemeIcon: MockThemeIcon,
```

- [ ] **Step 2: Write failing tree item test**

Create `src/test/L1.findingTreeItem.test.ts`:

```ts
import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();

describe('findingTreeItem', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('does not attach a primary click command to finding leaves', async () => {
    const { FindingItem } = await import('../ui/findingTreeItem');
    const item = new FindingItem({
      patternId: 'NP_ALWAYS_NULL',
      type: 'NP_ALWAYS_NULL',
      abbrev: 'NP',
      message: 'Null pointer',
      location: {
        fullPath: '/tmp/Example.java',
        startLine: 10,
      },
    });

    assert.strictEqual(item.contextValue, 'spotbugs.bug');
    assert.strictEqual(item.command, undefined);
  });
});
```

- [ ] **Step 3: Update command expectation tests before implementation**

In `src/test/L1.diagnosticsRuleDocs.vscode.test.ts`, change the quick fix assertion:

```ts
assert.strictEqual(actions[0].command?.command, SpotBugsCommands.OPEN_FINDING_DETAILS);
```

In `src/test/L1.extension.vscode.test.ts`, change expected commands:

```ts
const expected = [
  SpotBugsCommands.RUN_ANALYSIS,
  SpotBugsCommands.RUN_WORKSPACE,
  SpotBugsCommands.REVEAL_FINDING_SOURCE,
  SpotBugsCommands.OPEN_FINDING_DETAILS,
  SpotBugsCommands.FILTER_RESULTS,
  SpotBugsCommands.EXPORT_SARIF,
  SpotBugsCommands.RESET_RESULTS,
];
```

Also add:

```ts
assert.ok(
  !registered.includes('spotbugs.openBugLocation'),
  'Legacy command should not be registered: spotbugs.openBugLocation'
);
```

- [ ] **Step 4: Run command/tree tests and verify they fail**

Run:

```bash
npm run compile && npx mocha "out/test/L1.findingTreeItem.test.js"
```

Expected: fails because `FindingItem` still has a command or because command constants have not been renamed.

Run:

```bash
npm run test:vscode
```

Expected: fails because tests expect split commands that are not registered yet.

- [ ] **Step 5: Replace command constants**

Modify `src/constants/commands.ts`:

```ts
export namespace JavaLanguageServerCommands {
  export const EXECUTE_WORKSPACE_COMMAND: string = 'java.execute.workspaceCommand';
  // vscode-java standardLanguageClient commands, true is full compile, false is incremental compile
  export const BUILD_WORKSPACE: string = 'java.project.build';
  export const GET_CLASSPATHS: string = 'java.project.getClasspaths';
  export const GET_ALL_JAVA_PROJECTS: string = 'java.project.getAll';
}

// VS Code command IDs owned by this extension (used in menus/UI)
export namespace SpotBugsCommands {
  export const RUN_ANALYSIS: string = 'spotbugs.run';
  export const RUN_WORKSPACE: string = 'spotbugs.runWorkspace';
  export const REVEAL_FINDING_SOURCE: string = 'spotbugs.revealFindingSource';
  export const OPEN_FINDING_DETAILS: string = 'spotbugs.openFindingDetails';
  export const FILTER_RESULTS: string = 'spotbugs.filterResults';
  export const EXPORT_SARIF: string = 'spotbugs.exportSarif';
  export const RESET_RESULTS: string = 'spotbugs.resetResults';
}

// Java Language Server delegate command IDs (handled by the JDT LS plugin)
export namespace SpotBugsLSCommands {
  export const RUN_ANALYSIS: string = 'java.spotbugs.run';
}
```

- [ ] **Step 6: Rename source navigation function**

Modify `src/commands/navigation.ts` by renaming `openBugLocation` to `revealFindingSource`. Keep the source navigation behavior unchanged:

```ts
export async function revealFindingSource(finding: Finding): Promise<void> {
  try {
    Logger.log(`Revealing finding source: ${finding.message ?? 'SpotBugs finding'}`);
    const notifier = defaultNotifier;

    const filePath = await resolveFindingFilePath(finding);

    if (!filePath) {
      const errorMsg = `Cannot open file: Could not resolve path for ${finding.location.realSourcePath || 'unknown file'}`;
      Logger.error(errorMsg);
      notifier.error(errorMsg);
      return;
    }

    const fileUri = Uri.file(filePath);

    const startLine = normalizeLineNumber(finding.location.startLine);
    const endLine = normalizeLineNumber(
      finding.location.endLine ?? finding.location.startLine
    );
    let range: Range | undefined;
    if (startLine !== undefined && endLine !== undefined) {
      const startLineZeroBased = Math.max(0, startLine - 1);
      const endLineZeroBased = Math.max(0, endLine - 1);
      range = new Range(
        new Position(startLineZeroBased, 0),
        new Position(endLineZeroBased, Number.MAX_SAFE_INTEGER)
      );
    }

    const options: TextDocumentShowOptions = {
      preserveFocus: false,
      preview: false,
    };
    if (range) {
      options.selection = range;
    }

    const lineInfo =
      startLine !== undefined ? ` at lines ${startLine}-${endLine ?? startLine}` : '';
    Logger.log(`Opening file: ${filePath}${lineInfo}`);
    await window.showTextDocument(fileUri, options);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error('Failed to reveal finding source', error);
    defaultNotifier.error(`Failed to open file: ${errorMessage}`);
  }
}
```

- [ ] **Step 7: Remove tree leaf primary click command**

Modify `src/ui/findingTreeItem.ts`:

```ts
import { TreeItem, TreeItemCollapsibleState, ThemeIcon } from 'vscode';
import { Finding } from '../model/finding';
import { toFindingItemView } from './findingViewModel';
```

Remove this block from `FindingItem`:

```ts
this.command = {
  command: SpotBugsCommands.OPEN_BUG_LOCATION,
  title: 'Open Bug Location',
  arguments: [finding],
};
```

- [ ] **Step 8: Move diagnostic quick fix to details command**

Modify `src/services/spotbugsDiagnosticCodeActionProvider.ts`:

```ts
detailAction.command = {
  command: SpotBugsCommands.OPEN_FINDING_DETAILS,
  title: SHOW_LOCAL_DETAILS_TITLE,
  arguments: [finding],
};
```

- [ ] **Step 9: Update extension imports and explicit command handlers**

In `src/extension.ts`, replace the navigation import:

```ts
import { revealFindingSource } from './commands/navigation';
```

Replace the legacy command registration with two registrations:

```ts
instrumentOperationAsVsCodeCommand(
  SpotBugsCommands.REVEAL_FINDING_SOURCE,
  async (bug) => {
    if (!isFindingPayload(bug)) {
      return;
    }
    await revealFindingSource(bug);
  }
),

instrumentOperationAsVsCodeCommand(
  SpotBugsCommands.OPEN_FINDING_DETAILS,
  async (bug) => {
    if (!isFindingPayload(bug)) {
      return;
    }
    findingDescriptionPanel.show(bug);
  }
),
```

- [ ] **Step 10: Run tests and verify Task 2 passes**

Run:

```bash
npm run compile && npx mocha "out/test/L1.findingTreeItem.test.js"
npm run test:vscode
```

Expected: `findingTreeItem` unit test passes. VS Code tests pass for command registration and diagnostic quick fix.

- [ ] **Step 11: Commit Task 2**

```bash
git add src/constants/commands.ts src/commands/navigation.ts src/ui/findingTreeItem.ts src/services/spotbugsDiagnosticCodeActionProvider.ts src/test/helpers/mockVscode.ts src/test/L1.findingTreeItem.test.ts src/test/L1.diagnosticsRuleDocs.vscode.test.ts src/test/L1.extension.vscode.test.ts src/extension.ts
git commit -m "feat: split finding navigation commands"
```

## Task 3: Package Contributions and Menu Contracts

**Files:**
- Modify: `package.json`
- Create: `src/test/L1.packageContributions.test.ts`

- [ ] **Step 1: Write package contribution regression tests**

Create `src/test/L1.packageContributions.test.ts`:

```ts
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

type PackageJson = {
  contributes: {
    views: Record<string, Array<{ id: string; name: string; type?: string }>>;
    commands: Array<{ command: string; title: string; icon?: string }>;
    menus: Record<string, Array<{ command?: string; when?: string; group?: string }>>;
  };
};

describe('package contributions', () => {
  const manifest = readPackageJson();

  it('contributes the results tree and inspector views', () => {
    const views = manifest.contributes.views['spotbugs-container'];
    assert.ok(views.some((view) => view.id === 'spotbugs-view'));
    const inspector = views.find((view) => view.id === 'spotbugs-inspector-view');
    assert.ok(inspector);
    assert.strictEqual(inspector.type, 'webview');
  });

  it('contributes split finding commands and removes openBugLocation', () => {
    const commands = manifest.contributes.commands.map((entry) => entry.command);

    assert.ok(commands.includes('spotbugs.revealFindingSource'));
    assert.ok(commands.includes('spotbugs.openFindingDetails'));
    assert.ok(!commands.includes('spotbugs.openBugLocation'));
  });

  it('adds finding leaf context fallbacks for source and details', () => {
    const itemMenus = manifest.contributes.menus['view/item/context'];

    assert.ok(
      itemMenus.some(
        (entry) =>
          entry.command === 'spotbugs.revealFindingSource' &&
          entry.when === 'view == spotbugs-view && viewItem == spotbugs.bug'
      )
    );
    assert.ok(
      itemMenus.some(
        (entry) =>
          entry.command === 'spotbugs.openFindingDetails' &&
          entry.when === 'view == spotbugs-view && viewItem == spotbugs.bug'
      )
    );
  });

  it('keeps category and pattern scoped export', () => {
    const itemMenus = manifest.contributes.menus['view/item/context'];

    assert.ok(
      itemMenus.some(
        (entry) =>
          entry.command === 'spotbugs.exportSarif' &&
          entry.when ===
            'view == spotbugs-view && (viewItem == spotbugs.category || viewItem == spotbugs.pattern)'
      )
    );
  });

  it('duplicates top-level actions on the inspector title with overflow groups', () => {
    const titleMenus = manifest.contributes.menus['view/title'];
    const inspectorMenus = titleMenus.filter(
      (entry) => entry.when === 'view == spotbugs-inspector-view'
    );

    assert.deepStrictEqual(
      inspectorMenus.map((entry) => entry.command),
      [
        'spotbugs.runWorkspace',
        'spotbugs.exportSarif',
        'spotbugs.filterResults',
        'spotbugs.resetResults',
      ]
    );
    assert.strictEqual(inspectorMenus[0].group, 'navigation');
    assert.ok(inspectorMenus.slice(1).every((entry) => !entry.group?.startsWith('navigation')));
  });
});

function readPackageJson(): PackageJson {
  const manifestPath = path.resolve(__dirname, '../../package.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PackageJson;
}
```

- [ ] **Step 2: Run package contribution test and verify it fails**

Run:

```bash
npm run compile && npx mocha "out/test/L1.packageContributions.test.js"
```

Expected: fails because the inspector view and split command contributions do not exist yet.

- [ ] **Step 3: Update `package.json` views**

Change `contributes.views["spotbugs-container"]` to:

```json
[
  {
    "id": "spotbugs-view",
    "name": "SpotBugs"
  },
  {
    "id": "spotbugs-inspector-view",
    "name": "Inspector",
    "type": "webview"
  }
]
```

- [ ] **Step 4: Update `package.json` command contributions**

Replace the `spotbugs.openBugLocation` contribution with:

```json
{
  "command": "spotbugs.revealFindingSource",
  "title": "SpotBugs: Go to Code",
  "icon": "$(go-to-file)"
},
{
  "command": "spotbugs.openFindingDetails",
  "title": "SpotBugs: Open Finding Details",
  "icon": "$(open-preview)"
}
```

Update shared toolbar command titles:

```json
{
  "command": "spotbugs.runWorkspace",
  "title": "Analyze SpotBugs Workspace",
  "icon": "$(search)"
},
{
  "command": "spotbugs.filterResults",
  "title": "Filter SpotBugs Results",
  "icon": "$(filter)"
},
{
  "command": "spotbugs.exportSarif",
  "title": "Export SpotBugs Results (SARIF)",
  "icon": "$(file-code)"
},
{
  "command": "spotbugs.resetResults",
  "title": "Reset SpotBugs Results",
  "icon": "$(trash)"
}
```

- [ ] **Step 5: Update `package.json` menus**

Keep existing `spotbugs-view` title menus. Add inspector title menus:

```json
{
  "command": "spotbugs.runWorkspace",
  "when": "view == spotbugs-inspector-view",
  "group": "navigation"
},
{
  "command": "spotbugs.exportSarif",
  "when": "view == spotbugs-inspector-view",
  "group": "2_spotbugs@1"
},
{
  "command": "spotbugs.filterResults",
  "when": "view == spotbugs-inspector-view",
  "group": "2_spotbugs@2"
},
{
  "command": "spotbugs.resetResults",
  "when": "view == spotbugs-inspector-view",
  "group": "2_spotbugs@3"
}
```

Add finding leaf context actions before the existing category/pattern export entry:

```json
{
  "command": "spotbugs.revealFindingSource",
  "when": "view == spotbugs-view && viewItem == spotbugs.bug",
  "group": "navigation@1"
},
{
  "command": "spotbugs.openFindingDetails",
  "when": "view == spotbugs-view && viewItem == spotbugs.bug",
  "group": "navigation@2"
}
```

- [ ] **Step 6: Run package contribution test and verify it passes**

Run:

```bash
npm run compile && npx mocha "out/test/L1.packageContributions.test.js"
```

Expected: all package contribution tests pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add package.json src/test/L1.packageContributions.test.ts
git commit -m "feat: contribute SpotBugs inspector view"
```

## Task 4: Inspector State Model and Command Target Resolution

**Files:**
- Create: `src/ui/findingInspectorState.ts`
- Create: `src/commands/findingCommandTarget.ts`
- Create: `src/test/L0.findingInspectorState.test.ts`
- Create: `src/test/L1.findingCommandTarget.test.ts`
- Modify: `src/test/helpers/mockVscode.ts`

- [ ] **Step 1: Extend VS Code mock for EventEmitter and information messages**

Add a mock event emitter to `src/test/helpers/mockVscode.ts`:

```ts
type Listener<T> = (event: T) => unknown;

class MockEventEmitter<T> {
  private listeners: Listener<T>[] = [];

  readonly event = (listener: Listener<T>) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((candidate) => candidate !== listener);
      },
    };
  };

  fire(event: T): void {
    for (const listener of this.listeners.slice()) {
      listener(event);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}
```

Add `EventEmitter: typeof MockEventEmitter` to the mock type and returned object. Add `showInformationMessage` to `window`:

```ts
showInformationMessage: (message: string) => Promise<string | undefined>;
```

Default implementation:

```ts
showInformationMessage:
  overrides.window?.showInformationMessage ?? (async () => undefined),
```

- [ ] **Step 2: Write failing inspector state tests**

Create `src/test/L0.findingInspectorState.test.ts`:

```ts
import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import { Finding } from '../model/finding';

installVscodeMock();

describe('findingInspectorState', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('selects, retains, clears, and emits snapshots', async () => {
    const { FindingInspectorState } = await import('../ui/findingInspectorState');
    const finding = makeFinding('NP_ALWAYS_NULL');
    const state = new FindingInspectorState();
    const statuses: string[] = [];

    state.onDidChange((snapshot) => statuses.push(snapshot.status));
    state.select(finding);
    state.retainCurrent();
    state.clear();

    assert.deepStrictEqual(statuses, ['selected', 'retained', 'empty']);
    assert.strictEqual(state.current.status, 'empty');
  });

  it('keeps visible selected findings after filter reconciliation', async () => {
    const { FindingInspectorState } = await import('../ui/findingInspectorState');
    const finding = makeFinding('NP_ALWAYS_NULL');
    const state = new FindingInspectorState();

    state.select(finding);
    state.reconcileVisibleFindings([finding]);

    assert.strictEqual(state.current.status, 'selected');
    assert.strictEqual(state.current.finding, finding);
  });

  it('clears inspected finding when filter reconciliation removes it', async () => {
    const { FindingInspectorState } = await import('../ui/findingInspectorState');
    const state = new FindingInspectorState();

    state.select(makeFinding('NP_ALWAYS_NULL'));
    state.reconcileVisibleFindings([makeFinding('URF_UNREAD_FIELD')]);

    assert.strictEqual(state.current.status, 'empty');
  });
});

function makeFinding(patternId: string): Finding {
  return {
    patternId,
    type: patternId,
    abbrev: patternId.split('_')[0],
    message: patternId,
    instanceHash: `${patternId}-hash`,
    location: {
      fullPath: `/tmp/${patternId}.java`,
      startLine: 12,
      endLine: 12,
    },
  };
}
```

- [ ] **Step 3: Implement inspector state**

Create `src/ui/findingInspectorState.ts`:

```ts
import { Disposable, Event, EventEmitter } from 'vscode';
import { Finding } from '../model/finding';

export type FindingInspectorStatus = 'empty' | 'selected' | 'retained';

export type FindingInspectorSnapshot =
  | { status: 'empty'; finding?: undefined }
  | { status: 'selected'; finding: Finding }
  | { status: 'retained'; finding: Finding };

export class FindingInspectorState implements Disposable {
  private readonly onDidChangeEmitter = new EventEmitter<FindingInspectorSnapshot>();
  readonly onDidChange: Event<FindingInspectorSnapshot> = this.onDidChangeEmitter.event;

  private snapshot: FindingInspectorSnapshot = { status: 'empty' };

  get current(): FindingInspectorSnapshot {
    return this.snapshot;
  }

  select(finding: Finding): void {
    this.set({ status: 'selected', finding });
  }

  retainCurrent(): void {
    if (this.snapshot.status === 'empty' || this.snapshot.status === 'retained') {
      return;
    }
    this.set({ status: 'retained', finding: this.snapshot.finding });
  }

  clear(): void {
    if (this.snapshot.status === 'empty') {
      return;
    }
    this.set({ status: 'empty' });
  }

  reconcileVisibleFindings(visibleFindings: readonly Finding[]): void {
    if (this.snapshot.status === 'empty') {
      return;
    }
    const current = this.snapshot.finding;
    if (visibleFindings.some((candidate) => isSameFinding(candidate, current))) {
      return;
    }
    this.clear();
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  private set(snapshot: FindingInspectorSnapshot): void {
    this.snapshot = snapshot;
    this.onDidChangeEmitter.fire(snapshot);
  }
}

function isSameFinding(left: Finding, right: Finding): boolean {
  if (left === right) {
    return true;
  }
  if (left.instanceHash && right.instanceHash) {
    return left.instanceHash === right.instanceHash;
  }

  return (
    left.patternId === right.patternId &&
    left.location.fullPath === right.location.fullPath &&
    left.location.realSourcePath === right.location.realSourcePath &&
    left.location.sourceFile === right.location.sourceFile &&
    left.location.startLine === right.location.startLine &&
    left.location.endLine === right.location.endLine &&
    left.className === right.className &&
    left.methodName === right.methodName &&
    left.fieldName === right.fieldName
  );
}
```

- [ ] **Step 4: Write failing command target tests**

Create `src/test/L1.findingCommandTarget.test.ts`:

```ts
import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import { Finding } from '../model/finding';

installVscodeMock();

describe('findingCommandTarget', () => {
  it('uses explicit finding payload without user messaging', async () => {
    const messages: string[] = [];
    resetVscodeMock({
      window: {
        showInformationMessage: async (message: string) => {
          messages.push(message);
          return undefined;
        },
      } as never,
    });
    const { FindingInspectorState } = await import('../ui/findingInspectorState');
    const { resolveFindingCommandTarget } = await import('../commands/findingCommandTarget');
    const explicit = makeFinding('NP_ALWAYS_NULL');
    const state = new FindingInspectorState();

    const target = await resolveFindingCommandTarget(explicit, state, 'open details');

    assert.strictEqual(target, explicit);
    assert.deepStrictEqual(messages, []);
  });

  it('uses a FindingItem-style payload as the explicit target', async () => {
    const messages: string[] = [];
    resetVscodeMock({
      window: {
        showInformationMessage: async (message: string) => {
          messages.push(message);
          return undefined;
        },
      } as never,
    });
    const { FindingInspectorState } = await import('../ui/findingInspectorState');
    const { resolveFindingCommandTarget } = await import('../commands/findingCommandTarget');
    const finding = makeFinding('NP_ALWAYS_NULL');
    const state = new FindingInspectorState();

    const target = await resolveFindingCommandTarget(
      { finding },
      state,
      'open details'
    );

    assert.strictEqual(target, finding);
    assert.deepStrictEqual(messages, []);
  });

  it('uses retained inspected finding and explains the target', async () => {
    const messages: string[] = [];
    resetVscodeMock({
      window: {
        showInformationMessage: async (message: string) => {
          messages.push(message);
          return undefined;
        },
      } as never,
    });
    const { FindingInspectorState } = await import('../ui/findingInspectorState');
    const { resolveFindingCommandTarget } = await import('../commands/findingCommandTarget');
    const finding = makeFinding('NP_ALWAYS_NULL');
    const state = new FindingInspectorState();
    state.select(finding);
    state.retainCurrent();

    const target = await resolveFindingCommandTarget(undefined, state, 'open details');

    assert.strictEqual(target, finding);
    assert.ok(messages.some((message) => message.includes('Last inspected finding')));
  });

  it('shows a message and returns undefined when no finding is available', async () => {
    const messages: string[] = [];
    resetVscodeMock({
      window: {
        showInformationMessage: async (message: string) => {
          messages.push(message);
          return undefined;
        },
      } as never,
    });
    const { FindingInspectorState } = await import('../ui/findingInspectorState');
    const { resolveFindingCommandTarget } = await import('../commands/findingCommandTarget');
    const state = new FindingInspectorState();

    const target = await resolveFindingCommandTarget(undefined, state, 'go to code');

    assert.strictEqual(target, undefined);
    assert.ok(messages.some((message) => message.includes('No SpotBugs finding')));
  });
});

function makeFinding(patternId: string): Finding {
  return {
    patternId,
    type: patternId,
    message: patternId,
    location: {
      fullPath: `/tmp/${patternId}.java`,
      startLine: 1,
    },
  };
}
```

- [ ] **Step 5: Implement command target resolution**

Create `src/commands/findingCommandTarget.ts`:

```ts
import { window } from 'vscode';
import { Finding } from '../model/finding';
import { FindingInspectorState } from '../ui/findingInspectorState';

export async function resolveFindingCommandTarget(
  value: unknown,
  state: FindingInspectorState,
  actionLabel: string
): Promise<Finding | undefined> {
  const explicit = getExplicitFinding(value);
  if (explicit) {
    return explicit;
  }

  const snapshot = state.current;
  if (snapshot.status !== 'empty') {
    if (snapshot.status === 'retained') {
      await window.showInformationMessage(
        `SpotBugs: ${actionLabel} uses the Last inspected finding (${snapshot.finding.patternId}).`
      );
    }
    return snapshot.finding;
  }

  await window.showInformationMessage('No SpotBugs finding is currently selected.');
  return undefined;
}

export function isFindingPayload(value: unknown): value is Finding {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { patternId?: unknown; location?: unknown };
  return (
    typeof candidate.patternId === 'string' &&
    candidate.location !== null &&
    typeof candidate.location === 'object'
  );
}

function getExplicitFinding(value: unknown): Finding | undefined {
  if (isFindingPayload(value)) {
    return value;
  }
  if (value !== null && typeof value === 'object' && 'finding' in value) {
    const nested = (value as { finding?: unknown }).finding;
    if (isFindingPayload(nested)) {
      return nested;
    }
  }
  return undefined;
}
```

- [ ] **Step 6: Run Task 4 tests**

Run:

```bash
npm run compile && npx mocha "out/test/L0.findingInspectorState.test.js" "out/test/L1.findingCommandTarget.test.js"
```

Expected: all Task 4 tests pass.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/ui/findingInspectorState.ts src/commands/findingCommandTarget.ts src/test/L0.findingInspectorState.test.ts src/test/L1.findingCommandTarget.test.ts src/test/helpers/mockVscode.ts
git commit -m "feat: add finding inspector state"
```

## Task 5: Inspector Renderer and Webview Provider

**Files:**
- Create: `src/ui/findingInspectorRenderer.ts`
- Create: `src/ui/findingInspectorViewProvider.ts`
- Create: `src/test/L0.findingInspectorRenderer.test.ts`
- Create: `src/test/L1.findingInspectorViewProvider.test.ts`
- Modify: `src/test/helpers/mockVscode.ts`

- [ ] **Step 1: Write failing renderer tests**

Create `src/test/L0.findingInspectorRenderer.test.ts`:

```ts
import * as assert from 'assert';
import { renderFindingInspectorHtml } from '../ui/findingInspectorRenderer';
import { FindingInspectorSnapshot } from '../ui/findingInspectorState';

describe('findingInspectorRenderer', () => {
  it('renders empty state', () => {
    const html = renderFindingInspectorHtml({ status: 'empty' }, 'nonce-1');

    assert.ok(html.includes('Select a finding to inspect it.'));
    assert.ok(!html.includes('data-command="openDetails"'));
  });

  it('renders selected finding details and actions', () => {
    const html = renderFindingInspectorHtml(makeSnapshot('selected'), 'nonce-1');

    assert.ok(html.includes('Selected finding'));
    assert.ok(html.includes('class="severity"'));
    assert.ok(html.includes('NP_ALWAYS_NULL'));
    assert.ok(html.includes('data-command="revealSource"'));
    assert.ok(html.includes('data-command="openDetails"'));
    assert.ok(html.includes('data-command="copyRuleId"'));
    assert.ok(html.includes('Rule summary'));
    assert.ok(html.includes('Local rule summary.'));
  });

  it('renders retained finding label', () => {
    const html = renderFindingInspectorHtml(makeSnapshot('retained'), 'nonce-1');

    assert.ok(html.includes('Last inspected finding'));
  });
});

function makeSnapshot(status: 'selected' | 'retained'): FindingInspectorSnapshot {
  return {
    status,
    finding: {
      patternId: 'NP_ALWAYS_NULL',
      type: 'NP_ALWAYS_NULL',
      abbrev: 'NP',
      category: 'CORRECTNESS',
      priority: 'High',
      rank: 3,
      cweId: 476,
      shortDescription: 'Null pointer dereference',
      detailHtml: '<p>Local rule summary.</p><p>Full details paragraph.</p>',
      helpUri: 'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html#NP_ALWAYS_NULL',
      className: 'com.acme.Example',
      methodName: 'run',
      location: {
        fullPath: '/tmp/Example.java',
        startLine: 12,
        endLine: 14,
      },
    },
  };
}
```

- [ ] **Step 2: Run renderer tests and verify they fail**

Run:

```bash
npm run compile && npx mocha "out/test/L0.findingInspectorRenderer.test.js"
```

Expected: compile fails because `src/ui/findingInspectorRenderer.ts` does not exist or `renderFindingInspectorHtml` is not exported.

- [ ] **Step 3: Implement renderer**

Create `src/ui/findingInspectorRenderer.ts`. Use this structure and keep all user text escaped:

```ts
import { formatFindingSummary } from '../formatters/findingFormatting';
import { Finding } from '../model/finding';
import { FindingInspectorSnapshot } from './findingInspectorState';
import { extractFindingRuleSummary } from './findingPreview';
import { getFindingDescriptionTitle } from './findingDescriptionRenderer';

export function renderFindingInspectorHtml(
  snapshot: FindingInspectorSnapshot,
  nonce: string
): string {
  const body =
    snapshot.status === 'empty'
      ? renderEmptyState()
      : renderFinding(snapshot.finding, snapshot.status);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${escapeAttribute(nonce)}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.4;
    }
    .state {
      margin-bottom: 6px;
      color: var(--vscode-descriptionForeground);
      font-size: 0.86em;
      text-transform: uppercase;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 1em;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    dl {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 4px 8px;
      margin: 10px 0;
    }
    dt { color: var(--vscode-descriptionForeground); }
    dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .path { word-break: break-all; }
    .rule-summary {
      display: -webkit-box;
      -webkit-line-clamp: 6;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin: 10px 0;
      color: var(--vscode-foreground);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 0;
      padding: 4px 8px;
      cursor: pointer;
    }
    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    .empty {
      color: var(--vscode-descriptionForeground);
    }
  </style>
  <title>SpotBugs Inspector</title>
</head>
<body>
  ${body}
  <script nonce="${escapeAttribute(nonce)}">
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-command]');
      if (!target) {
        return;
      }
      vscode.postMessage({ type: target.getAttribute('data-command') });
    });
  </script>
</body>
</html>`;
}

function renderEmptyState(): string {
  return '<p class="empty">Select a finding to inspect it.</p>';
}

function renderFinding(
  finding: Finding,
  status: 'selected' | 'retained'
): string {
  const title = getFindingDescriptionTitle(finding);
  const stateLabel = status === 'retained' ? 'Last inspected finding' : 'Selected finding';
  const severity = formatSeverityLabel(finding);
  const ruleSummary =
    extractFindingRuleSummary(finding) ??
    'Open details for the full rule explanation.';
  const location = formatLocation(finding);

  return `<section>
    <div class="state">${escapeHtml(stateLabel)}</div>
    <h2 title="${escapeAttribute(title)}"><span class="severity" aria-label="${escapeAttribute(severity)}">!</span> ${escapeHtml(title)}</h2>
    <p title="${escapeAttribute(formatFindingSummary(finding))}">${escapeHtml(formatFindingSummary(finding))}</p>
    <dl>
      <dt>Pattern</dt><dd>${escapeHtml(finding.patternId)}</dd>
      ${finding.category ? `<dt>Category</dt><dd>${escapeHtml(finding.category)}</dd>` : ''}
      ${finding.priority ? `<dt>Priority</dt><dd>${escapeHtml(finding.priority)}</dd>` : ''}
      ${typeof finding.rank === 'number' ? `<dt>Rank</dt><dd>${String(finding.rank)}</dd>` : ''}
      ${typeof finding.cweId === 'number' ? `<dt>CWE</dt><dd>${String(finding.cweId)}</dd>` : ''}
      <dt>Location</dt><dd class="path" title="${escapeAttribute(location)}">${escapeHtml(location)}</dd>
      ${finding.methodName ? `<dt>Method</dt><dd title="${escapeAttribute(finding.methodName)}">${escapeHtml(finding.methodName)}</dd>` : ''}
      ${finding.fieldName ? `<dt>Field</dt><dd title="${escapeAttribute(finding.fieldName)}">${escapeHtml(finding.fieldName)}</dd>` : ''}
    </dl>
    <h3>Rule summary</h3>
    <div class="rule-summary">${escapeHtml(ruleSummary)}</div>
    <div class="actions">
      <button data-command="revealSource">Go to code</button>
      <button data-command="openDetails">Open details</button>
      <button class="secondary" data-command="copyRuleId">Copy rule id</button>
      ${finding.helpUri ? '<button class="secondary" data-command="openDocs">Open docs</button>' : ''}
    </div>
  </section>`;
}

function formatSeverityLabel(finding: Finding): string {
  if (finding.priority) {
    return `Priority ${finding.priority}`;
  }
  if (typeof finding.rank === 'number') {
    return `Rank ${finding.rank}`;
  }
  return 'SpotBugs finding';
}

function formatLocation(finding: Finding): string {
  const file =
    finding.location.realSourcePath ??
    finding.location.fullPath ??
    finding.location.sourceFile ??
    'Unknown source';
  const start = finding.location.startLine;
  const end = finding.location.endLine;
  if (typeof start !== 'number') {
    return file;
  }
  if (typeof end === 'number' && end !== start) {
    return `${file}:${start}-${end}`;
  }
  return `${file}:${start}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
```

- [ ] **Step 4: Run renderer tests**

Run:

```bash
npm run compile && npx mocha "out/test/L0.findingInspectorRenderer.test.js"
```

Expected: renderer tests pass.

- [ ] **Step 5: Extend VS Code mock for inspector provider imports**

Add `env`, `commands.executeCommand`, and `window.registerWebviewViewProvider` to `src/test/helpers/mockVscode.ts`.

```ts
env: {
  clipboard: {
    writeText: (value: string) => Promise<void>;
  };
};
```

Default implementation:

```ts
env: {
  clipboard: {
    writeText: overrides.env?.clipboard.writeText ?? (async () => undefined),
  },
},
```

Add `registerWebviewViewProvider` to `window` with a disposable return:

```ts
registerWebviewViewProvider:
  overrides.window?.registerWebviewViewProvider ??
  (() => ({ dispose: () => undefined })),
```

- [ ] **Step 6: Write failing provider behavior tests**

Create `src/test/L1.findingInspectorViewProvider.test.ts`:

```ts
import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import { Finding } from '../model/finding';

installVscodeMock();

describe('findingInspectorViewProvider', () => {
  it('copies finding.patternId for Copy rule id messages', async () => {
    const clipboardWrites: string[] = [];
    resetVscodeMock({
      env: {
        clipboard: {
          writeText: async (value: string) => {
            clipboardWrites.push(value);
          },
        },
      },
    } as never);
    const { FindingInspectorState } = await import('../ui/findingInspectorState');
    const { FindingInspectorViewProvider } = await import(
      '../ui/findingInspectorViewProvider'
    );
    const state = new FindingInspectorState();
    const provider = new FindingInspectorViewProvider(state);
    const webview = createWebview();

    provider.resolveWebviewView({ webview } as never);
    state.select(makeFinding());
    await webview.dispatch({ type: 'copyRuleId' });

    assert.deepStrictEqual(clipboardWrites, ['NP_ALWAYS_NULL']);
  });

  it('delegates source and details actions to split commands', async () => {
    const executed: Array<{ command: string; arg: unknown }> = [];
    resetVscodeMock({
      commands: {
        executeCommand: async (command: string, arg: unknown) => {
          executed.push({ command, arg });
          return undefined;
        },
      },
    } as never);
    const { SpotBugsCommands } = await import('../constants/commands');
    const { FindingInspectorState } = await import('../ui/findingInspectorState');
    const { FindingInspectorViewProvider } = await import(
      '../ui/findingInspectorViewProvider'
    );
    const finding = makeFinding();
    const state = new FindingInspectorState();
    const provider = new FindingInspectorViewProvider(state);
    const webview = createWebview();

    provider.resolveWebviewView({ webview } as never);
    state.select(finding);
    await webview.dispatch({ type: 'revealSource' });
    await webview.dispatch({ type: 'openDetails' });

    assert.deepStrictEqual(
      executed.map((entry) => entry.command),
      [SpotBugsCommands.REVEAL_FINDING_SOURCE, SpotBugsCommands.OPEN_FINDING_DETAILS]
    );
    assert.strictEqual(executed[0].arg, finding);
    assert.strictEqual(executed[1].arg, finding);
  });
});

function createWebview(): {
  html: string;
  options?: unknown;
  onDidReceiveMessage: (listener: (message: unknown) => unknown) => { dispose: () => void };
  dispatch: (message: unknown) => Promise<void>;
} {
  let listener: ((message: unknown) => unknown) | undefined;
  return {
    html: '',
    onDidReceiveMessage: (nextListener) => {
      listener = nextListener;
      return { dispose: () => undefined };
    },
    dispatch: async (message) => {
      await listener?.(message);
    },
  };
}

function makeFinding(): Finding {
  return {
    patternId: 'NP_ALWAYS_NULL',
    type: 'NP_ALWAYS_NULL',
    message: 'Null pointer',
    location: {
      fullPath: '/tmp/Example.java',
      startLine: 1,
    },
  };
}
```

- [ ] **Step 7: Run provider tests and verify they fail**

Run:

```bash
npm run compile && npx mocha "out/test/L1.findingInspectorViewProvider.test.js"
```

Expected: compile fails because `src/ui/findingInspectorViewProvider.ts` does not exist or `FindingInspectorViewProvider` is not exported.

- [ ] **Step 8: Implement WebviewView provider**

Create `src/ui/findingInspectorViewProvider.ts`:

```ts
import {
  Disposable,
  WebviewView,
  WebviewViewProvider,
  commands,
  env,
  window,
} from 'vscode';
import { SpotBugsCommands } from '../constants/commands';
import { getFindingRuleDocumentationUri } from '../services/spotbugsDiagnosticSupport';
import { FindingInspectorState } from './findingInspectorState';
import { renderFindingInspectorHtml } from './findingInspectorRenderer';

export const FINDING_INSPECTOR_VIEW_ID = 'spotbugs-inspector-view';

type InspectorMessage =
  | { type: 'revealSource' }
  | { type: 'openDetails' }
  | { type: 'copyRuleId' }
  | { type: 'openDocs' };

export class FindingInspectorViewProvider
  implements WebviewViewProvider, Disposable
{
  private view: WebviewView | undefined;
  private readonly subscriptions: Disposable[] = [];

  constructor(private readonly state: FindingInspectorState) {
    this.subscriptions.push(this.state.onDidChange(() => this.render()));
  }

  resolveWebviewView(webviewView: WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };
    this.subscriptions.push(
      webviewView.webview.onDidReceiveMessage((message: InspectorMessage) =>
        this.handleMessage(message)
      )
    );
    this.render();
  }

  dispose(): void {
    for (const subscription of this.subscriptions.splice(0)) {
      subscription.dispose();
    }
  }

  private render(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = renderFindingInspectorHtml(
      this.state.current,
      createNonce()
    );
  }

  private async handleMessage(message: InspectorMessage): Promise<void> {
    const finding = this.state.current.finding;
    if (!finding) {
      await window.showInformationMessage('No SpotBugs finding is currently selected.');
      return;
    }

    if (message.type === 'revealSource') {
      await commands.executeCommand(SpotBugsCommands.REVEAL_FINDING_SOURCE, finding);
      return;
    }
    if (message.type === 'openDetails') {
      await commands.executeCommand(SpotBugsCommands.OPEN_FINDING_DETAILS, finding);
      return;
    }
    if (message.type === 'copyRuleId') {
      await env.clipboard.writeText(finding.patternId);
      await window.showInformationMessage(`Copied SpotBugs rule id: ${finding.patternId}`);
      return;
    }
    if (message.type === 'openDocs') {
      const target = getFindingRuleDocumentationUri(finding);
      if (!target) {
        await window.showInformationMessage('No SpotBugs rule documentation is available.');
        return;
      }
      await commands.executeCommand('vscode.open', target);
    }
  }
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index += 1) {
    value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return value;
}
```

- [ ] **Step 9: Run Task 5 tests**

Run:

```bash
npm run compile && npx mocha "out/test/L0.findingInspectorRenderer.test.js" "out/test/L1.findingInspectorViewProvider.test.js"
```

Expected: renderer and provider tests pass and TypeScript compile succeeds with the new provider.

- [ ] **Step 10: Commit Task 5**

```bash
git add src/ui/findingInspectorRenderer.ts src/ui/findingInspectorViewProvider.ts src/test/L0.findingInspectorRenderer.test.ts src/test/L1.findingInspectorViewProvider.test.ts src/test/helpers/mockVscode.ts
git commit -m "feat: render SpotBugs finding inspector"
```

## Task 6: Tree Selection Controller and Lifecycle Wiring

**Files:**
- Create: `src/commands/findingInspectorLifecycle.ts`
- Create: `src/ui/findingInspectorController.ts`
- Create: `src/test/L1.findingInspectorController.test.ts`
- Modify: `src/extension.ts`
- Modify: `src/test/helpers/mockVscode.ts`

- [ ] **Step 1: Write failing tree selection controller tests**

Create `src/test/L1.findingInspectorController.test.ts`:

```ts
import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import { Finding } from '../model/finding';

installVscodeMock();

describe('findingInspectorController', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('selects finding leaves and retains on category selection', async () => {
    const { bindFindingInspectorToTree } = await import('../ui/findingInspectorController');
    const { FindingInspectorState } = await import('../ui/findingInspectorState');
    const { CategoryGroupItem, FindingItem, PatternGroupItem } = await import(
      '../ui/findingTreeItem'
    );
    const finding = makeFinding();
    const leaf = new FindingItem(finding);
    const pattern = new PatternGroupItem('NP_ALWAYS_NULL', [finding]);
    const category = new CategoryGroupItem('CORRECTNESS', [pattern], 1);
    const state = new FindingInspectorState();
    const tree = createTreeHarness();

    bindFindingInspectorToTree(tree.view, state);
    tree.fireSelection(leaf);
    assert.strictEqual(state.current.status, 'selected');
    assert.strictEqual(state.current.finding, finding);

    tree.fireSelection(category);
    assert.strictEqual(state.current.status, 'retained');
    assert.strictEqual(state.current.finding, finding);
  });
});

function createTreeHarness(): {
  view: never;
  fireSelection: (selection: unknown) => void;
} {
  let listener: ((event: { selection: unknown[] }) => unknown) | undefined;
  return {
    view: {
      onDidChangeSelection: (nextListener: (event: { selection: unknown[] }) => unknown) => {
        listener = nextListener;
        return { dispose: () => undefined };
      },
    } as never,
    fireSelection: (selection: unknown) => {
      listener?.({ selection: [selection] });
    },
  };
}

function makeFinding(): Finding {
  return {
    patternId: 'NP_ALWAYS_NULL',
    type: 'NP_ALWAYS_NULL',
    abbrev: 'NP',
    message: 'Null pointer',
    location: {
      fullPath: '/tmp/Example.java',
      startLine: 1,
    },
  };
}
```

- [ ] **Step 2: Run controller tests and verify they fail**

Run:

```bash
npm run compile && npx mocha "out/test/L1.findingInspectorController.test.js"
```

Expected: compile fails because `src/ui/findingInspectorController.ts` does not exist or `bindFindingInspectorToTree` is not exported.

- [ ] **Step 3: Implement tree selection controller**

Create `src/ui/findingInspectorController.ts`:

```ts
import { Disposable, TreeItem, TreeView } from 'vscode';
import {
  CategoryGroupItem,
  FindingItem,
  PatternGroupItem,
} from './findingTreeItem';
import { FindingInspectorState } from './findingInspectorState';

export function bindFindingInspectorToTree(
  treeView: TreeView<TreeItem>,
  inspectorState: FindingInspectorState
): Disposable {
  return treeView.onDidChangeSelection((event) => {
    const selected = event.selection[0];
    if (selected instanceof FindingItem) {
      inspectorState.select(selected.finding);
      return;
    }
    if (selected instanceof CategoryGroupItem || selected instanceof PatternGroupItem) {
      inspectorState.retainCurrent();
    }
  });
}
```

- [ ] **Step 4: Extend VS Code mock for activation compile**

In `src/test/helpers/mockVscode.ts`, add `createTreeView` and `registerWebviewViewProvider` if not already present:

```ts
createTreeView: (
  id: string,
  options: unknown
) => {
  onDidChangeSelection: (listener: (event: { selection: unknown[] }) => unknown) => {
    dispose: () => void;
  };
  dispose: () => void;
};
registerWebviewViewProvider: (
  id: string,
  provider: unknown
) => { dispose: () => void };
```

Default `createTreeView`:

```ts
createTreeView:
  overrides.window?.createTreeView ??
  (() => ({
    onDidChangeSelection: () => ({ dispose: () => undefined }),
    dispose: () => undefined,
  })),
```

- [ ] **Step 5: Wire inspector state, provider, tree selection, and commands in `extension.ts`**

Add imports:

```ts
import {
  FINDING_INSPECTOR_VIEW_ID,
  FindingInspectorViewProvider,
} from './ui/findingInspectorViewProvider';
import { FindingInspectorState } from './ui/findingInspectorState';
import { bindFindingInspectorToTree } from './ui/findingInspectorController';
import { resolveFindingCommandTarget } from './commands/findingCommandTarget';
import {
  clearInspectorBeforeOperation,
  reconcileInspectorAfterOperation,
} from './commands/findingInspectorLifecycle';
```

Create `src/commands/findingInspectorLifecycle.ts`:

```ts
import { Finding } from '../model/finding';
import { FindingInspectorState } from '../ui/findingInspectorState';

type LifecycleOperation = () => PromiseLike<void> | void;

export async function clearInspectorBeforeOperation(
  inspectorState: FindingInspectorState,
  operation: LifecycleOperation
): Promise<void> {
  inspectorState.clear();
  await operation();
}

export async function reconcileInspectorAfterOperation(
  inspectorState: FindingInspectorState,
  operation: LifecycleOperation,
  getVisibleFindings: () => readonly Finding[]
): Promise<void> {
  await operation();
  inspectorState.reconcileVisibleFindings(getVisibleFindings());
}
```

These helpers intentionally do not accept `FindingDescriptionPanel`. Full details panel state changes only through `spotbugs.openFindingDetails`.

Instantiate after `findingDescriptionPanel`:

```ts
const findingInspectorState = new FindingInspectorState();
const findingInspectorViewProvider = new FindingInspectorViewProvider(
  findingInspectorState
);
```

Add to `context.subscriptions.push` near the tree view:

```ts
findingInspectorState,
findingInspectorViewProvider,
window.registerWebviewViewProvider(
  FINDING_INSPECTOR_VIEW_ID,
  findingInspectorViewProvider
),
bindFindingInspectorToTree(spotbugsTreeView, findingInspectorState),
```

Update command handlers:

```ts
instrumentOperationAsVsCodeCommand(
  SpotBugsCommands.RUN_ANALYSIS,
  async (uri: Uri | undefined) => {
    await clearInspectorBeforeOperation(findingInspectorState, () =>
      checkCode(config, spotbugsTreeDataProvider, diagnosticsManager, uri)
    );
  }
),

instrumentOperationAsVsCodeCommand(SpotBugsCommands.RUN_WORKSPACE, async () => {
  await clearInspectorBeforeOperation(findingInspectorState, () =>
    runWorkspaceAnalysis(config, spotbugsTreeDataProvider, diagnosticsManager)
  );
}),

instrumentOperationAsVsCodeCommand(
  SpotBugsCommands.REVEAL_FINDING_SOURCE,
  async (bug) => {
    const target = await resolveFindingCommandTarget(
      bug,
      findingInspectorState,
      'go to code'
    );
    if (!target) {
      return;
    }
    await revealFindingSource(target);
  }
),

instrumentOperationAsVsCodeCommand(
  SpotBugsCommands.OPEN_FINDING_DETAILS,
  async (bug) => {
    const target = await resolveFindingCommandTarget(
      bug,
      findingInspectorState,
      'open details'
    );
    if (!target) {
      return;
    }
    findingDescriptionPanel.show(target);
  }
),

instrumentOperationAsVsCodeCommand(
  SpotBugsCommands.FILTER_RESULTS,
  async () => {
    await reconcileInspectorAfterOperation(
      findingInspectorState,
      () => selectFindingFilter(spotbugsTreeDataProvider),
      () => spotbugsTreeDataProvider.getAllFindings()
    );
  }
),

instrumentOperationAsVsCodeCommand(
  SpotBugsCommands.RESET_RESULTS,
  async () => {
    await clearInspectorBeforeOperation(findingInspectorState, () =>
      resetResults(spotbugsTreeDataProvider, diagnosticsManager)
    );
  }
)
```

Keep the existing `SpotBugsCommands.EXPORT_SARIF` registration unchanged:

```ts
instrumentOperationAsVsCodeCommand(
  SpotBugsCommands.EXPORT_SARIF,
  async (element?: unknown) => {
    await exportSarifReport(spotbugsTreeDataProvider, element);
  }
),
```

Remove the local `isFindingPayload` helper from `extension.ts` if it is unused after command target resolution.

- [ ] **Step 6: Run compile, controller tests, and VS Code activation tests**

Run:

```bash
npm run compile
npx mocha "out/test/L1.findingInspectorController.test.js"
npm run test:vscode
```

Expected: compile succeeds, controller tests pass, and VS Code activation tests pass.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/commands/findingInspectorLifecycle.ts src/ui/findingInspectorController.ts src/test/L1.findingInspectorController.test.ts src/extension.ts src/test/helpers/mockVscode.ts
git commit -m "feat: wire SpotBugs inspector lifecycle"
```

## Task 7: Full Regression Coverage

**Files:**
- Modify: `src/test/L1.packageContributions.test.ts`
- Modify: `src/test/L1.findingDescriptionPanel.test.ts`
- Modify: `src/test/L0.findingInspectorState.test.ts`
- Create: `src/test/L1.findingInspectorLifecycle.test.ts`
- Modify: `src/test/helpers/mockVscode.ts`

- [ ] **Step 1: Add package regression coverage for toolbar labels**

Extend `src/test/L1.packageContributions.test.ts` with:

```ts
it('uses SpotBugs results wording for shared toolbar commands', () => {
  const byCommand = new Map(
    manifest.contributes.commands.map((entry) => [entry.command, entry])
  );

  assert.strictEqual(
    byCommand.get('spotbugs.runWorkspace')?.title,
    'Analyze SpotBugs Workspace'
  );
  assert.strictEqual(
    byCommand.get('spotbugs.exportSarif')?.title,
    'Export SpotBugs Results (SARIF)'
  );
  assert.strictEqual(
    byCommand.get('spotbugs.filterResults')?.title,
    'Filter SpotBugs Results'
  );
  assert.strictEqual(
    byCommand.get('spotbugs.resetResults')?.title,
    'Reset SpotBugs Results'
  );
});
```

- [ ] **Step 2: Add details panel reuse unit coverage**

Extend `src/test/L1.findingDescriptionPanel.test.ts`. Add these imports at the top:

```ts
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
```

Call `installVscodeMock();` before the `describe` block:

```ts
installVscodeMock();
```

Add `createWebviewPanel` and `ViewColumn` to `src/test/helpers/mockVscode.ts` in this task because they are full-details panel test support, not inspector `WebviewViewProvider` support:

```ts
createWebviewPanel:
  overrides.window?.createWebviewPanel ??
  (() => ({
    title: '',
    webview: { html: '' },
    reveal: () => undefined,
    dispose: () => undefined,
    onDidDispose: () => ({ dispose: () => undefined }),
  })),
```

```ts
ViewColumn: {
  Beside: 2,
},
```

Add this test inside the existing `describe('findingDescriptionPanel', () => { ... })` block:

```ts
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
  const { FindingDescriptionPanel } = await import('../ui/findingDescriptionPanel');
  const panel = new FindingDescriptionPanel();

  panel.show(makeFinding({ patternId: 'NP_ALWAYS_NULL' }));
  const firstHtml = webview.html;
  panel.show(makeFinding({ patternId: 'URF_UNREAD_FIELD' }));

  assert.strictEqual(createCount, 1);
  assert.strictEqual(revealCount, 2);
  assert.strictEqual(disposeCount, 0);
  assert.ok(firstHtml.includes('NP_ALWAYS_NULL'));
  assert.ok(webview.html.includes('URF_UNREAD_FIELD'));
});
```

Call `makeFinding(overrides: Partial<Finding>)` from `src/test/L1.findingDescriptionPanel.test.ts` for both `panel.show` calls.

- [ ] **Step 3: Add lifecycle regression assertions**

Add unit tests to `src/test/L0.findingInspectorState.test.ts`:

```ts
it('clear does not mutate external details panel state', async () => {
  const { FindingInspectorState } = await import('../ui/findingInspectorState');
  const finding = makeFinding('NP_ALWAYS_NULL');
  const state = new FindingInspectorState();

  state.select(finding);
  state.clear();

  assert.strictEqual(state.current.status, 'empty');
  assert.strictEqual(finding.patternId, 'NP_ALWAYS_NULL');
});
```

This verifies inspector state clearing remains local to the inspector state object. Full panel stability across command lifecycle wrappers is covered by the next step.

- [ ] **Step 4: Add command lifecycle coverage for inspector clearing and details panel stability**

Create `src/test/L1.findingInspectorLifecycle.test.ts`:

```ts
import * as assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';
import { Finding } from '../model/finding';

installVscodeMock();

describe('findingInspectorLifecycle', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('clears inspector for reset/rerun lifecycle without disposing or blanking opened details', async () => {
    let disposeCount = 0;
    let operationCalled = false;
    const webview = { html: '' };
    resetVscodeMock({
      window: {
        createWebviewPanel: () => ({
          title: '',
          webview,
          reveal: () => undefined,
          dispose: () => {
            disposeCount += 1;
          },
          onDidDispose: () => ({ dispose: () => undefined }),
        }),
      } as never,
    });
    const { FindingDescriptionPanel } = await import('../ui/findingDescriptionPanel');
    const { FindingInspectorState } = await import('../ui/findingInspectorState');
    const { clearInspectorBeforeOperation } = await import(
      '../commands/findingInspectorLifecycle'
    );
    const finding = makeFinding('NP_ALWAYS_NULL');
    const state = new FindingInspectorState();
    const panel = new FindingDescriptionPanel();

    state.select(finding);
    panel.show(finding);
    const htmlBeforeLifecycle = webview.html;
    await clearInspectorBeforeOperation(state, async () => {
      operationCalled = true;
    });

    assert.strictEqual(operationCalled, true);
    assert.strictEqual(state.current.status, 'empty');
    assert.strictEqual(disposeCount, 0);
    assert.strictEqual(webview.html, htmlBeforeLifecycle);
    assert.ok(webview.html.includes('NP_ALWAYS_NULL'));
  });

  it('reconciles inspector after filter invalidation without touching opened details', async () => {
    let disposeCount = 0;
    const webview = { html: '' };
    resetVscodeMock({
      window: {
        createWebviewPanel: () => ({
          title: '',
          webview,
          reveal: () => undefined,
          dispose: () => {
            disposeCount += 1;
          },
          onDidDispose: () => ({ dispose: () => undefined }),
        }),
      } as never,
    });
    const { FindingDescriptionPanel } = await import('../ui/findingDescriptionPanel');
    const { FindingInspectorState } = await import('../ui/findingInspectorState');
    const { reconcileInspectorAfterOperation } = await import(
      '../commands/findingInspectorLifecycle'
    );
    const finding = makeFinding('NP_ALWAYS_NULL');
    const state = new FindingInspectorState();
    const panel = new FindingDescriptionPanel();

    state.select(finding);
    panel.show(finding);
    const htmlBeforeLifecycle = webview.html;
    await reconcileInspectorAfterOperation(state, async () => undefined, () => []);

    assert.strictEqual(state.current.status, 'empty');
    assert.strictEqual(disposeCount, 0);
    assert.strictEqual(webview.html, htmlBeforeLifecycle);
    assert.ok(webview.html.includes('NP_ALWAYS_NULL'));
  });
});

function makeFinding(patternId: string): Finding {
  return {
    patternId,
    type: patternId,
    message: patternId,
    location: {
      fullPath: `/tmp/${patternId}.java`,
      startLine: 1,
    },
  };
}
```

- [ ] **Step 5: Run targeted regression tests**

Run:

```bash
npm run compile && npx mocha "out/test/L0.findingPreview.test.js" "out/test/L0.findingInspectorState.test.js" "out/test/L0.findingInspectorRenderer.test.js" "out/test/L1.findingInspectorViewProvider.test.js" "out/test/L1.findingTreeItem.test.js" "out/test/L1.findingInspectorController.test.js" "out/test/L1.findingCommandTarget.test.js" "out/test/L1.findingInspectorLifecycle.test.js" "out/test/L1.packageContributions.test.js" "out/test/L1.findingDescriptionPanel.test.js"
npm run test:vscode
```

Expected: all targeted unit tests and VS Code tests pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run test
```

Expected: unit and VS Code test suites pass.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/test src/ui src/commands src/constants src/services src/extension.ts package.json
git commit -m "test: cover SpotBugs inspector regressions"
```

## Implementation Notes

- Do not add a compatibility shim for `spotbugs.openBugLocation`.
- Do not change backend LS command ids. `SpotBugsLSCommands.RUN_ANALYSIS` remains `java.spotbugs.run`.
- Keep `FindingDescriptionPanel` as the full HTML details surface.
- Keep `FindingInspectorViewProvider` compact; do not render full rule docs or compliant/noncompliant examples in the inspector.
- Keep `Copy rule id` as `finding.patternId`.
- Keep hidden-inspector context actions for `Open docs` and `Copy rule id` out of v1. Track them only in the design document's deferred follow-up list.

## Verification Checklist

Run before handing off implementation:

```bash
npm run compile
npm run format:check
npm run lint
npm run test:unit
npm run test:vscode
```

Expected:

- TypeScript compile exits 0.
- Prettier format check exits 0.
- ESLint exits 0 or only existing warnings allowed by repository policy.
- Unit tests exit 0.
- VS Code tests exit 0.

## Spec Coverage Self-Review

- `TreeView` results preserved: Task 2 removes only leaf command, Task 6 keeps `createTreeView('spotbugs-view')`.
- Inspector `WebviewView`: Task 3 contributes `spotbugs-inspector-view`, Task 5 implements provider, Task 6 registers provider.
- Full details on demand: Task 2 command split, Task 6 handler, Task 7 reuse/lifecycle coverage.
- Tree leaf single click no source/details: Task 2 tree item test.
- `openBugLocation` removed: Task 2 constants/tests, Task 3 package test.
- Hidden fallback actions: Task 3 package test, Task 4 FindingItem-style target resolution.
- Category/pattern scoped export: Task 3 package test, existing `resolveSpotBugsSelection` remains unchanged.
- Clear inspector state: Task 4 state model, Task 6 command lifecycle, Task 7 lifecycle assertions.
- Non-leaf retained summary: Task 4 state model, Task 5 renderer label, Task 6 controller test.
- Toolbar/menu placement: Task 3 package test, Task 7 wording test.
- Preview contract: Task 1 tests and utility, Task 5 renderer.
- Regression-oriented testing: Tasks 1 through 7 add targeted coverage and full suite verification.
