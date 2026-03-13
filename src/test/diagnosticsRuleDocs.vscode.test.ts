import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Finding } from '../model/finding';
import { SpotBugsDiagnosticsManager } from '../services/diagnosticsManager';
import { SpotBugsDiagnosticCodeActionProvider } from '../services/spotbugsDiagnosticCodeActionProvider';

const cleanupPaths = new Set<string>();

describe('SpotBugs diagnostic rule docs', () => {
  const helpUri =
    'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html#NP_ALWAYS_NULL';

  afterEach(async () => {
    for (const targetPath of cleanupPaths) {
      await fs.rm(targetPath, { recursive: true, force: true });
    }
    cleanupPaths.clear();
  });

  it('uses finding-specific helpUri for diagnostic links', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const document = await openTempJavaDocument();
      manager.replaceAll([createFinding(document.uri, { helpUri })]);

      const diagnostics = vscode.languages.getDiagnostics(document.uri);
      assert.strictEqual(diagnostics.length, 1);

      const code = diagnostics[0].code;
      assert.ok(code && typeof code === 'object' && 'target' in code);
      if (code && typeof code === 'object' && 'target' in code) {
        assert.strictEqual(code.value, 'NP_ALWAYS_NULL');
        assert.strictEqual(code.target.toString(), helpUri);
      }
    } finally {
      manager.dispose();
    }
  });

  it('offers an Open SpotBugs rule docs quick fix for matching diagnostics', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const document = await openTempJavaDocument();
      manager.replaceAll([createFinding(document.uri, { helpUri })]);
      const [diagnostic] = vscode.languages.getDiagnostics(document.uri);
      assert.ok(diagnostic);

      const provider = new SpotBugsDiagnosticCodeActionProvider(manager);
      const tokenSource = new vscode.CancellationTokenSource();
      const actions = provider.provideCodeActions(
        document,
        diagnostic.range,
        {
          diagnostics: [diagnostic],
          only: vscode.CodeActionKind.QuickFix,
          triggerKind: vscode.CodeActionTriggerKind.Invoke,
        },
        tokenSource.token
      );
      tokenSource.dispose();

      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, 'Open SpotBugs rule docs');
      assert.strictEqual(actions[0].command?.command, 'vscode.open');
      assert.strictEqual(actions[0].command?.arguments?.[0].toString(), helpUri);
      assert.deepStrictEqual(actions[0].diagnostics, [diagnostic]);
    } finally {
      manager.dispose();
    }
  });

  it('does not offer the quick fix when finding-specific helpUri is missing', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const document = await openTempJavaDocument();
      manager.replaceAll([createFinding(document.uri)]);
      const [diagnostic] = vscode.languages.getDiagnostics(document.uri);
      assert.ok(diagnostic);

      const provider = new SpotBugsDiagnosticCodeActionProvider(manager);
      const tokenSource = new vscode.CancellationTokenSource();
      const actions = provider.provideCodeActions(
        document,
        diagnostic.range,
        {
          diagnostics: [diagnostic],
          only: vscode.CodeActionKind.QuickFix,
          triggerKind: vscode.CodeActionTriggerKind.Invoke,
        },
        tokenSource.token
      );
      tokenSource.dispose();

      assert.strictEqual(actions.length, 0);
    } finally {
      manager.dispose();
    }
  });
});

async function openTempJavaDocument(): Promise<vscode.TextDocument> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spotbugs-diagnostic-docs-'));
  cleanupPath(tempDir);

  const targetFile = path.join(tempDir, 'Example.java');
  await fs.writeFile(targetFile, 'class Example {}\n', 'utf8');
  return vscode.workspace.openTextDocument(vscode.Uri.file(targetFile));
}

function cleanupPath(targetPath: string): void {
  cleanupPaths.add(targetPath);
}

function createFinding(
  uri: vscode.Uri,
  overrides: Partial<Finding> = {}
): Finding {
  return {
    patternId: 'NP_ALWAYS_NULL',
    type: 'NP_ALWAYS_NULL',
    abbrev: 'NP',
    message: 'NP: Value is always null in Example.test()',
    helpUri: overrides.helpUri,
    location: {
      fullPath: uri.fsPath,
      startLine: 1,
      endLine: 1,
    },
    ...overrides,
  };
}
