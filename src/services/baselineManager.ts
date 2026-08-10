import * as fs from 'fs';
import * as path from 'path';

type BaselineFilePlan = { baselineXml: string; filePath: string };

export async function planBaselineFiles(
  workspaceRoot: string,
  baselineXmls: string[],
  unavailablePaths: string[] = []
): Promise<BaselineFilePlan[]> {
  const reserved = new Set(unavailablePaths.map(absolutePathKey));
  const plans: BaselineFilePlan[] = [];
  let index = 0;

  for (const baselineXml of baselineXmls) {
    let filePath: string;
    do {
      index++;
      filePath = path.join(
        workspaceRoot,
        index === 1 ? 'spotbugs-baseline.xml' : `spotbugs-baseline-${index}.xml`
      );
    } while (
      reserved.has(absolutePathKey(filePath)) ||
      (await fileExists(filePath))
    );
    plans.push({ baselineXml, filePath });
  }
  return plans;
}

export async function writeBaselineFiles(plans: BaselineFilePlan[]): Promise<void> {
  const created: string[] = [];
  try {
    for (const plan of plans) {
      const handle = await fs.promises.open(plan.filePath, 'wx');
      created.push(plan.filePath);
      try {
        await handle.writeFile(plan.baselineXml, 'utf8');
      } finally {
        await handle.close();
      }
    }
  } catch (error) {
    await Promise.allSettled(
      created.map((filePath) => fs.promises.rm(filePath, { force: true }))
    );
    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return false;
  }
}

export function absolutePathKey(value: string): string {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
