import * as path from 'path';

export function deriveTargetResolutionRoots(
  output: string | undefined,
  runtimeClasspaths: string[]
): string[] {
  const roots: string[] = [];

  if (typeof output === 'string') {
    const trimmed = output.trim();
    if (trimmed.length > 0) {
      roots.push(trimmed);
    }
  }

  for (const entry of runtimeClasspaths) {
    const trimmed = entry.trim();
    if (!trimmed || isArchivePath(trimmed)) {
      continue;
    }
    roots.push(trimmed);
  }

  return dedupePreservingOrder(roots);
}

function isArchivePath(entry: string): boolean {
  const lower = path.extname(entry).toLowerCase();
  return lower === '.jar' || lower === '.zip';
}

function dedupePreservingOrder(values: string[]): string[] {
  const deduped = new Set<string>();
  for (const value of values) {
    if (value) {
      deduped.add(value);
    }
  }
  return Array.from(deduped);
}
