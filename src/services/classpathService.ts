import * as path from "path";
import * as fs from "fs";
import { Logger } from "../core/logger";
import { JavaLsClient } from "./javaLsClient";
import { Uri } from "vscode";

export interface ClasspathResult {
  output?: string;
  classpaths: string[];
  sourcepaths: string[];
}

export type ProjectRef = string | Uri | undefined;

export async function getClasspaths(project?: ProjectRef): Promise<ClasspathResult | undefined> {
  const res = await JavaLsClient.getClasspaths(project);
  if (!res) {
    Logger.log('getClasspaths returned empty result');
  }
  return res;
}

export async function deriveOutputFolder(
  classpaths: string[],
  workspacePath: string,
): Promise<string | undefined> {
  const jarsExcluded = classpaths.filter(
    (p) => !p.toLowerCase().endsWith(".jar") && !p.toLowerCase().endsWith(".zip"),
  );
  const preferredSuffixes = [
    `${path.sep}target${path.sep}classes`,
    `${path.sep}build${path.sep}classes${path.sep}java${path.sep}main`,
    `${path.sep}build${path.sep}classes`,
    `${path.sep}bin`,
    `${path.sep}out${path.sep}production`,
    `${path.sep}out`,
    `${path.sep}classes`,
  ];
  const candidates: string[] = [];
  for (const cp of jarsExcluded) {
    for (const suf of preferredSuffixes) {
      if (cp.includes(suf)) {
        candidates.push(cp);
        break;
      }
    }
  }
  for (const cp of jarsExcluded) {
    if (!candidates.includes(cp) && cp.startsWith(workspacePath)) {
      candidates.push(cp);
    }
  }
  for (const c of candidates) {
    try {
      const st = await fs.promises.stat(c);
      if (st.isDirectory()) {
        return c;
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

function toUriString(ref: ProjectRef): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  return ref.toString();
}
