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
                collectClassFilesRecursively(f, targets, seen);
                continue;
            }
            if (p.endsWith(".class") || p.endsWith(".jar")) {
                if (f.exists() && f.isFile()) addIfNew(f.getAbsolutePath(), targets, seen);
                continue;
            }
            if (p.endsWith(".java")) {
                // Try to map source to output inside classpath directories
                String rel = deriveRelativeClassPathFromJava(p);
                if (rel != null) {
                    String classRel = rel.replace(File.separatorChar, '/').replace(".java", ".class");
                    for (File dir : classpathDirs) {
                        File candidate = new File(dir, classRel);
                        if (candidate.exists() && candidate.isFile()) {
                            addIfNew(candidate.getAbsolutePath(), targets, seen);
                            break;
                        }
                    }
                }
                if (targets.isEmpty()) {
                    // Fallback: basename scan
                    String baseName = stripExtension(new File(p).getName());
                    for (File dir : classpathDirs) {
                        collectClassFilesByBasename(dir, baseName, targets, seen);
                        if (!targets.isEmpty()) break;
                    }
                }
                continue;
            }
            // Unknown type: add existing file or scan directory
            if (f.exists()) {
                if (f.isFile()) addIfNew(f.getAbsolutePath(), targets, seen);
                else if (f.isDirectory()) collectClassFilesRecursively(f, targets, seen);
            }
        }
        return targets;
    }

    private void collectClassFilesRecursively(File dir, List<String> out, Set<String> seen) throws IOException {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File c : children) {
            if (c.isDirectory()) collectClassFilesRecursively(c, out, seen);
            else if (c.isFile() && c.getName().endsWith(".class")) addIfNew(c.getAbsolutePath(), out, seen);
            else if (c.isFile() && c.getName().endsWith(".jar")) addIfNew(c.getAbsolutePath(), out, seen);
        }
    }

    private void collectClassFilesByBasename(File dir, String baseName, List<String> out, Set<String> seen) throws IOException {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File c : children) {
            if (c.isDirectory()) collectClassFilesByBasename(c, baseName, out, seen);
            else if (c.isFile() && c.getName().equals(baseName + ".class")) addIfNew(c.getAbsolutePath(), out, seen);
        }
    }

    private String deriveRelativeClassPathFromJava(String javaPath) {
        String norm = javaPath.replace('\\', '/');
        String[] markers = new String[]{"/src/main/java/", "/src/test/java/", "/src/java/", "/src/"};
        for (String m : markers) {
            int idx = norm.indexOf(m);
            if (idx >= 0) return norm.substring(idx + m.length());
        }
        int j = norm.lastIndexOf("/java/");
        if (j >= 0 && j + 6 < norm.length()) return norm.substring(j + 6);
        return null;
    }

    private String stripExtension(String name) {
        int i = name.lastIndexOf('.');
        return (i >= 0) ? name.substring(0, i) : name;
    }

    private void addIfNew(String path, List<String> out, Set<String> seen) {
        if (seen.add(path)) out.add(path);
    }
}
