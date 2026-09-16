import * as path from 'path';

type PathFlavor = Pick<
  typeof path,
  'isAbsolute' | 'relative' | 'resolve' | 'sep'
>;

export function isPathInsideOrEqual(
  parentPath: string,
  candidatePath: string
): boolean {
  const flavor = selectPathFlavor(parentPath, candidatePath);
  const relative = flavor.relative(
    normalizePath(parentPath, flavor),
    normalizePath(candidatePath, flavor)
  );
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${flavor.sep}`) &&
      !flavor.isAbsolute(relative))
  );
}

export function pathComparisonKey(value: string): string {
  const flavor = selectPathFlavor(value);
  return normalizePath(value, flavor);
}

export function samePath(left: string, right: string): boolean {
  return pathComparisonKey(left) === pathComparisonKey(right);
}

export function uniquePaths(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    const key = trimmed ? pathComparisonKey(trimmed) : '';
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(trimmed!);
    }
  }
  return result;
}

export function relativePath(from: string, to: string): string {
  const flavor = selectPathFlavor(from, to);
  return flavor.relative(normalizePath(from, flavor), normalizePath(to, flavor));
}

export function isWindowsPath(value: string): boolean {
  return (
    /^[a-zA-Z]:[\\/]/.test(value) ||
    value.startsWith('\\\\') ||
    value.startsWith('//')
  );
}

function selectPathFlavor(...values: string[]): PathFlavor {
  return values.some(isWindowsPath) ? path.win32 : path;
}

function normalizePath(value: string, flavor: PathFlavor): string {
  const resolved = flavor.resolve(value);
  return flavor.sep === '\\' ? resolved.toLowerCase() : resolved;
}
