import { BugInfo } from '../models/bugInfo';

export function formatBugSummary(bug: BugInfo): string {
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

