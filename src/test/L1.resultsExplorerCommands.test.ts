import * as assert from 'assert';
import {
  installVscodeMock,
  resetTelemetryWrapperMock,
  resetVscodeMock,
} from './helpers/mockVscode';
import { Finding } from '../model/finding';

installVscodeMock();

describe('resultsExplorerCommands', () => {
  beforeEach(() => {
    resetVscodeMock();
    resetTelemetryWrapperMock();
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
    provider.showResults([makeFinding({ cweId: 89, message: 'SQL risk' })]);
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
    provider.showResults([makeFinding({ cweId: 89, message: 'SQL risk' })]);

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

    provider.showResults([finding]);
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
    provider.showResults([makeFinding()]);
    provider.setGroupBy('class');
    provider.setSortBy('pathLine');

    await groupResultsBy(provider);
    await sortResultsBy(provider);

    assert.strictEqual(
      quickPickCalls[0].find((item) => item.label === 'Class')?.description,
      'Current'
    );
    assert.strictEqual(
      quickPickCalls[1].find((item) => item.label === 'Path / Line')?.description,
      'Current'
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
    const {
      clearResultsSearch,
      groupResultsBy,
      searchResults,
      sortResultsBy,
    } = await import('../commands/resultsExplorer');
    const provider = new treeProviderModule.SpotBugsTreeDataProvider();

    await searchResults(provider);
    await clearResultsSearch(provider);
    await groupResultsBy(provider);
    await sortResultsBy(provider);

    assert.strictEqual(inputCount, 0);
    assert.strictEqual(quickPickCount, 0);
    assert.deepStrictEqual(messages, [
      'No cached SpotBugs findings available to search.',
      'No cached SpotBugs findings available to clear search.',
      'No cached SpotBugs findings available to group.',
      'No cached SpotBugs findings available to sort.',
    ]);
  });

  it('registers result exploration commands during extension activation', async () => {
    const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
    resetTelemetryWrapperMock({
      instrumentOperationAsVsCodeCommand: (
        commandId: string,
        callback: (...args: unknown[]) => unknown
      ) => {
        registeredCommands.set(commandId, callback);
        return { dispose: () => undefined };
      },
    });
    delete require.cache[require.resolve('../extension')];
    const { activate } = require('../extension') as typeof import('../extension');

    await activate({
      asAbsolutePath: (relativePath: string) => `/extension/${relativePath}`,
      subscriptions: [],
    } as never);

    for (const commandId of [
      'spotbugs.run',
      'spotbugs.runWorkspace',
      'spotbugs.revealFindingSource',
      'spotbugs.openFindingDetails',
      'spotbugs.filterResults',
      'spotbugs.exportSarif',
      'spotbugs.resetResults',
      'spotbugs.searchResults',
      'spotbugs.clearSearch',
      'spotbugs.groupResultsBy',
      'spotbugs.sortResultsBy',
    ]) {
      assert.strictEqual(
        typeof registeredCommands.get(commandId),
        'function',
        `${commandId} was not registered`
      );
    }
  });

  it('wraps result exploration command callbacks with inspector reconciliation', async () => {
    const lifecycle =
      require('../commands/findingInspectorLifecycle') as typeof import('../commands/findingInspectorLifecycle');
    const mutableLifecycle = lifecycle as unknown as {
      reconcileInspectorAfterOperation: typeof lifecycle.reconcileInspectorAfterOperation;
    };
    const originalReconcile = lifecycle.reconcileInspectorAfterOperation;
    const reconciled: string[] = [];
    const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

    mutableLifecycle.reconcileInspectorAfterOperation = (async (
      _state,
      operation,
      getVisibleFindings
    ) => {
      await operation();
      reconciled.push(`visible:${getVisibleFindings().length}`);
    }) as typeof lifecycle.reconcileInspectorAfterOperation;

    resetTelemetryWrapperMock({
      instrumentOperationAsVsCodeCommand: (
        commandId: string,
        callback: (...args: unknown[]) => unknown
      ) => {
        registeredCommands.set(commandId, callback);
        return { dispose: () => undefined };
      },
    });

    try {
      delete require.cache[require.resolve('../extension')];
      const { activate } = require('../extension') as typeof import('../extension');

      await activate({
        asAbsolutePath: (relativePath: string) => `/extension/${relativePath}`,
        subscriptions: [],
      } as never);

      for (const commandId of [
        'spotbugs.searchResults',
        'spotbugs.clearSearch',
        'spotbugs.groupResultsBy',
        'spotbugs.sortResultsBy',
      ]) {
        await registeredCommands.get(commandId)?.();
      }

      assert.deepStrictEqual(reconciled, [
        'visible:0',
        'visible:0',
        'visible:0',
        'visible:0',
      ]);
    } finally {
      mutableLifecycle.reconcileInspectorAfterOperation = originalReconcile;
      delete require.cache[require.resolve('../extension')];
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
