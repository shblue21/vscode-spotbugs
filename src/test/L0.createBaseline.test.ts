import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Uri } from 'vscode';
import type { AnalysisReportRun } from '../model/analysisReport';
import type { AnalysisResultScope } from '../model/analysisResultScope';
import type { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

const vscode = installVscodeMock();
const { createBaseline } = require('../commands/createBaseline') as typeof import('../commands/createBaseline');

const baselineXml = '<?xml version="1.0"?><BugCollection/>';
const baseRun: AnalysisReportRun = {
  projectUri: 'file:///workspace/project-a',
  findings: [{}] as never,
  baselineXml,
};
let workspaceRoot: string;

describe('create baseline command', () => {
  beforeEach(async () => {
    workspaceRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'spotbugs-create-baseline-')
    );
    resetVscodeMock({
      workspace: {
        workspaceFolders: [
          { name: 'workspace', uri: vscode.Uri.file(workspaceRoot) },
        ],
      },
    } as never);
    (vscode.workspace as unknown as { textDocuments: unknown[] }).textDocuments = [];
  });

  afterEach(async () => {
    await fs.promises.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('previews, writes, configures, and optionally reruns workspace analysis', async () => {
    const existingPath = path.join(workspaceRoot, 'spotbugs-baseline.xml');
    const dirtyPath = path.join(workspaceRoot, 'spotbugs-baseline-2.xml');
    await fs.promises.writeFile(existingPath, 'existing');
    (vscode.workspace as unknown as { textDocuments: unknown[] }).textDocuments = [
      { isDirty: true, uri: vscode.Uri.file(dirtyPath) },
    ];
    let configured: unknown[] | undefined;
    let executed: unknown;
    vscode.workspace.getConfiguration = () =>
      ({
        get: () => ['filters/existing.xml'],
        update: async (...args: unknown[]) => {
          configured = args;
        },
      }) as never;
    vscode.window.showWarningMessage = async () => 'Create Baseline';
    vscode.window.showInformationMessage = async () => 'Run Analysis';
    vscode.commands.executeCommand = async (command: unknown) => {
      executed = command;
    };

    await createBaseline(readyProvider());

    const baselinePath = path.join(workspaceRoot, 'spotbugs-baseline-3.xml');
    assert.strictEqual(await fs.promises.readFile(baselinePath, 'utf8'), baselineXml);
    assert.strictEqual(await fs.promises.readFile(existingPath, 'utf8'), 'existing');
    assert.deepStrictEqual(configured, [
      'filters.excludeBaselineBugsPaths',
      ['filters/existing.xml', 'spotbugs-baseline-3.xml'],
      false,
    ]);
    assert.strictEqual(executed, 'spotbugs.runWorkspace');
  });

  it('rolls back created files if another planned path appears before writing', async () => {
    const conflictingPath = path.join(
      workspaceRoot,
      'spotbugs-baseline-2.xml'
    );
    vscode.window.showWarningMessage = async () => {
      await fs.promises.writeFile(conflictingPath, 'user file');
      return 'Create Baseline';
    };

    const runs = [baseRun, { ...baseRun, projectUri: 'project-b' }];
    await createBaseline(readyProvider({ runs }));

    await assert.rejects(
      fs.promises.access(path.join(workspaceRoot, 'spotbugs-baseline.xml'))
    );
    assert.strictEqual(
      await fs.promises.readFile(conflictingPath, 'utf8'),
      'user file'
    );
  });

  it('does not treat resource results at the workspace root as workspace results', async () => {
    let confirmationCount = 0;
    vscode.window.showWarningMessage = async () => {
      confirmationCount += 1;
      return 'Create Baseline';
    };

    await createBaseline(
      readyProvider({
        scope: {
          kind: 'resource',
          resource: vscode.Uri.file(workspaceRoot) as unknown as Uri,
        },
      })
    );

    assert.strictEqual(confirmationCount, 0);
    await assert.rejects(
      fs.promises.access(path.join(workspaceRoot, 'spotbugs-baseline.xml'))
    );
  });

  it('does not create a file when cancelled or results are unavailable', async () => {
    vscode.window.showWarningMessage = async () => undefined;
    await createBaseline(readyProvider());
    for (const provider of [
      readyProvider({
        scope: {
          kind: 'workspace',
          workspaceFolder: vscode.Uri.file('/other-workspace') as unknown as Uri,
        },
      }),
      readyProvider({
        scope: {
          kind: 'resource',
          resource: vscode.Uri.file(workspaceRoot) as unknown as Uri,
        },
      }),
      readyProvider({ findings: [] }),
      readyProvider({ runs: [] }),
      readyProvider({ runs: [{ ...baseRun, analysisStatus: 'failed' }] }),
      readyProvider({ runs: [{ ...baseRun, baselineXml: undefined }] }),
    ]) {
      await createBaseline(provider);
    }
    await assert.rejects(
      fs.promises.access(path.join(workspaceRoot, 'spotbugs-baseline.xml'))
    );
  });
});

function readyProvider(
  overrides: {
    scope?: AnalysisResultScope;
    findings?: AnalysisReportRun['findings'];
    runs?: AnalysisReportRun[];
  } = {}
): SpotBugsTreeDataProvider {
  const findings = overrides.findings ?? baseRun.findings;
  return {
    getResultScope: () =>
      overrides.scope ?? {
        kind: 'workspace',
        workspaceFolder: vscode.Uri.file(workspaceRoot) as unknown as Uri,
      },
    getReportRuns: () => overrides.runs ?? [{ ...baseRun, findings }],
  } as SpotBugsTreeDataProvider;
}
