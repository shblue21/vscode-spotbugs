import { Bug, Severity } from '../model/bug';

export function formatBugSummary(bug: Bug): string {
  const pattern = bug.abbrev || bug.type || 'Bug';
  const raw = bug.message || '';
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
    msg = bug.type || 'SpotBugs finding';
  }
  return `[${pattern}] ${msg}`;
}

export function formatPatternLabel(bug: Bug): string {
  const pattern = bug.abbrev || bug.type || 'Pattern';
  const raw = bug.message || '';
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
    msg = bug.type || 'SpotBugs Pattern';
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
