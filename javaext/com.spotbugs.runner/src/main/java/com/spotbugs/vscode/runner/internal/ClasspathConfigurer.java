package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

import edu.umd.cs.findbugs.Project;

/**
 * Applies project or system classpath entries to a FindBugs Project.
 */
public class ClasspathConfigurer {

    public void apply(Project project, List<String> projectClasspaths) {
        if (projectClasspaths != null && !projectClasspaths.isEmpty()) {
            for (String entry : projectClasspaths) {
                project.addAuxClasspathEntry(entry);
            }
        } else {
            String classPath = System.getProperty("java.class.path");
            if (classPath != null) {
                String[] pathElements = classPath.split(System.getProperty("path.separator"));
                for (String element : pathElements) {
                    project.addAuxClasspathEntry(element);
                }
            }
        }
    }

    public List<File> directoriesFrom(List<String> classpaths) {
        List<File> dirs = new ArrayList<>();
        if (classpaths == null) return dirs;
        for (String cp : classpaths) {
            if (cp == null) continue;
            File f = new File(cp);
            if (f.exists() && f.isDirectory()) dirs.add(f);
        }
        return dirs;
    }
}
