import { l10n } from 'vscode';
import { Finding } from '../model/finding';
import {
  FindingFilterKind,
  FindingFilterState,
  getFindingFilterDisplayLabel,
  getFindingFilterKinds,
} from './findingFilters';

export function localizeFindingFilterKind(kind: FindingFilterKind): string {
  const labels: Record<FindingFilterKind, string> = {
    severity: l10n.t('Severity'),
    category: l10n.t('Category'),
    package: l10n.t('Package'),
    class: l10n.t('Class'),
    path: l10n.t('Path'),
    rule: l10n.t('Rule'),
  };
  return labels[kind];
}

export function localizeFindingFilterText(kind: FindingFilterKind, text: string): string {
  if (kind !== 'severity') {
    return text;
  }
  const labels = new Map([
    ['Error', l10n.t('Error')],
    ['Warning', l10n.t('Warning')],
    ['Info', l10n.t('Info')],
    ['Rank 1-4', l10n.t('Rank 1-4')],
    ['Rank 5-9', l10n.t('Rank 5-9')],
    ['Rank 10+ or unknown', l10n.t('Rank 10+ or unknown')],
  ]);
  return labels.get(text) ?? text;
}

export function describeLocalizedFindingFilters(
  findings: Finding[],
  filters: FindingFilterState
): string | undefined {
  const parts = getFindingFilterKinds().flatMap((kind) => {
    const value = filters[kind];
    if (!value) {
      return [];
    }
    const label = getFindingFilterDisplayLabel(findings, kind, value);
    return [`${localizeFindingFilterKind(kind)}: ${localizeFindingFilterText(kind, label)}`];
  });
  return parts.length > 0 ? parts.join(' • ') : undefined;
}
