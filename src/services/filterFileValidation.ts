import * as fs from 'fs';
import * as path from 'path';
import type { AnalysisSettings } from '../core/config';
import type { AnalysisError } from '../model/analysisProtocol';

type FilterKind = 'include' | 'exclude' | 'baseline';

const CODE_FILTER_NOT_FOUND = 'CFG_FILTER_NOT_FOUND';
const CODE_FILTER_NOT_FILE = 'CFG_FILTER_NOT_FILE';
const CODE_FILTER_UNREADABLE = 'CFG_FILTER_UNREADABLE';

export async function validateFilterFilesPreflight(
  settings: AnalysisSettings
): Promise<AnalysisError | undefined> {
  const includeError = await validateFilterGroup('include', settings.includeFilterPaths);
  if (includeError) {
    return includeError;
  }
  const excludeError = await validateFilterGroup('exclude', settings.excludeFilterPaths);
  if (excludeError) {
    return excludeError;
  }
  return validateFilterGroup('baseline', settings.excludeBaselineBugsPaths);
}

async function validateFilterGroup(
  kind: FilterKind,
  paths: string[] | undefined
): Promise<AnalysisError | undefined> {
  if (!Array.isArray(paths) || paths.length === 0) {
    return undefined;
  }
  for (const rawPath of paths) {
    const absolutePath = toAbsolutePath(rawPath);
    let stat: fs.Stats | undefined;
    try {
      stat = await safeStat(absolutePath);
    } catch (error) {
      return {
        code: CODE_FILTER_UNREADABLE,
        message: `${kind} filter file is not readable: ${absolutePath} (${rootCauseMessage(error)})`,
      };
    }
    if (!stat) {
      return {
        code: CODE_FILTER_NOT_FOUND,
        message: `${kind} filter file not found: ${absolutePath}`,
      };
    }
    if (!stat.isFile()) {
      return {
        code: CODE_FILTER_NOT_FILE,
        message: `${kind} filter file is not a regular file: ${absolutePath}`,
      };
    }
    try {
      await fs.promises.access(absolutePath, fs.constants.R_OK);
    } catch (error) {
      return {
        code: CODE_FILTER_UNREADABLE,
        message: `${kind} filter file is not readable: ${absolutePath} (${rootCauseMessage(error)})`,
      };
    }
  }
  return undefined;
}

async function safeStat(absolutePath: string): Promise<fs.Stats | undefined> {
  try {
    return await fs.promises.stat(absolutePath);
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno && errno.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function toAbsolutePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return path.resolve(trimmed);
}

function rootCauseMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unknown error';
  }
  let root: Error = error;
  while (root.cause instanceof Error) {
    root = root.cause;
  }
  const message = root.message?.trim();
  return message && message.length > 0 ? message : root.name;
}
