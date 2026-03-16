import { QuickPickItem, window } from 'vscode';
import { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import {
  FindingFilterKind,
  getFindingFilterDisplayLabel,
  getFindingFilterKindLabel,
  getFindingFilterKinds,
} from '../ui/findingFilters';

type FilterKindPickItem =
  | (QuickPickItem & { action: 'kind'; filterKind: FindingFilterKind })
  | (QuickPickItem & { action: 'clear-all' });

type FilterValuePickItem =
  | (QuickPickItem & { action: 'set'; value: string })
  | (QuickPickItem & { action: 'clear-kind' });

export async function selectFindingFilter(
  provider: SpotBugsTreeDataProvider
): Promise<void> {
  const cachedFindings = provider.getCachedFindings();
  if (cachedFindings.length === 0) {
    await window.showInformationMessage('No cached SpotBugs findings available to filter.');
    return;
  }

  const activeFilters = provider.getActiveFilters();
  const kindItems: FilterKindPickItem[] = getFindingFilterKinds().flatMap((filterKind) => {
    const options = provider.getFilterOptions(filterKind);
    const currentValue = activeFilters[filterKind];
    if (options.length === 0 && !currentValue) {
      return [];
    }

    const description = currentValue
      ? `Current: ${getFindingFilterDisplayLabel(cachedFindings, filterKind, currentValue)}`
      : undefined;
    const detail = `${options.length} available value${options.length === 1 ? '' : 's'}`;
    return [
      {
        action: 'kind' as const,
        filterKind,
        label: getFindingFilterKindLabel(filterKind),
        description,
        detail,
      },
    ];
  });

  if (Object.keys(activeFilters).length > 0) {
    kindItems.push({
      action: 'clear-all',
      label: 'Clear all filters',
      description: 'Restore the full cached result set',
    });
  }

  const selectedKind = await window.showQuickPick<FilterKindPickItem>(kindItems, {
    title: 'SpotBugs Filters',
    placeHolder: 'Choose a filter kind to update',
  });

  if (!selectedKind) {
    return;
  }

  if (selectedKind.action === 'clear-all') {
    provider.clearFilters();
    return;
  }

  const kind = selectedKind.filterKind;
  const options = provider.getFilterOptions(kind);
  const valueItems: FilterValuePickItem[] = [];
  const currentValue = activeFilters[kind];

  if (currentValue) {
    valueItems.push({
      action: 'clear-kind',
      label: `Clear ${getFindingFilterKindLabel(kind)} filter`,
      description: getFindingFilterDisplayLabel(cachedFindings, kind, currentValue),
    });
  }

  valueItems.push(
    ...options.map((option) => ({
      action: 'set' as const,
      value: option.value,
      label: option.label,
      description: formatFindingCount(option.count),
      detail: option.detail,
    }))
  );

  const selectedValue = await window.showQuickPick<FilterValuePickItem>(valueItems, {
    title: `SpotBugs Filter: ${getFindingFilterKindLabel(kind)}`,
    placeHolder: `Choose a ${getFindingFilterKindLabel(kind).toLowerCase()} value`,
  });

  if (!selectedValue) {
    return;
  }

  if (selectedValue.action === 'clear-kind') {
    provider.clearFilter(kind);
    return;
  }

  provider.setFilter(kind, selectedValue.value);
}

function formatFindingCount(count: number): string {
  return `${count} finding${count === 1 ? '' : 's'}`;
}
