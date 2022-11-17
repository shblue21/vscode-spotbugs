'use strict';
import { Uri } from 'vscode';
import * as path from 'path';
import { getJavaExtensionApi, getJavaExtension } from './utils';
import { Command, executeJavaLanguageServerCommand } from './command';

export async function isClassFileExists(javaFile: string): Promise<boolean> {
    const projectUris: string[] = await getAllJavaProjects();
    const javaExtensionApi = await getJavaExtensionApi();

    for (const projectUri of projectUris) {
        const classpathResult = await javaExtensionApi.getClasspaths(projectUri, { scope: 'runtime' });

        // filter classpathResult to only include class files same file name as java file
        classpathResult.classpaths.forEach((classpath: String) => {
            if (classpath.endsWith(".class")) {
                const classFile = classpath.split("/").pop();
                const javaFileWithoutExtension = javaFile.split(".").shift();
                if (classFile === javaFileWithoutExtension + ".class") {
                    return true;
                }
            }
        });
    }
    return false;
}


async function getAllJavaProjects(excludeDefaultProject: boolean = true): Promise<string[]> {
    let projectUris: string[] = await executeJavaLanguageServerCommand(Command.GET_ALL_JAVA_PROJECTS) as string[];
    if (excludeDefaultProject) {
        projectUris = projectUris.filter((uriString) => {
            const projectPath = Uri.parse(uriString).fsPath;
            return path.basename(projectPath) !== "jdt.ls-java-project";
        });
    }
    return projectUris;
}
