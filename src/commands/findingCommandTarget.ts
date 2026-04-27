import { window } from 'vscode';
import { Finding } from '../model/finding';
import { FindingInspectorState } from '../ui/findingInspectorState';

export async function resolveFindingCommandTarget(
  value: unknown,
  state: FindingInspectorState,
  actionLabel: string
): Promise<Finding | undefined> {
  const explicit = getExplicitFinding(value);
  if (explicit) {
    return explicit;
  }

  const snapshot = state.current;
  if (snapshot.status !== 'empty') {
    if (snapshot.status === 'retained') {
      await window.showInformationMessage(
        `SpotBugs: ${actionLabel} uses the Last inspected finding (${snapshot.finding.patternId}).`
      );
    }
    return snapshot.finding;
  }

  await window.showInformationMessage('No SpotBugs finding is currently selected.');
  return undefined;
}

export function isFindingPayload(value: unknown): value is Finding {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { patternId?: unknown; location?: unknown };
  return (
    typeof candidate.patternId === 'string' &&
    candidate.location !== null &&
    typeof candidate.location === 'object'
  );
}

function getExplicitFinding(value: unknown): Finding | undefined {
  if (isFindingPayload(value)) {
    return value;
  }
  if (value !== null && typeof value === 'object' && 'finding' in value) {
    const nested = (value as { finding?: unknown }).finding;
    if (isFindingPayload(nested)) {
      return nested;
    }
  }
  return undefined;
}
