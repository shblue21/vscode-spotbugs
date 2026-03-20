package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import edu.umd.cs.findbugs.Project;

/**
 * Applies aux classpath entries to a FindBugs Project and prepares directory roots
 * for source-to-bytecode target resolution.
 */
public class ClasspathConfigurer {

    public AppliedAuxClasspath apply(
            Project project,
            List<String> runtimeClasspaths,
            List<String> extraAuxClasspaths
    ) {
        List<String> auxEntries = buildEffectiveAuxClasspath(runtimeClasspaths, extraAuxClasspaths);
        for (String entry : auxEntries) {
            project.addAuxClasspathEntry(entry);
        }
        return new AppliedAuxClasspath(auxEntries.size());
    }

    public List<File> directoriesFrom(List<String> targetResolutionRoots) {
        List<File> dirs = new ArrayList<>();
        if (targetResolutionRoots == null) return dirs;
        for (String root : targetResolutionRoots) {
            if (root == null) continue;
            File f = new File(root);
            if (f.exists() && f.isDirectory()) dirs.add(f);
        }
        return dirs;
    }

    private List<String> buildEffectiveAuxClasspath(
            List<String> runtimeClasspaths,
            List<String> extraAuxClasspaths
    ) {
        List<String> explicitEntries = mergeExplicitAuxEntries(runtimeClasspaths, extraAuxClasspaths);
        if (!explicitEntries.isEmpty()) {
            return explicitEntries;
        }
        return systemClasspathEntries();
    }

    private List<String> mergeExplicitAuxEntries(
            List<String> runtimeClasspaths,
            List<String> extraAuxClasspaths
    ) {
        Set<String> deduped = new LinkedHashSet<>();
        addEntries(deduped, runtimeClasspaths);
        addEntries(deduped, extraAuxClasspaths);
        return new ArrayList<>(deduped);
    }

    private void addEntries(Set<String> out, List<String> entries) {
        if (entries == null) {
            return;
        }
        for (String entry : entries) {
            if (entry == null) {
                continue;
            }
            String trimmed = entry.trim();
            if (!trimmed.isEmpty()) {
                out.add(trimmed);
            }
        }
    }

    private List<String> systemClasspathEntries() {
        Set<String> deduped = new LinkedHashSet<>();
        String classPath = System.getProperty("java.class.path");
        String pathSeparator = System.getProperty("path.separator");
        if (classPath == null || pathSeparator == null || pathSeparator.isEmpty()) {
            return new ArrayList<>(deduped);
        }

        String[] pathElements = classPath.split(java.util.regex.Pattern.quote(pathSeparator));
        for (String element : pathElements) {
            if (element == null) {
                continue;
            }
            String trimmed = element.trim();
            if (!trimmed.isEmpty()) {
                deduped.add(trimmed);
            }
        }
        return new ArrayList<>(deduped);
    }

    public static final class AppliedAuxClasspath {
        private final int entryCount;

        AppliedAuxClasspath(int entryCount) {
            this.entryCount = entryCount;
        }

        public int getEntryCount() {
            return entryCount;
        }
    }
}
