import { QuickPickItem, window } from 'vscode';
import { FindingGroupKind } from '../ui/findingFacets';
import { FindingSortKind } from '../ui/resultViewModel';
import { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';

type GroupPickItem = QuickPickItem & { value: FindingGroupKind };
type SortPickItem = QuickPickItem & { value: FindingSortKind };

const GROUP_ITEMS: GroupPickItem[] = [
  { label: 'Category', value: 'category' },
  { label: 'Package', value: 'package' },
  { label: 'Class', value: 'class' },
  { label: 'Path', value: 'path' },
  { label: 'Priority', value: 'priority' },
  { label: 'Rule', value: 'rule' },
];

const SORT_ITEMS: SortPickItem[] = [
  { label: 'Severity / Rank', value: 'severityRank' },
  { label: 'Path / Line', value: 'pathLine' },
  { label: 'Rule', value: 'rule' },
];

export async function searchResults(
  provider: SpotBugsTreeDataProvider
): Promise<void> {
  if (provider.getCachedFindings().length === 0) {
    await window.showInformationMessage('No cached SpotBugs findings available to search.');
    return;
  }

  const value = await window.showInputBox({
    title: 'SpotBugs Search Results',
    prompt: 'Search SpotBugs results',
    value: provider.getSearchQuery(),
  });

  if (value === undefined) {
    return;
  }

  provider.setSearchQuery(value);
}

export async function clearResultsSearch(
  provider: SpotBugsTreeDataProvider
): Promise<void> {
  if (provider.getCachedFindings().length === 0) {
    await window.showInformationMessage(
      'No cached SpotBugs findings available to clear search.'
    );
    return;
  }

  provider.clearSearchQuery();
}

export async function groupResultsBy(
  provider: SpotBugsTreeDataProvider
): Promise<void> {
  if (provider.getCachedFindings().length === 0) {
    await window.showInformationMessage('No cached SpotBugs findings available to group.');
    return;
  }

  const current = provider.getGroupBy();
  const selected = await window.showQuickPick(
    GROUP_ITEMS.map((item) => ({
      ...item,
      description: item.value === current ? 'Current' : undefined,
    })),
    {
      title: 'SpotBugs Group Results By',
      placeHolder: 'Choose a grouping mode',
    }
  );

  if (selected) {
    provider.setGroupBy(selected.value);
  }
}

export async function sortResultsBy(
  provider: SpotBugsTreeDataProvider
): Promise<void> {
  if (provider.getCachedFindings().length === 0) {
    await window.showInformationMessage('No cached SpotBugs findings available to sort.');
    return;
  }

  const current = provider.getSortBy();
  const selected = await window.showQuickPick(
    SORT_ITEMS.map((item) => ({
      ...item,
      description: item.value === current ? 'Current' : undefined,
    })),
    {
      title: 'SpotBugs Sort Results By',
      placeHolder: 'Choose a sorting mode',
    }
  );

  if (selected) {
    provider.setSortBy(selected.value);
  }
}
