import { window } from 'vscode';
import { SpotBugsTreeDataProvider } from '../ui/spotbugsTreeDataProvider';
import {
  formatFindingFilterQuery,
  parseFindingFilterQuery,
  validateFindingFilterQuery,
} from '../ui/findingFilters';

export async function selectFindingFilter(
  provider: SpotBugsTreeDataProvider
): Promise<void> {
  const cachedFindings = provider.getCachedFindings();
  if (cachedFindings.length === 0) {
    await window.showInformationMessage('No cached SpotBugs findings available to filter.');
    return;
  }

  const input = await window.showInputBox({
    title: 'SpotBugs Filters',
    prompt:
      'Filter cached findings with key:value terms. Supported keys: severity, category, package, class, path, rule. Leave empty to clear filters.',
    placeHolder:
      'severity:error category:BAD_PRACTICE package:com.acme class:Foo path:src/main/java rule:NP',
    value: formatFindingFilterQuery(provider.getActiveFilters()),
    ignoreFocusOut: true,
    validateInput: (value) => validateFindingFilterQuery(value),
  });

  if (input === undefined) {
    return;
  }

  if (!input.trim()) {
    provider.clearFilters();
    return;
  }

  try {
    provider.setFilters(parseFindingFilterQuery(input));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await window.showErrorMessage(`Unable to apply SpotBugs filters: ${message}`);
  }
}
