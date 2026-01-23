import { Finding } from '../model/finding';
import { CategoryGroupItem, PatternGroupItem, BugItem } from './bugTreeItem';
import { SpotBugsTreeDataProvider } from './spotbugsTreeDataProvider';

export function resolveSpotBugsSelection(
  provider: SpotBugsTreeDataProvider,
  element: unknown
): Finding[] {
  if (
    element instanceof CategoryGroupItem ||
    element instanceof PatternGroupItem ||
    element instanceof BugItem
  ) {
    const scoped = provider.getFindingsForNode(element);
    if (scoped.length > 0) {
      return scoped;
    }
  }

  if (element && typeof (element as Finding).message === 'string') {
    return [element as Finding];
  }

  return provider.getAllFindings();
}
