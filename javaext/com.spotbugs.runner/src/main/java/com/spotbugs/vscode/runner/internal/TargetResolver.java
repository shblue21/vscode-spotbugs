package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Resolves input paths (.java/.class/.jar/directories) into concrete analysis targets
 * (.class and .jar files). Uses classpath directories to map sources to outputs.
 */
public class TargetResolver {

    public List<String> resolveTargets(String[] inputs, List<File> classpathDirs) throws IOException {
        List<String> targets = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        if (inputs == null) {
            return targets;
        }
        for (String p : inputs) {
            if (p == null || p.trim().isEmpty()) {
                continue;
            }
            File f = new File(p);
            if (f.isDirectory()) {
                // If a source directory is selected, map it to an output directory first.
                if (!collectOutputClassesForSourceDirectory(p, classpathDirs, targets, seen)) {
                    collectTargetsRecursively(f, classpathDirs, targets, seen);
                }
                continue;
            }
            if (p.endsWith(".class") || p.endsWith(".jar")) {
                if (f.exists() && f.isFile()) addIfNew(f.getAbsolutePath(), targets, seen);
                continue;
            }
            if (p.endsWith(".java")) {
                addTargetsForJavaFile(p, classpathDirs, targets, seen);
                continue;
            }
            // Unknown type: add existing file or scan directory
            if (f.exists()) {
                if (f.isFile()) addIfNew(f.getAbsolutePath(), targets, seen);
                else if (f.isDirectory()) collectTargetsRecursively(f, classpathDirs, targets, seen);
            }
        }
        return targets;
    }

    private void collectTargetsRecursively(File dir, List<File> classpathDirs, List<String> out, Set<String> seen) throws IOException {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File c : children) {
            if (c.isDirectory()) {
                collectTargetsRecursively(c, classpathDirs, out, seen);
                continue;
            }
            if (!c.isFile()) {
                continue;
            }
            String name = c.getName();
            if (name.endsWith(".class") || name.endsWith(".jar")) {
                addIfNew(c.getAbsolutePath(), out, seen);
                continue;
            }
            if (name.endsWith(".java")) {
                addTargetsForJavaFile(c.getAbsolutePath(), classpathDirs, out, seen);
                continue;
            }
        }
    }

    private boolean collectClassFilesByBasename(File dir, String baseName, List<String> out, Set<String> seen) throws IOException {
        File[] children = dir.listFiles();
        if (children == null) return false;
        for (File c : children) {
            if (c.isDirectory()) {
                if (collectClassFilesByBasename(c, baseName, out, seen)) {
                    return true;
                }
                continue;
            }
            if (c.isFile() && c.getName().equals(baseName + ".class")) {
                addIfNew(c.getAbsolutePath(), out, seen);
                return true;
            }
        }
        return false;
    }

    private boolean collectOutputClassesForSourceDirectory(
            String sourceDir,
            List<File> classpathDirs,
            List<String> out,
            Set<String> seen
    ) throws IOException {
        String rel = deriveRelativePathFromSource(sourceDir);
        if (rel == null) {
            return false;
        }
        if (classpathDirs == null || classpathDirs.isEmpty()) {
            return false;
        }

        boolean added = false;
        String relDir = normalizePath(rel);
        for (File dir : classpathDirs) {
            if (dir == null) continue;
            File candidate = relDir.isEmpty() ? dir : new File(dir, relDir);
            if (candidate.exists() && candidate.isDirectory()) {
                int before = out.size();
                collectTargetsRecursively(candidate, classpathDirs, out, seen);
                if (out.size() > before) {
                    added = true;
                }
            }
        }
        return added;
    }

    private boolean addTargetsForJavaFile(
            String javaPath,
            List<File> classpathDirs,
            List<String> out,
            Set<String> seen
    ) throws IOException {
        boolean added = false;
        String rel = deriveRelativePathFromSource(javaPath);
        if (rel != null && classpathDirs != null && !classpathDirs.isEmpty()) {
            String classRel = normalizePath(rel).replace(".java", ".class");
            for (File dir : classpathDirs) {
                if (dir == null) continue;
                File candidate = new File(dir, classRel);
                if (candidate.exists() && candidate.isFile()) {
                    addIfNew(candidate.getAbsolutePath(), out, seen);
                    added = true;
                    break;
                }
            }
        }

        if (!added && classpathDirs != null && !classpathDirs.isEmpty()) {
            // Fallback: basename scan (may be ambiguous when multiple classes share the same simple name)
            String baseName = stripExtension(new File(javaPath).getName());
            for (File dir : classpathDirs) {
                if (dir == null) continue;
                if (collectClassFilesByBasename(dir, baseName, out, seen)) {
                    added = true;
                    break;
                }
            }
        }

        return added;
    }

    private String deriveRelativePathFromSource(String sourcePath) {
        String norm = sourcePath.replace('\\', '/');
        String[] markers = new String[]{"/src/main/java/", "/src/test/java/", "/src/java/", "/src/"};
        for (String m : markers) {
            int idx = norm.indexOf(m);
            if (idx >= 0) return norm.substring(idx + m.length());
        }
        int j = norm.lastIndexOf("/java/");
        if (j >= 0 && j + 6 < norm.length()) return norm.substring(j + 6);
        return null;
    }

    private String normalizePath(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        String withFsSep = value.replace('/', File.separatorChar).replace('\\', File.separatorChar);
        // Avoid absolute path interpretation in File(child) on Windows when value starts with a separator.
        while (withFsSep.startsWith(String.valueOf(File.separatorChar))) {
            withFsSep = withFsSep.substring(1);
        }
        return withFsSep;
    }

    private String stripExtension(String name) {
        int i = name.lastIndexOf('.');
        return (i >= 0) ? name.substring(0, i) : name;
    }

    private void addIfNew(String path, List<String> out, Set<String> seen) {
        if (seen.add(path)) out.add(path);
    }
}
