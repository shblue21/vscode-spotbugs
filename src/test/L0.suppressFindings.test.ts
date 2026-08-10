import * as assert from 'assert';
import * as path from 'path';
import type { Finding } from '../model/finding';
import {
  createSuppressionPlan,
  type ManagedSuppressionFileState,
  type SuppressionPlan,
} from '../services/suppressionManager';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

const vscode = installVscodeMock();
const { suppressFindings, workspaceExcludePathsWithSuppression } = require(
  '../commands/suppressFindings'
) as typeof import('../commands/suppressFindings');
type SuppressFindingsDependencies =
  import('../commands/suppressFindings').SuppressFindingsDependencies;

describe('suppress findings command', () => {
  beforeEach(() => {
    resetVscodeMock({
      workspace: {
        workspaceFolders: [
          { name: 'workspace', uri: vscode.Uri.file('/workspace') },
        ],
      },
    } as never);
  });

  it('previews, writes, registers, and optionally runs analysis', async () => {
    const selected = finding();
    const additional = finding({ location: { startLine: 20 } });
    const events: string[] = [];
    let preview: SuppressionPlan | undefined;
    vscode.commands.executeCommand = async (command: unknown) => {
      events.push(`command:${String(command)}`);
    };
    await runCommand(
      {
        confirmPreview: async (plan) => {
          preview = plan;
          return true;
        },
        writeFile: async (filePath, _content, blocks) => {
          events.push(`write:${path.basename(filePath)}:${blocks.length}`);
        },
        ensureExcludeFilterConfigured: async (filePath) => {
          events.push(`register:${path.basename(filePath)}`);
        },
        notifySaved: async (_filePath, addedCount) => {
          events.push(`notify:${addedCount}`);
          return true;
        },
      },
      [selected],
      [selected, additional]
    );

    assert.ok(preview);
    assert.strictEqual(preview.blocks.length, 1);
    assert.deepStrictEqual(
      [preview.selectedCount, preview.matchedCount, preview.additionalCount],
      [1, 2, 1]
    );
    assert.deepStrictEqual(events, [
      'write:spotbugs-suppressions.xml:1',
      'register:spotbugs-suppressions.xml',
      'notify:1',
      'command:spotbugs.runWorkspace',
    ]);
  });

  it('has no file or configuration side effects when preview is cancelled', async () => {
    const events: string[] = [];
    await runCommand({
      confirmPreview: async () => false,
      writeFile: async () => {
        events.push('write');
      },
      ensureExcludeFilterConfigured: async () => {
        events.push('register');
      },
    });
    assert.deepStrictEqual(events, []);
  });

  it('guards file updates but releases the guard before the saved notification', async () => {
    const inspections: boolean[] = [];
    const attemptSuppression = async () => {
      let inspected = false;
      await runCommand({
        inspectFile: async (filePath) => {
          inspected = true;
          return { kind: 'missing', filePath };
        },
        confirmPreview: async () => false,
      });
      return inspected;
    };

    await runCommand({
      confirmPreview: async () => {
        inspections.push(await attemptSuppression());
        return true;
      },
      notifySaved: async () => {
        inspections.push(await attemptSuppression());
        return false;
      },
    });

    assert.deepStrictEqual(inspections, [false, true]);
  });

  it('uses the fallback name when the default file is unmanaged', async () => {
    const events: string[] = [];
    await runCommand({
      inspectFile: async (filePath) =>
        path.basename(filePath) === 'spotbugs-suppressions.xml'
          ? { kind: 'conflict', filePath }
          : { kind: 'missing', filePath },
      writeFile: async (filePath) => {
        events.push(path.basename(filePath));
      },
    });
    assert.deepStrictEqual(events, ['spotbugs-managed-suppressions.xml']);
  });

  it('does not reactivate unrelated rules from an inactive managed file', async () => {
    const selected = finding();
    const { errors, events } = await runInactiveManagedFile(
      selected,
      [
        blockFor(selected),
        blockFor(
          finding({
            type: 'NP_NULL_ON_SOME_PATH',
            location: { startLine: 20 },
          })
        ),
      ]
    );

    assert.strictEqual(errors.length, 1);
    assert.deepStrictEqual(events, []);
  });

  it('previews before safely re-registering the selected existing rule', async () => {
    const selected = finding();
    const { events } = await runInactiveManagedFile(selected, [
      blockFor(selected),
    ]);
    assert.deepStrictEqual(events, ['preview', 'register']);
  });

  it('preserves effective filters when adding the workspace suppression path', () => {
    const existing = [' filters/existing.xml ', '/outside/filter.xml'];
    assert.deepStrictEqual(
      workspaceExcludePathsWithSuppression(
        existing,
        '/workspace/spotbugs-suppressions.xml',
        '/workspace'
      ),
      [...existing, 'spotbugs-suppressions.xml']
    );
    assert.strictEqual(
      workspaceExcludePathsWithSuppression(
        ['spotbugs-suppressions.xml'],
        '/workspace/spotbugs-suppressions.xml',
        '/workspace'
      ),
      undefined
    );
  });
});

async function runInactiveManagedFile(
  selected: Finding,
  blocks: string[]
): Promise<{ errors: string[]; events: string[] }> {
  const errors: string[] = [];
  const events: string[] = [];
  vscode.window.showErrorMessage = async (message: string) => {
    errors.push(message);
    return undefined;
  };
  await runCommand(
    {
      inspectFile: managedFile(blocks),
      confirmPreview: async () => {
        events.push('preview');
        return true;
      },
      writeFile: async () => {
        events.push('write');
      },
      ensureExcludeFilterConfigured: async () => {
        events.push('register');
      },
    },
    [selected],
    [selected]
  );
  return { errors, events };
}

function runCommand(
  overrides: Partial<SuppressFindingsDependencies> = {},
  selected: Finding[] = [finding()],
  cached: Finding[] = [finding()]
) {
  return suppressFindings(provider(selected, cached), {}, {
    inspectFile: async (filePath): Promise<ManagedSuppressionFileState> => ({
      kind: 'missing',
      filePath,
    }),
    isDirty: () => false,
    isExcludeFilterConfigured: () => false,
    confirmPreview: async () => true,
    writeFile: async () => undefined,
    ensureExcludeFilterConfigured: async () => undefined,
    notifySaved: async () => false,
    ...overrides,
  });
}

function managedFile(blocks: string[]) {
  return async (filePath: string): Promise<ManagedSuppressionFileState> =>
    path.basename(filePath) === 'spotbugs-suppressions.xml'
      ? { kind: 'managed', filePath, content: 'managed', blocks }
      : { kind: 'missing', filePath };
}

function blockFor(value: Finding): string {
  const plan = createSuppressionPlan([value], [value]);
  assert.ok(plan.ok);
  return plan.value.blocks[0];
}

function provider(selected: Finding[], cached: Finding[]) {
  return {
    getFindingsForNode: () => selected,
    getCachedFindings: () => cached,
  } as never;
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    patternId: 'NP',
    type: 'NP_ALWAYS_NULL',
    message: 'finding',
    className: 'example.Service',
    methodName: 'load',
    methodSignature: '()V',
    location: { fullPath: '/workspace/src/Service.java', startLine: 10 },
    ...overrides,
  };
}
