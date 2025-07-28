'use strict';
import { Uri } from "vscode";
import * as path from "path";
import { getJavaExtension } from "./utils";
import { executeJavaLanguageServerCommand } from "./command";
import { JavaLanguageServerCommands } from "./constants/commands";
import { glob } from "glob";

export async function isClassFileExists(javaFile: string): Promise<boolean> {
  const projectUris: string[] = await getAllJavaProjects();
  const javaExtension = await getJavaExtension();
  if (!javaExtension) { return false; }
  const javaExtensionApi = javaExtension.exports;

  for (const projectUri of projectUris) {
    const classpathResult = await javaExtensionApi.getClasspaths(projectUri, {
      scope: "runtime",
    });
    for (const classPath of classpathResult.classpaths) {
      const files = await glob(classPath.replace(/\\/g, "/") + "/**/*.class");
      for (const file of files) {
        if (
          path.basename(file, ".class") === path.basename(javaFile, ".java")
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

async function getAllJavaProjects(
  excludeDefaultProject: boolean = true
): Promise<string[]> {
  let projectUris: string[] = (await executeJavaLanguageServerCommand(
    JavaLanguageServerCommands.GET_ALL_JAVA_PROJECTS
  )) as string[];
  if (excludeDefaultProject) {
    projectUris = projectUris.filter((uriString) => {
      const projectPath = Uri.parse(uriString).fsPath;
      return path.basename(projectPath) !== "jdt.ls-java-project";
    });
  }
  return projectUris;
}

export async function getClassFileFromJavaFile(
  javaFile: string
): Promise<string> {
  const projectUris: string[] = await getAllJavaProjects();
  const javaExtension = await getJavaExtension();
  if (!javaExtension) { return ""; }
  const javaExtensionApi = javaExtension.exports;

  for (const projectUri of projectUris) {
    const classpathResult = await javaExtensionApi.getClasspaths(projectUri, {
      scope: "runtime",
    });
    for (const classPath of classpathResult.classpaths) {
      const replaceBackslash = classPath.replace(/\\/g, "/");
      const files = await glob(replaceBackslash + "/**/*.class");
      for (const file of files) {
        if (
          path.basename(file, ".class") === path.basename(javaFile, ".java")
        ) {
          return file;
        }
      }
    }
  }
  return "";
}
