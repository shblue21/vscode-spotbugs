import { QuickPickItem, l10n, window } from 'vscode';
import { FindingGroupKind } from '../ui/findingFacets';
import { FindingSortKind } from '../ui/resultViewModel';
import { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';

type GroupPickItem = QuickPickItem & { value: FindingGroupKind };
type SortPickItem = QuickPickItem & { value: FindingSortKind };

const GROUP_ITEMS: GroupPickItem[] = [
  { label: l10n.t('Category'), value: 'category' },
  { label: l10n.t('Package'), value: 'package' },
  { label: l10n.t('Class'), value: 'class' },
  { label: l10n.t('Path'), value: 'path' },
  { label: l10n.t('Priority'), value: 'priority' },
  { label: l10n.t('Rule'), value: 'rule' },
];

const SORT_ITEMS: SortPickItem[] = [
  { label: l10n.t('Severity / Rank'), value: 'severityRank' },
  { label: l10n.t('Path / Line'), value: 'pathLine' },
  { label: l10n.t('Rule'), value: 'rule' },
];

export async function searchResults(
  provider: SpotBugsTreeDataProvider
): Promise<void> {
  if (provider.getCachedFindings().length === 0) {
    await window.showInformationMessage(
      l10n.t('No cached SpotBugs findings available to search.')
    );
    return;
  }

  const value = await window.showInputBox({
    title: l10n.t('SpotBugs Search Results'),
    prompt: l10n.t('Search SpotBugs results'),
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
      l10n.t('No cached SpotBugs findings available to clear search.')
    );
    return;
  }

  provider.clearSearchQuery();
}

export async function groupResultsBy(
  provider: SpotBugsTreeDataProvider
): Promise<void> {
  if (provider.getCachedFindings().length === 0) {
    await window.showInformationMessage(
      l10n.t('No cached SpotBugs findings available to group.')
    );
    return;
  }

  const current = provider.getGroupBy();
  const selected = await window.showQuickPick(
    GROUP_ITEMS.map((item) => ({
      ...item,
      description: item.value === current ? l10n.t('Current') : undefined,
    })),
    {
      title: l10n.t('SpotBugs Group Results By'),
      placeHolder: l10n.t('Choose a grouping mode'),
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
    await window.showInformationMessage(
      l10n.t('No cached SpotBugs findings available to sort.')
    );
    return;
  }

  const current = provider.getSortBy();
  const selected = await window.showQuickPick(
    SORT_ITEMS.map((item) => ({
      ...item,
      description: item.value === current ? l10n.t('Current') : undefined,
    })),
    {
      title: l10n.t('SpotBugs Sort Results By'),
      placeHolder: l10n.t('Choose a sorting mode'),
    }
  );

  if (selected) {
    provider.setSortBy(selected.value);
  }
}
