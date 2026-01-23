import { FindingSummary } from '../model/finding';
import { Severity } from '../model/severity';

export function formatFindingSummary(finding: FindingSummary): string {
  const pattern = finding.abbrev || finding.type || 'Bug';
  const raw = finding.message || '';
  let msg = raw.trim();
  const prefix = `${pattern}:`;
  if (msg.toUpperCase().startsWith(prefix.toUpperCase())) {
    msg = msg.substring(prefix.length).trim();
  }
  const inIdx = msg.indexOf(' in ');
  if (inIdx > 0) {
    msg = msg.substring(0, inIdx).trim();
  }
  if (!msg) {
    msg = finding.type || 'SpotBugs finding';
  }
  return `[${pattern}] ${msg}`;
}

export function formatFindingPatternLabel(finding: FindingSummary): string {
  const pattern = finding.abbrev || finding.type || 'Pattern';
  const raw = finding.message || '';
  let msg = raw.trim();
  const prefix = `${pattern}:`;
  if (msg.toUpperCase().startsWith(prefix.toUpperCase())) {
    msg = msg.substring(prefix.length).trim();
  }
  const inIdx = msg.indexOf(' in ');
  if (inIdx > 0) {
    msg = msg.substring(0, inIdx).trim();
  }
  if (!msg) {
    msg = finding.type || 'SpotBugs Pattern';
  }
  return `[${pattern}] ${msg}`;
}

export function rankToSeverity(rank?: number): Severity {
  if (typeof rank !== 'number') {
    return 'info';
  }
  if (rank <= 4) {
    return 'error';
  }
  if (rank <= 9) {
    return 'warning';
  }
  return 'info';
}
