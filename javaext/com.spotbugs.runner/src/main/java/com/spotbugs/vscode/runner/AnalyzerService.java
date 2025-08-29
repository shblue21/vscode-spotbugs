package com.spotbugs.vscode.runner;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.config.UserPreferences;

public class AnalyzerService {

    private final FindBugs2 findBugs;
    private final UserPreferences userPreferences;
    private List<String> projectClasspaths;

    public AnalyzerService() {
        log("Service created.");
        this.userPreferences = UserPreferences.createDefaultUserPreferences();
        this.findBugs = new FindBugs2();
        this.findBugs.setUserPreferences(this.userPreferences);
    }

    private void log(String message) {
        System.out.println("[Spotbugs-Service] " + message);
    }

    @SuppressWarnings("unchecked")
    public void setConfiguration(Map<String, Object> config) {
        log("Setting configuration...");
        String effortRaw = (String) config.getOrDefault("effort", "default");
        String effort = effortRaw == null ? "default" : effortRaw.toLowerCase();
        if (!"min".equals(effort) && !"default".equals(effort) && !"max".equals(effort)) {
            effort = "default";
        }
        this.userPreferences.setEffort(effort);
        log("-> Effort set to: " + effort);

        this.projectClasspaths = (List<String>) config.get("classpaths");
        if (this.projectClasspaths != null) {
            log("-> Project classpaths provided: " + this.projectClasspaths.size() + " entries");
        } else {
            log("-> No project classpaths provided, will use system classpath as fallback");
        }
    }

    public String analyze(String... filePaths) {
        final long t0 = System.currentTimeMillis();
        try {
            if (filePaths == null || filePaths.length == 0) {
                log("-> Error: No files provided for analysis.");
                return "[]";
            }
            log("Requested analysis for: " + String.join(", ", filePaths));

            Project project = new Project();

            // Resolve inputs into concrete .class/.jar files
            List<String> targets = resolveAnalysisTargets(filePaths);
            if (targets.isEmpty()) {
                log("-> No analysis targets could be resolved from inputs; returning empty result.");
                return "[]";
            }
            log("Resolved " + targets.size() + " analysis target(s).");
            for (String t : targets) {
                project.addFile(t);
            }

            // Use project classpaths if available, otherwise fall back to system classpath
            if (this.projectClasspaths != null && !this.projectClasspaths.isEmpty()) {
                log("Using project classpaths for analysis");
                for (String classpathEntry : this.projectClasspaths) {
                    project.addAuxClasspathEntry(classpathEntry);
                }
            } else {
                log("Using system classpath as fallback");
                String classPath = System.getProperty("java.class.path");
                if (classPath != null) {
                    String[] pathElements = classPath.split(System.getProperty("path.separator"));
                    for (String element : pathElements) {
                        project.addAuxClasspathEntry(element);
                    }
                }
            }

            SimpleFindbugsExecutor executor = new SimpleFindbugsExecutor(this.findBugs, project);
            String result = executor.execute();
            final long t1 = System.currentTimeMillis();
            log("Analysis completed in " + (t1 - t0) + " ms.");
            return result;
        } catch (Exception e) {
            e.printStackTrace();
            return "[]";
        }
    }

    private List<String> resolveAnalysisTargets(String[] inputs) throws IOException {
        List<String> targets = new ArrayList<>();
        Set<String> seen = new HashSet<>();
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
                if (f.exists() && f.isFile()) {
                    addIfNew(f.getAbsolutePath(), targets, seen);
                }
                continue;
            }
            if (p.endsWith(".java")) {
                // Attempt to map source file to compiled class file using classpath directories
                List<File> cpDirs = classpathDirectories();
                String rel = deriveRelativeClassPathFromJava(p);
                if (rel != null) {
                    String classRel = rel.replace( File.separatorChar, '/') .replace(".java", ".class");
                    for (File dir : cpDirs) {
                        File candidate = new File(dir, classRel);
                        if (candidate.exists() && candidate.isFile()) {
                            addIfNew(candidate.getAbsolutePath(), targets, seen);
                            break;
                        }
                    }
                }
                // Fallback: scan classpath directories for matching classname if direct mapping failed
                if (targets.isEmpty()) {
                    String baseName = stripExtension(new File(p).getName());
                    for (File dir : classpathDirectories()) {
                        collectClassFilesByBasename(dir, baseName, targets, seen);
                        if (!targets.isEmpty()) {
                            break;
                        }
                    }
                }
                continue;
            }
            // Unknown file type; add if it exists
            if (f.exists()) {
                if (f.isFile()) {
                    addIfNew(f.getAbsolutePath(), targets, seen);
                } else if (f.isDirectory()) {
                    collectClassFilesRecursively(f, targets, seen);
                }
            }
        }
        return targets;
    }

    private List<File> classpathDirectories() {
        List<File> dirs = new ArrayList<>();
        if (this.projectClasspaths != null) {
            for (String cp : this.projectClasspaths) {
                if (cp == null) continue;
                File f = new File(cp);
                if (f.exists() && f.isDirectory()) {
                    dirs.add(f);
                }
            }
        }
        return dirs;
    }

    private void collectClassFilesRecursively(File dir, List<String> out, Set<String> seen) throws IOException {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File c : children) {
            if (c.isDirectory()) {
                collectClassFilesRecursively(c, out, seen);
            } else if (c.isFile() && c.getName().endsWith(".class")) {
                addIfNew(c.getAbsolutePath(), out, seen);
            } else if (c.isFile() && c.getName().endsWith(".jar")) {
                addIfNew(c.getAbsolutePath(), out, seen);
            }
        }
    }

    private void collectClassFilesByBasename(File dir, String baseName, List<String> out, Set<String> seen) throws IOException {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File c : children) {
            if (c.isDirectory()) {
                collectClassFilesByBasename(c, baseName, out, seen);
            } else if (c.isFile() && c.getName().equals(baseName + ".class")) {
                addIfNew(c.getAbsolutePath(), out, seen);
            }
        }
    }

    private String deriveRelativeClassPathFromJava(String javaPath) {
        String norm = javaPath.replace('\\', '/');
        String[] markers = new String[] {
                "/src/main/java/", "/src/test/java/", "/src/java/", "/src/" };
        for (String m : markers) {
            int idx = norm.indexOf(m);
            if (idx >= 0) {
                return norm.substring(idx + m.length());
            }
        }
        // Fallback: try segment after last '/java/' directory
        int j = norm.lastIndexOf("/java/");
        if (j >= 0 && j + 6 < norm.length()) {
            return norm.substring(j + 6);
        }
        return null;
    }

    private String stripExtension(String name) {
        int i = name.lastIndexOf('.');
        return (i >= 0) ? name.substring(0, i) : name;
    }

    private void addIfNew(String path, List<String> out, Set<String> seen) {
        if (seen.add(path)) {
            out.add(path);
        }
    }
}
