import * as fs from 'fs';
import * as path from 'path';
import type { AnalysisSettings } from '../core/config';
import type { AnalysisError } from '../model/analysisProtocol';

type FilterKind = 'include' | 'exclude' | 'baseline';

const CODE_FILTER_NOT_FOUND = 'CFG_FILTER_NOT_FOUND';
const CODE_FILTER_NOT_FILE = 'CFG_FILTER_NOT_FILE';
const CODE_FILTER_UNREADABLE = 'CFG_FILTER_UNREADABLE';
const CODE_AUX_CLASSPATH_NOT_FOUND = 'CFG_AUX_CLASSPATH_NOT_FOUND';
const CODE_AUX_CLASSPATH_INVALID_ENTRY = 'CFG_AUX_CLASSPATH_INVALID_ENTRY';
const CODE_AUX_CLASSPATH_UNREADABLE = 'CFG_AUX_CLASSPATH_UNREADABLE';
const CODE_PLUGIN_NOT_FOUND = 'CFG_PLUGIN_NOT_FOUND';
const CODE_PLUGIN_NOT_FILE = 'CFG_PLUGIN_NOT_FILE';
const CODE_PLUGIN_NOT_JAR = 'CFG_PLUGIN_NOT_JAR';
const CODE_PLUGIN_UNREADABLE = 'CFG_PLUGIN_UNREADABLE';

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

export async function validateExtraAuxClasspathPreflight(
  settings: AnalysisSettings
): Promise<AnalysisError | undefined> {
  const paths = settings.extraAuxClasspaths;
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
        code: CODE_AUX_CLASSPATH_UNREADABLE,
        message: `extra aux classpath entry is not readable: ${absolutePath} (${rootCauseMessage(error)})`,
      };
    }
    if (!stat) {
      return {
        code: CODE_AUX_CLASSPATH_NOT_FOUND,
        message: `extra aux classpath entry not found: ${absolutePath}`,
      };
    }
    if (!stat.isDirectory() && !(stat.isFile() && isArchivePath(absolutePath))) {
      return {
        code: CODE_AUX_CLASSPATH_INVALID_ENTRY,
        message: `extra aux classpath entry must be a directory or .jar/.zip file: ${absolutePath}`,
      };
    }
    try {
      await fs.promises.access(absolutePath, fs.constants.R_OK);
    } catch (error) {
      return {
        code: CODE_AUX_CLASSPATH_UNREADABLE,
        message: `extra aux classpath entry is not readable: ${absolutePath} (${rootCauseMessage(error)})`,
      };
    }
  }

  return undefined;
}

export async function validatePluginJarsPreflight(
  settings: AnalysisSettings
): Promise<AnalysisError | undefined> {
  const paths = settings.plugins;
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
        code: CODE_PLUGIN_UNREADABLE,
        message: `SpotBugs plugin jar is not readable: ${absolutePath} (${rootCauseMessage(error)})`,
      };
    }
    if (!stat) {
      return {
        code: CODE_PLUGIN_NOT_FOUND,
        message: `SpotBugs plugin jar not found: ${absolutePath}`,
      };
    }
    if (!stat.isFile()) {
      return {
        code: CODE_PLUGIN_NOT_FILE,
        message: `SpotBugs plugin path is not a regular file: ${absolutePath}`,
      };
    }
    if (!isJarPath(absolutePath)) {
      return {
        code: CODE_PLUGIN_NOT_JAR,
        message: `SpotBugs plugin path must be a .jar file: ${absolutePath}`,
      };
    }
    try {
      await assertReadableFile(absolutePath);
    } catch (error) {
      return {
        code: CODE_PLUGIN_UNREADABLE,
        message: `SpotBugs plugin jar is not readable: ${absolutePath} (${rootCauseMessage(error)})`,
      };
    }
  }

  return undefined;
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
    if (errno && (errno.code === 'ENOENT' || errno.code === 'ENOTDIR')) {
      return undefined;
    }
    throw error;
  }
}

async function assertReadableFile(filePath: string): Promise<void> {
  const handle = await fs.promises.open(filePath, 'r');
  await handle.close();
}

function toAbsolutePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return path.resolve(trimmed);
}

function isArchivePath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.jar' || ext === '.zip';
}

function isJarPath(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.jar';
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
