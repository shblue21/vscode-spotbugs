import * as assert from 'assert';
import { Finding } from '../model/finding';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();

describe('findingInspectorViewProvider', () => {
  afterEach(() => {
    resetVscodeMock();
  });

  it('renders current state when resolved and updates on state changes', async () => {
    const { state, provider, webview } = await createInspectorHarness();

    provider.resolveWebviewView({ webview } as never);

    assert.ok(webview.html.includes('Select a finding to inspect it.'));

    state.select(makeFinding({ patternId: 'NP_ALWAYS_NULL' }));

    assert.ok(webview.html.includes('Selected finding'));
    assert.ok(webview.html.includes('NP_ALWAYS_NULL'));
  });

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
    const { state, provider, webview } = await createInspectorHarness();

    provider.resolveWebviewView({ webview } as never);
    state.select(makeFinding({ patternId: 'NP_ALWAYS_NULL' }));
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
    const spotbugsCommands = await import('../constants/commands');
    const finding = makeFinding({ patternId: 'NP_ALWAYS_NULL' });
    const { state, provider, webview } = await createInspectorHarness();

    provider.resolveWebviewView({ webview } as never);
    state.select(finding);
    await webview.dispatch({ type: 'revealSource' });
    await webview.dispatch({ type: 'openDetails' });

    assert.deepStrictEqual(
      executed.map((entry) => entry.command),
      [
        spotbugsCommands.SpotBugsCommands.REVEAL_FINDING_SOURCE,
        spotbugsCommands.SpotBugsCommands.OPEN_FINDING_DETAILS,
      ]
    );
    assert.strictEqual(executed[0].arg, finding);
    assert.strictEqual(executed[1].arg, finding);
  });

  it('opens docs with vscode.open when a docs target exists', async () => {
    const executed: Array<{ command: string; arg: { toString(): string } }> = [];
    resetVscodeMock({
      commands: {
        executeCommand: async (command: string, arg: { toString(): string }) => {
          executed.push({ command, arg });
          return undefined;
        },
      },
    } as never);
    const { state, provider, webview } = await createInspectorHarness();

    provider.resolveWebviewView({ webview } as never);
    state.select(
      makeFinding({
        helpUri:
          'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html#NP_ALWAYS_NULL',
      })
    );
    await webview.dispatch({ type: 'openDocs' });

    assert.strictEqual(executed.length, 1);
    assert.strictEqual(executed[0].command, 'vscode.open');
    assert.strictEqual(
      executed[0].arg.toString(),
      'https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html#np-always-null'
    );
  });

  it('does not open non-web docs targets from finding metadata', async () => {
    const executed: Array<{ command: string; arg: { toString(): string } }> = [];
    const messages: string[] = [];
    resetVscodeMock({
      commands: {
        executeCommand: async (command: string, arg: { toString(): string }) => {
          executed.push({ command, arg });
          return undefined;
        },
      },
      window: {
        showInformationMessage: async (message: string) => {
          messages.push(message);
          return undefined;
        },
      },
    } as never);
    const { state, provider, webview } = await createInspectorHarness();

    provider.resolveWebviewView({ webview } as never);
    state.select(
      makeFinding({
        helpUri: 'command:workbench.action.closeWindow',
      })
    );
    await webview.dispatch({ type: 'openDocs' });

    assert.deepStrictEqual(executed, []);
    assert.ok(
      messages.some((message) =>
        message.includes('No SpotBugs rule documentation is available')
      )
    );
  });
});

async function createInspectorHarness() {
  const findingInspectorState = await import('../ui/findingInspectorState');
  const findingInspectorProvider = await import('../ui/findingInspectorViewProvider');
  const state = new findingInspectorState.FindingInspectorState();
  const provider = new findingInspectorProvider.FindingInspectorViewProvider(state);
  return { state, provider, webview: createWebview() };
}

function createWebview(): {
  html: string;
  options?: unknown;
  onDidReceiveMessage: (
    listener: (message: unknown) => unknown
  ) => { dispose: () => void };
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

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    patternId: 'NP_ALWAYS_NULL',
    type: 'NP_ALWAYS_NULL',
    message: 'Null pointer',
    location: {
      fullPath: '/tmp/Example.java',
      startLine: 1,
    },
    ...overrides,
  };
}
