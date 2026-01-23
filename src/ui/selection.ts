import { Bug } from '../model/bug';
import { CategoryGroupItem, PatternGroupItem, BugItem } from './bugTreeItem';
import { SpotBugsTreeDataProvider } from './spotbugsTreeDataProvider';

export function resolveSpotBugsSelection(
  provider: SpotBugsTreeDataProvider,
  element: unknown
): Bug[] {
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

  if (element && typeof (element as Bug).message === 'string') {
    return [element as Bug];
  }

  return provider.getAllFindings();
}
