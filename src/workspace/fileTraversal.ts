import * as fs from 'fs';
import * as path from 'path';

export async function containsMatchingFile(
  targetPath: string,
  predicate: (filePath: string) => boolean | Promise<boolean>
): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(targetPath);
    if (stat.isFile()) {
      return predicate(targetPath);
    }
    if (!stat.isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  const queue: string[] = [targetPath];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isFile()) {
        if (await predicate(entryPath)) {
          return true;
        }
        continue;
      }
      if (entry.isDirectory()) {
        queue.push(entryPath);
      }
    }
  }
  return false;
}
