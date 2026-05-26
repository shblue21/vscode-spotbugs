import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { SpotBugsCommands } from '../constants/commands';
import { Finding } from '../model/finding';
import { SpotBugsDiagnosticsManager } from '../services/diagnosticsManager';
import { SpotBugsDiagnosticCodeActionProvider } from '../services/spotbugsDiagnosticCodeActionProvider';
import { isSpotBugsDiagnostic } from '../services/spotbugsDiagnosticSupport';

const cleanupPaths = new Set<string>();
const helpUri =
  'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html#NP_ALWAYS_NULL';
const rewrittenHelpUri =
  'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html#np-always-null';
const detailHtml = '<p>Local SpotBugs detail.</p>';

type NewerDiagnosticScenario = {
  rootUri: vscode.Uri;
  fileUri: vscode.Uri;
  newerTargetUri: vscode.Uri;
  newerFinding: Finding;
};

describe('SpotBugs diagnostic explanations', () => {
  afterEach(async () => {
    for (const targetPath of cleanupPaths) {
      await fs.rm(targetPath, { recursive: true, force: true });
    }
    cleanupPaths.clear();
  });

  it('uses a plain diagnostic code when local HTML detail is available', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const document = await openTempJavaDocument();
      manager.replaceAll([createFinding(document.uri, { detailHtml, helpUri })]);

      const diagnostics = spotbugsDiagnostics(document.uri);
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].code, 'NP_ALWAYS_NULL');
    } finally {
      manager.dispose();
    }
  });

  it('offers local details first and rule docs second when local HTML is available', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const document = await openTempJavaDocument();
      manager.replaceAll([createFinding(document.uri, { detailHtml, helpUri })]);
      const [diagnostic] = spotbugsDiagnostics(document.uri);
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

      assert.strictEqual(actions.length, 2);
      assert.strictEqual(actions[0].title, 'Show SpotBugs details');
      assert.strictEqual(
        actions[0].command?.command,
        SpotBugsCommands.OPEN_FINDING_DETAILS
      );
      assert.deepStrictEqual(actions[0].command?.arguments, [
        createFinding(document.uri, { detailHtml, helpUri }),
      ]);
      assert.deepStrictEqual(actions[0].diagnostics, [diagnostic]);
      assert.strictEqual(actions[1].title, 'Open SpotBugs rule docs');
      assert.strictEqual(actions[1].command?.command, 'vscode.open');
      assert.strictEqual(actions[1].command?.arguments?.[0].toString(), rewrittenHelpUri);
      assert.deepStrictEqual(actions[1].diagnostics, [diagnostic]);
    } finally {
      manager.dispose();
    }
  });

  it('uses finding-specific helpUri for diagnostic links when local HTML is missing', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const document = await openTempJavaDocument();
      manager.replaceAll([createFinding(document.uri, { helpUri })]);
      const diagnostics = spotbugsDiagnostics(document.uri);
      assert.strictEqual(diagnostics.length, 1);

      const code = diagnostics[0].code;
      assert.ok(code && typeof code === 'object' && 'target' in code);
      if (code && typeof code === 'object' && 'target' in code) {
        assert.strictEqual(code.value, 'NP_ALWAYS_NULL');
        assert.strictEqual(code.target.toString(), rewrittenHelpUri);
      }
    } finally {
      manager.dispose();
    }
  });

  it('keeps the raw finding helpUri unchanged after rewriting UI docs targets', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const document = await openTempJavaDocument();
      manager.replaceAll([createFinding(document.uri, { helpUri })]);

      const [finding] = manager.getFindingsAt(document.uri, new vscode.Position(0, 0));
      assert.ok(finding);
      assert.strictEqual(finding.helpUri, helpUri);
    } finally {
      manager.dispose();
    }
  });

  it('does not offer the quick fix when neither local HTML nor rule docs exist', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const document = await openTempJavaDocument();
      manager.replaceAll([createFinding(document.uri)]);
      const [diagnostic] = spotbugsDiagnostics(document.uri);
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

describe('SpotBugs scoped diagnostics', () => {
  afterEach(async () => {
    for (const targetPath of cleanupPaths) {
      await fs.rm(targetPath, { recursive: true, force: true });
    }
    cleanupPaths.clear();
  });

  it('publishes folder analysis diagnostics on child source files', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const { rootUri, fileUri } = await createTempJavaFile(
        'src/main/java/demo/Repro.java'
      );

      manager.replaceForScope(
        { kind: 'folder', uri: rootUri },
        [createFinding(fileUri)]
      );

      const childDiagnostics = spotbugsDiagnostics(fileUri);
      assert.strictEqual(childDiagnostics.length, 1);
      assert.strictEqual(diagnosticCodeValue(childDiagnostics[0]), 'NP_ALWAYS_NULL');
      assert.strictEqual(spotbugsDiagnostics(rootUri).length, 0);

      const findings = manager.getFindingsAt(fileUri, new vscode.Position(0, 0));
      assert.strictEqual(findings.length, 1);
      assert.strictEqual(findings[0].patternId, 'NP_ALWAYS_NULL');
    } finally {
      manager.dispose();
    }
  });

  it('treats child folder names starting with dot-dot characters as in-folder diagnostics', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const { rootUri, fileUri } = await createTempJavaFile(
        '..generated/Repro.java'
      );

      manager.replaceForScope(
        { kind: 'folder', uri: rootUri },
        [createFinding(fileUri)]
      );

      const diagnostics = spotbugsDiagnostics(fileUri);
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnosticCodeValue(diagnostics[0]), 'NP_ALWAYS_NULL');
      const findings = manager.getFindingsAt(fileUri, new vscode.Position(0, 0));
      assert.strictEqual(findings.length, 1);
    } finally {
      manager.dispose();
    }
  });

  it('clears in-folder diagnostics while preserving prefix-siblings and ignoring out-of-scope findings', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const { rootUri, fileUri: inScopeUri } = await createTempJavaFile(
        'src/main/java/demo/InScope.java'
      );
      const siblingRoot = `${rootUri.fsPath}-sibling`;
      const { fileUri: siblingUri } = await createTempJavaFile(
        'src/main/java/demo/Outside.java',
        siblingRoot
      );

      manager.replaceAll([createFinding(inScopeUri), createFinding(siblingUri)]);
      assert.strictEqual(spotbugsDiagnostics(inScopeUri).length, 1);
      assert.strictEqual(spotbugsDiagnostics(siblingUri).length, 1);

      manager.replaceForScope(
        { kind: 'folder', uri: rootUri },
        [
          createFinding(siblingUri, {
            patternId: 'OUT_OF_SCOPE_FOLDER_SCOPE',
            type: 'OUT_OF_SCOPE_FOLDER_SCOPE',
          }),
        ]
      );

      assert.strictEqual(spotbugsDiagnostics(inScopeUri).length, 0);
      const siblingDiagnostics = spotbugsDiagnostics(siblingUri);
      assert.strictEqual(siblingDiagnostics.length, 1);
      assert.strictEqual(diagnosticCodeValue(siblingDiagnostics[0]), 'NP_ALWAYS_NULL');
      assert.deepStrictEqual(
        manager.getFindingsAt(inScopeUri, new vscode.Position(0, 0)),
        []
      );
      const siblingFindings = manager.getFindingsAt(
        siblingUri,
        new vscode.Position(0, 0)
      );
      assert.strictEqual(siblingFindings.length, 1);
      assert.strictEqual(siblingFindings[0].patternId, 'NP_ALWAYS_NULL');
    } finally {
      manager.dispose();
    }
  });

  it('replaces in-folder diagnostics with diagnostics for currently returned child files', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const { rootUri, fileUri: staleUri } = await createTempJavaFile(
        'src/main/java/demo/Stale.java'
      );
      const { fileUri: currentUri } = await createTempJavaFile(
        'src/main/java/demo/Current.java',
        rootUri.fsPath
      );
      const currentFinding = createFinding(currentUri, {
        patternId: 'CURRENT_FOLDER_SCOPE',
        type: 'CURRENT_FOLDER_SCOPE',
      });

      manager.replaceAll([createFinding(staleUri)]);
      manager.replaceForScope({ kind: 'folder', uri: rootUri }, [currentFinding]);

      assert.strictEqual(spotbugsDiagnostics(staleUri).length, 0);
      const currentDiagnostics = spotbugsDiagnostics(currentUri);
      assert.strictEqual(currentDiagnostics.length, 1);
      assert.strictEqual(
        diagnosticCodeValue(currentDiagnostics[0]),
        'CURRENT_FOLDER_SCOPE'
      );
      assert.deepStrictEqual(
        manager.getFindingsAt(staleUri, new vscode.Position(0, 0)),
        []
      );
      const currentFindings = manager.getFindingsAt(
        currentUri,
        new vscode.Position(0, 0)
      );
      assert.strictEqual(currentFindings.length, 1);
      assert.strictEqual(currentFindings[0].patternId, 'CURRENT_FOLDER_SCOPE');
    } finally {
      manager.dispose();
    }
  });

  it('clears stale returned-files diagnostics on rerun of the same bytecode target', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const targetUri = vscode.Uri.file(
        path.join(os.tmpdir(), 'spotbugs-target', 'classes')
      );
      const { rootUri, fileUri: firstUri } = await createTempJavaFile(
        'src/main/java/demo/First.java'
      );
      const { fileUri: secondUri } = await createTempJavaFile(
        'src/main/java/demo/Second.java',
        rootUri.fsPath
      );
      const oldFirstFinding = createFinding(firstUri, {
        patternId: 'OLD_RETURNED_FILES',
        type: 'OLD_RETURNED_FILES',
      });
      const newFirstFinding = createFinding(firstUri, {
        patternId: 'NEW_RETURNED_FILES',
        type: 'NEW_RETURNED_FILES',
      });

      manager.replaceForScope(
        { kind: 'returned-files', uri: targetUri },
        [oldFirstFinding, createFinding(secondUri)]
      );
      manager.replaceForScope(
        { kind: 'returned-files', uri: targetUri },
        [newFirstFinding]
      );

      const diagnostics = spotbugsDiagnostics(firstUri);
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnosticCodeValue(diagnostics[0]), 'NEW_RETURNED_FILES');
      const firstFindings = manager.getFindingsAt(firstUri, new vscode.Position(0, 0));
      assert.strictEqual(firstFindings.length, 1);
      assert.strictEqual(firstFindings[0].patternId, 'NEW_RETURNED_FILES');
      assert.strictEqual(spotbugsDiagnostics(secondUri).length, 0);
      assert.deepStrictEqual(
        manager.getFindingsAt(secondUri, new vscode.Position(0, 0)),
        []
      );
    } finally {
      manager.dispose();
    }
  });

  it('clears stale returned-files diagnostics from child targets when a parent target reruns', async () => {
    const manager = new SpotBugsDiagnosticsManager();
    try {
      const parentTargetUri = vscode.Uri.file(
        path.join(os.tmpdir(), 'spotbugs-target', 'classes')
      );
      const childTargetUri = vscode.Uri.file(
        path.join(os.tmpdir(), 'spotbugs-target', 'classes', 'demo')
      );
      const { fileUri } = await createTempJavaFile('src/main/java/demo/Repro.java');

      manager.replaceForScope(
        { kind: 'returned-files', uri: childTargetUri },
        [createFinding(fileUri)]
      );
      assert.strictEqual(spotbugsDiagnostics(fileUri).length, 1);

      manager.replaceForScope({ kind: 'returned-files', uri: parentTargetUri }, []);

      assert.strictEqual(spotbugsDiagnostics(fileUri).length, 0);
      assert.deepStrictEqual(
        manager.getFindingsAt(fileUri, new vscode.Position(0, 0)),
        []
      );
    } finally {
      manager.dispose();
    }
  });

  for (const { name, patternId, publishNewer } of [
    {
      name: 'file-scope',
      patternId: 'NEW_FILE_SCOPE',
      publishNewer: (
        manager: SpotBugsDiagnosticsManager,
        context: NewerDiagnosticScenario
      ) =>
        manager.replaceForScope(
          { kind: 'file', uri: context.fileUri },
          [context.newerFinding]
        ),
    },
    {
      name: 'folder-scope',
      patternId: 'NEW_FOLDER_SCOPE',
      publishNewer: (
        manager: SpotBugsDiagnosticsManager,
        context: NewerDiagnosticScenario
      ) =>
        manager.replaceForScope(
          { kind: 'folder', uri: context.rootUri },
          [context.newerFinding]
        ),
    },
    {
      name: 'returned-files',
      patternId: 'NEW_RETURNED_FILES',
      publishNewer: (
        manager: SpotBugsDiagnosticsManager,
        context: NewerDiagnosticScenario
      ) =>
        manager.replaceForScope(
          { kind: 'returned-files', uri: context.newerTargetUri },
          [context.newerFinding]
        ),
    },
  ]) {
    it(`does not let older returned-files clearing remove newer ${name} diagnostics`, async () => {
      const manager = new SpotBugsDiagnosticsManager();
      try {
        const olderTargetUri = vscode.Uri.file(
          path.join(os.tmpdir(), 'spotbugs-target', 'classes-a')
        );
        const newerTargetUri = vscode.Uri.file(
          path.join(os.tmpdir(), 'spotbugs-target', 'classes-b')
        );
        const { rootUri, fileUri } = await createTempJavaFile(
          'src/main/java/demo/Repro.java'
        );
        const newerFinding = createFinding(fileUri, {
          patternId,
          type: patternId,
        });

        manager.replaceForScope(
          { kind: 'returned-files', uri: olderTargetUri },
          [
            createFinding(fileUri, {
              patternId: 'OLD_RETURNED_FILES',
              type: 'OLD_RETURNED_FILES',
            }),
          ]
        );
        publishNewer(manager, { rootUri, fileUri, newerTargetUri, newerFinding });
        manager.replaceForScope({ kind: 'returned-files', uri: olderTargetUri }, []);

        assertPublishedFinding(manager, fileUri, patternId);
      } finally {
        manager.dispose();
      }
    });
  }
});

async function openTempJavaDocument(): Promise<vscode.TextDocument> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spotbugs-diagnostic-docs-'));
  cleanupPath(tempDir);

  const targetFile = path.join(tempDir, 'Example.java');
  await fs.writeFile(targetFile, 'class Example {}\n', 'utf8');
  return vscode.workspace.openTextDocument(vscode.Uri.file(targetFile));
}

async function createTempJavaFile(
  relativePath: string,
  existingRoot?: string
): Promise<{ rootUri: vscode.Uri; fileUri: vscode.Uri }> {
  const tempDir =
    existingRoot ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'spotbugs-scoped-diags-')));
  cleanupPath(tempDir);

  const targetFile = path.join(tempDir, relativePath);
  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  await fs.writeFile(targetFile, 'class Example {}\n', 'utf8');
  const fileUri = vscode.Uri.file(targetFile);
  return {
    rootUri: vscode.Uri.file(tempDir),
    fileUri,
  };
}

function assertPublishedFinding(
  manager: SpotBugsDiagnosticsManager,
  uri: vscode.Uri,
  patternId: string
): void {
  const diagnostics = spotbugsDiagnostics(uri);
  assert.strictEqual(diagnostics.length, 1);
  assert.strictEqual(diagnosticCodeValue(diagnostics[0]), patternId);

  const findings = manager.getFindingsAt(uri, new vscode.Position(0, 0));
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].patternId, patternId);
}

function diagnosticCodeValue(diagnostic: vscode.Diagnostic): unknown {
  const code = diagnostic.code;
  return code && typeof code === 'object' && 'value' in code ? code.value : code;
}

function spotbugsDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
  return vscode.languages.getDiagnostics(uri).filter(isSpotBugsDiagnostic);
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
