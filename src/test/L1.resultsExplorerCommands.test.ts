import * as assert from 'assert';
import {
  installVscodeMock,
  resetTelemetryWrapperMock,
  resetVscodeMock,
} from './helpers/mockVscode';
import { Finding } from '../model/finding';
import { AnalysisRunCoordinator } from '../orchestration/analysisRunCoordinator';
import type { Uri } from 'vscode';

const vscode = installVscodeMock();
const resultResource = vscode.Uri.file('/workspace/src/Foo.java') as unknown as Uri;

describe('resultsExplorerCommands', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('invalidates pending analysis before clearing results', async () => {
    const { resetResults } = await import('../commands/reset');
    const coordinator = new AnalysisRunCoordinator();
    const lease = coordinator.begin();
    const currentStates: boolean[] = [];

    await resetResults(
      {
        showInitialMessage: () => currentStates.push(lease.isCurrent()),
      } as never,
      {
        clearAll: () => currentStates.push(lease.isCurrent()),
      } as never,
      coordinator,
    );

    assert.deepStrictEqual(currentStates, [false, false]);
  });

  it('sets and clears search through input commands', async () => {
    const inputOptions: Array<{ title?: string; prompt?: string; value?: string }> = [];
    resetVscodeMock({
      window: {
        showInputBox: async (options?: unknown) => {
          inputOptions.push(options as { title?: string; prompt?: string; value?: string });
          return 'CWE-89';
        },
      } as never,
    });
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const { searchResults, clearResultsSearch } = await import('../commands/resultsExplorer');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();
    provider.showResults([makeFinding({ cweId: 89, message: 'SQL risk' })], resultResource, []);
    provider.setSearchQuery('existing query');

    await searchResults(provider);

    assert.deepStrictEqual(inputOptions, [
      {
        title: 'SpotBugs Search Results',
        prompt: 'Search SpotBugs results',
        value: 'existing query',
      },
    ]);
    assert.strictEqual(provider.getSearchQuery(), 'CWE-89');

    await clearResultsSearch(provider);
    assert.strictEqual(provider.getSearchQuery(), '');
  });

  it('treats whitespace search input as clearing the query', async () => {
    const values = ['CWE-89', '   '];
    resetVscodeMock({
      window: {
        showInputBox: async () => values.shift(),
      } as never,
    });
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const { searchResults } = await import('../commands/resultsExplorer');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();
    provider.showResults([makeFinding({ cweId: 89, message: 'SQL risk' })], resultResource, []);

    await searchResults(provider);
    assert.strictEqual(provider.getSearchQuery(), 'CWE-89');

    await searchResults(provider);
    assert.strictEqual(provider.getSearchQuery(), '');
  });

  it('clear search is a no-op when cached findings exist and no search is active', async () => {
    let informationCount = 0;
    resetVscodeMock({
      window: {
        showInformationMessage: async () => {
          informationCount += 1;
          return undefined;
        },
      } as never,
    });
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const { clearResultsSearch } = await import('../commands/resultsExplorer');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();
    const finding = makeFinding();

    provider.showResults([finding], resultResource, []);
    const before = provider.getAllFindings();

    await clearResultsSearch(provider);

    assert.strictEqual(provider.getSearchQuery(), '');
    assert.deepStrictEqual(provider.getAllFindings(), before);
    assert.strictEqual(informationCount, 0);
  });

  it('changes group and sort through quick picks', async () => {
    const choices: string[] = ['Package', 'Rule'];
    const quickPickCalls: Array<Array<{ label: string; description?: string }>> = [];
    resetVscodeMock({
      window: {
        showQuickPick: async (items: Array<{ label: string; description?: string }>) => {
          quickPickCalls.push(items);
          const choice = choices.shift();
          return items.find((item) => item.label === choice);
        },
      } as never,
    });
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const { groupResultsBy, sortResultsBy } = await import('../commands/resultsExplorer');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();
    provider.showResults([makeFinding()], resultResource, []);
    provider.setGroupBy('class');
    provider.setSortBy('pathLine');

    await groupResultsBy(provider);
    await sortResultsBy(provider);

    assert.strictEqual(
      quickPickCalls[0].find((item) => item.label === 'Class')?.description,
      'Current',
    );
    assert.strictEqual(
      quickPickCalls[1].find((item) => item.label === 'Path / Line')?.description,
      'Current',
    );
    assert.strictEqual(provider.getGroupBy(), 'package');
    assert.strictEqual(provider.getSortBy(), 'rule');
  });

  it('shows information instead of prompting when there are no cached findings', async () => {
    const messages: string[] = [];
    let inputCount = 0;
    let quickPickCount = 0;
    resetVscodeMock({
      window: {
        showInformationMessage: async (message: string) => {
          messages.push(message);
          return undefined;
        },
        showInputBox: async () => {
          inputCount += 1;
          return 'NP';
        },
        showQuickPick: async () => {
          quickPickCount += 1;
          return undefined;
        },
      } as never,
    });
    const treeProviderModule = await import('../ui/spotbugsTreeDataProvider');
    const { clearResultsSearch, groupResultsBy, searchResults, sortResultsBy } = await import(
      '../commands/resultsExplorer'
    );
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();

    await searchResults(provider);
    await clearResultsSearch(provider);
    await groupResultsBy(provider);
    await sortResultsBy(provider);

    assert.strictEqual(inputCount, 0);
    assert.strictEqual(quickPickCount, 0);
    assert.deepStrictEqual(messages, [
      'No SpotBugs results available to search.',
      'No cached SpotBugs findings available to clear search.',
      'No cached SpotBugs findings available to group.',
      'No cached SpotBugs findings available to sort.',
    ]);
  });

  it('reconciles the displayed inspector after each registered exploration command', async () => {
    let informationCount = 0;
    const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
    const subscriptions: Array<{ dispose(): void }> = [];
    let tree!: import('../ui/spotbugsTreeDataProvider').SpotBugsTreeDataProvider;
    let select!: (event: { selection: unknown[] }) => unknown;
    const webview = { html: '', onDidReceiveMessage: () => ({ dispose() {} }) };
    resetVscodeMock({
      window: {
        showInformationMessage: async () => {
          informationCount++;
          return undefined;
        },
        createTreeView: (id: string, options: { treeDataProvider: typeof tree }) => {
          if (id === 'spotbugs-view') tree = options.treeDataProvider;
          return {
            onDidChangeSelection: (listener: typeof select) => {
              select = listener;
              return { dispose() {} };
            },
            dispose() {},
          };
        },
        registerWebviewViewProvider: (
          _id: string,
          provider: import('../ui/findingInspectorViewProvider').FindingInspectorViewProvider,
        ) => {
          provider.resolveWebviewView({ webview } as never);
          return { dispose() {} };
        },
      } as never,
    });
    resetTelemetryWrapperMock({
      instrumentOperationAsVsCodeCommand: (commandId, callback) => {
        registeredCommands.set(commandId, callback);
        return { dispose() {} };
      },
    });
    const { activate } = await import('../extension');
    const findingTreeItem = await import('../ui/findingTreeItem');
    try {
      await activate({
        asAbsolutePath: (relativePath: string) => `/extension/${relativePath}`,
        subscriptions,
      } as never);
      const finding = makeFinding();
      for (const commandId of [
        'spotbugs.searchResults',
        'spotbugs.clearSearch',
        'spotbugs.groupResultsBy',
        'spotbugs.sortResultsBy',
      ]) {
        tree.showResults([finding], resultResource, []);
        await select({ selection: [new findingTreeItem.FindingItem(finding)] });
        assert.ok(webview.html.includes('NP_ALWAYS_NULL'), commandId);
        tree.showResults([], resultResource, []);
        const command = registeredCommands.get(commandId);
        assert.ok(command, commandId);
        const previousInformationCount = informationCount;
        await command();
        assert.strictEqual(informationCount, previousInformationCount + 1, commandId);
        assert.ok(!webview.html.includes('NP_ALWAYS_NULL'), commandId);
      }
    } finally {
      for (const subscription of subscriptions.reverse()) subscription.dispose();
    }
  });
});

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    patternId: 'NP_ALWAYS_NULL',
    type: 'NP_ALWAYS_NULL',
    message: 'Null pointer',
    location: { fullPath: '/tmp/Example.java', startLine: 1 },
    ...overrides,
  };
}
