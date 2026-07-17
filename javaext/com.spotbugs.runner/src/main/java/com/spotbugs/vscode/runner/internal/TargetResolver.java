package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.io.IOException;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.apache.bcel.classfile.ClassParser;
import org.eclipse.core.runtime.IProgressMonitor;

/**
 * Resolves input paths (.java/.class/.jar/.zip/directories) into concrete analysis targets
 * (.class, .jar, and .zip files). Uses target-resolution root directories to map sources to outputs.
 */
public class TargetResolver {

    public List<String> resolveTargets(String[] inputs, List<File> targetResolutionRootDirs) throws IOException {
        return resolveTargets(inputs, targetResolutionRootDirs, null);
    }

    public List<String> resolveTargets(String[] inputs, List<File> targetResolutionRootDirs, IProgressMonitor monitor) throws IOException {
        return resolveTargets(inputs, targetResolutionRootDirs, null, monitor);
    }

    public List<String> resolveTargets(
            String[] inputs,
            List<File> targetResolutionRootDirs,
            List<String> sourcepaths,
            IProgressMonitor monitor
    ) throws IOException {
        List<String> targets = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Map<String, String> sourceFileNames = new HashMap<>();
        List<SourceRoot> sourceRoots = normalizeSourceRoots(sourcepaths);
        if (inputs == null) {
            return targets;
        }
        for (String p : inputs) {
            checkCanceled(monitor);
            if (p == null || p.trim().isEmpty()) {
                continue;
            }
            File f = new File(p);
            if (f.isDirectory()) {
                // If a source directory is selected, map it to an output directory first.
                SourceDirectoryResolution sourceDirectoryResolution = collectOutputClassesForSourceDirectory(
                        p,
                        targetResolutionRootDirs,
                        sourceRoots,
                        targets,
                        seen,
                        sourceFileNames,
                        monitor
                );
                if (sourceDirectoryResolution == SourceDirectoryResolution.NOT_SOURCE_DIRECTORY) {
                    collectTargetsRecursively(f, targetResolutionRootDirs, sourceRoots, targets, seen, sourceFileNames, monitor);
                }
                continue;
            }
            if (isAnalysisTargetFile(p)) {
                if (f.exists() && f.isFile()) addIfNew(f.getAbsolutePath(), targets, seen);
                continue;
            }
            if (isJavaSourceFile(p)) {
                addTargetsForJavaFile(p, targetResolutionRootDirs, sourceRoots, targets, seen, sourceFileNames, monitor);
                continue;
            }
            // Unknown type: add existing file or scan directory
            if (f.exists()) {
                if (f.isFile()) addIfNew(f.getAbsolutePath(), targets, seen);
                else if (f.isDirectory()) collectTargetsRecursively(f, targetResolutionRootDirs, sourceRoots, targets, seen, sourceFileNames, monitor);
            }
        }
        return targets;
    }

    private void collectTargetsRecursively(
            File dir,
            List<File> targetResolutionRootDirs,
            List<SourceRoot> sourceRoots,
            List<String> out,
            Set<String> seen,
            Map<String, String> sourceFileNames,
            IProgressMonitor monitor
    ) throws IOException {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File c : children) {
            checkCanceled(monitor);
            if (c.isDirectory()) {
                collectTargetsRecursively(c, targetResolutionRootDirs, sourceRoots, out, seen, sourceFileNames, monitor);
                continue;
            }
            if (!c.isFile()) {
                continue;
            }
            String name = c.getName();
            if (isAnalysisTargetFile(name)) {
                addIfNew(c.getAbsolutePath(), out, seen);
                continue;
            }
            if (isJavaSourceFile(name)) {
                addTargetsForJavaFile(c.getAbsolutePath(), targetResolutionRootDirs, sourceRoots, out, seen, sourceFileNames, monitor);
                continue;
            }
        }
    }

    private SourceDirectoryResolution collectOutputClassesForSourceDirectory(
            String sourceDir,
            List<File> targetResolutionRootDirs,
            List<SourceRoot> sourceRoots,
            List<String> out,
            Set<String> seen,
            Map<String, String> sourceFileNames,
            IProgressMonitor monitor
    ) throws IOException {
        List<SourceDirectoryMatch> sourceDirectoryMatches = deriveRelativeDirectoryMatchesFromSource(sourceDir, sourceRoots, monitor);
        if (sourceDirectoryMatches.isEmpty()) {
            return SourceDirectoryResolution.NOT_SOURCE_DIRECTORY;
        }

        File sourceDirFile = new File(sourceDir);
        if (!containsJavaSourceRecursively(sourceDirFile, monitor)) {
            return SourceDirectoryResolution.NOT_SOURCE_DIRECTORY;
        }

        boolean sourceDirectoryMatched = false;
        for (SourceDirectoryMatch match : sourceDirectoryMatches) {
            sourceDirectoryMatched = true;
            if (targetResolutionRootDirs == null || targetResolutionRootDirs.isEmpty()) {
                continue;
            }

            boolean addedForRelative = false;
            String relDir = normalizePath(match.relativePath);
            if (relDir.isEmpty()) {
                int before = out.size();
                collectMappedClassesForSourceTree(
                        sourceDirFile,
                        targetResolutionRootDirs,
                        sourceRoots,
                        out,
                        seen,
                        sourceFileNames,
                        monitor
                );
                if (out.size() > before) {
                    addedForRelative = true;
                }
            }
            else {
                for (File dir : targetResolutionRootDirs) {
                    checkCanceled(monitor);
                    if (dir == null) continue;
                    File candidate = new File(dir, relDir);
                    if (candidate.exists() && candidate.isDirectory()) {
                        int before = out.size();
                        collectClassFilesRecursively(candidate, out, seen, monitor);
                        if (out.size() > before) {
                            addedForRelative = true;
                        }
                    }
                }
            }
            if (addedForRelative) {
                return SourceDirectoryResolution.SOURCE_DIRECTORY_WITH_OUTPUTS;
            }
        }
        return sourceDirectoryMatched
                ? SourceDirectoryResolution.SOURCE_DIRECTORY_NO_OUTPUTS
                : SourceDirectoryResolution.NOT_SOURCE_DIRECTORY;
    }

    private boolean containsJavaSourceRecursively(File dir, IProgressMonitor monitor) {
        File[] children = dir.listFiles();
        if (children == null) return false;
        for (File c : children) {
            checkCanceled(monitor);
            if (c.isDirectory()) {
                if (containsJavaSourceRecursively(c, monitor)) {
                    return true;
                }
                continue;
            }
            if (c.isFile() && isJavaSourceFile(c.getName())) {
                return true;
            }
        }
        return false;
    }

    private void collectMappedClassesForSourceTree(
            File sourceDir,
            List<File> targetResolutionRootDirs,
            List<SourceRoot> sourceRoots,
            List<String> out,
            Set<String> seen,
            Map<String, String> sourceFileNames,
            IProgressMonitor monitor
    ) throws IOException {
        File[] children = sourceDir.listFiles();
        if (children == null) return;
        for (File c : children) {
            checkCanceled(monitor);
            if (c.isDirectory()) {
                collectMappedClassesForSourceTree(c, targetResolutionRootDirs, sourceRoots, out, seen, sourceFileNames, monitor);
                continue;
            }
            if (c.isFile() && isJavaSourceFile(c.getName())) {
                addTargetsForJavaFile(c.getAbsolutePath(), targetResolutionRootDirs, sourceRoots, out, seen, sourceFileNames, monitor);
            }
        }
    }

    private void collectClassFilesRecursively(
            File dir,
            List<String> out,
            Set<String> seen,
            IProgressMonitor monitor
    ) {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File c : children) {
            checkCanceled(monitor);
            if (c.isDirectory()) {
                collectClassFilesRecursively(c, out, seen, monitor);
                continue;
            }
            if (c.isFile() && isClassFile(c.getName())) {
                addIfNew(c.getAbsolutePath(), out, seen);
            }
        }
    }

    private boolean addTargetsForJavaFile(
            String javaPath,
            List<File> targetResolutionRootDirs,
            List<SourceRoot> sourceRoots,
            List<String> out,
            Set<String> seen,
            Map<String, String> sourceFileNames,
            IProgressMonitor monitor
    ) throws IOException {
        boolean added = false;
        if (targetResolutionRootDirs != null && !targetResolutionRootDirs.isEmpty()) {
            for (String rel : deriveRelativePathsFromSource(javaPath, sourceRoots, monitor)) {
                String classRel = toClassRelativePath(rel);
                if (classRel == null) {
                    continue;
                }
                boolean ambiguousSourceFileName = hasSameRelativeSourceInAnotherRoot(
                        javaPath,
                        rel,
                        sourceRoots,
                        monitor
                );
                for (File dir : targetResolutionRootDirs) {
                    checkCanceled(monitor);
                    if (dir == null) continue;
                    if (addClassFamily(
                            dir,
                            classRel,
                            new File(javaPath).getName(),
                            ambiguousSourceFileName,
                            out,
                            seen,
                            sourceFileNames,
                            monitor
                    )) {
                        added = true;
                        break;
                    }
                }
                if (added) {
                    break;
                }
            }
        }

        return added;
    }

    private boolean addClassFamily(
            File outputRoot,
            String classRel,
            String sourceFileName,
            boolean ambiguousSourceFileName,
            List<String> out,
            Set<String> seen,
            Map<String, String> sourceFileNames,
            IProgressMonitor monitor
    ) {
        File anchor = new File(outputRoot, classRel);
        if (!anchor.exists() || !anchor.isFile()) {
            return false;
        }

        File packageDir = anchor.getParentFile();
        String anchorName = anchor.getName();
        String baseName = anchorName.substring(0, anchorName.length() - ".class".length());
        addIfNew(anchor.getAbsolutePath(), out, seen);

        File[] siblings = packageDir != null ? packageDir.listFiles() : null;
        if (siblings == null) {
            return true;
        }

        List<File> sourceClasses = new ArrayList<>();
        String nestedPrefix = baseName + "$";
        for (File sibling : siblings) {
            checkCanceled(monitor);
            if (!sibling.isFile() || !sibling.getName().endsWith(".class")) {
                continue;
            }
            String siblingName = sibling.getName();
            String siblingSourceFileName = readSourceFileName(sibling, sourceFileNames);
            if (
                    (!ambiguousSourceFileName && sourceFileName.equals(siblingSourceFileName)) ||
                    (siblingName.startsWith(nestedPrefix) &&
                            (ambiguousSourceFileName || siblingSourceFileName == null))
            ) {
                sourceClasses.add(sibling);
            }
        }
        sourceClasses.sort((a, b) -> a.getName().compareTo(b.getName()));
        for (File sourceClass : sourceClasses) {
            checkCanceled(monitor);
            addIfNew(sourceClass.getAbsolutePath(), out, seen);
        }
        return true;
    }

    private String readSourceFileName(File classFile, Map<String, String> sourceFileNames) {
        String classPath = classFile.getAbsolutePath();
        if (sourceFileNames.containsKey(classPath)) {
            return sourceFileNames.get(classPath);
        }
        String sourceFileName = null;
        try {
            sourceFileName = new ClassParser(classPath).parse().getSourceFileName();
            if ("<Unknown>".equals(sourceFileName)) {
                sourceFileName = null;
            }
        } catch (IOException | RuntimeException ignored) {
            // A malformed or concurrently-written sibling class is handled by the legacy name fallback.
        }
        sourceFileNames.put(classPath, sourceFileName);
        return sourceFileName;
    }

    private boolean hasSameRelativeSourceInAnotherRoot(
            String sourcePath,
            String relativePath,
            List<SourceRoot> sourceRoots,
            IProgressMonitor monitor
    ) {
        Path source = toNormalizedPath(sourcePath);
        if (source == null || sourceRoots == null) {
            return false;
        }
        String normalizedRelativePath = normalizePath(relativePath);
        for (SourceRoot root : sourceRoots) {
            checkCanceled(monitor);
            Path candidate = root.path.resolve(normalizedRelativePath).normalize();
            if (
                    candidate.startsWith(root.path) &&
                    !candidate.equals(source) &&
                    candidate.toFile().isFile()
            ) {
                return true;
            }
        }
        return false;
    }

    private List<String> deriveRelativePathsFromSource(
            String sourcePath,
            List<SourceRoot> sourceRoots,
            IProgressMonitor monitor
    ) {
        LinkedHashSet<String> candidates = new LinkedHashSet<>();
        Path source = toNormalizedPath(sourcePath);
        if (source != null && sourceRoots != null) {
            for (SourceRoot root : sourceRoots) {
                checkCanceled(monitor);
                if (!source.startsWith(root.path)) {
                    continue;
                }
                Path relative = root.path.relativize(source);
                String rel = normalizeRelativePath(relative.toString());
                if (!rel.isEmpty()) {
                    candidates.add(rel);
                }
                return new ArrayList<>(candidates);
            }
        }

        String markerCandidate = deriveRelativePathFromSource(sourcePath);
        if (markerCandidate == null) {
            return new ArrayList<>();
        }
        candidates.add(normalizeRelativePath(markerCandidate));
        return new ArrayList<>(candidates);
    }

    private List<SourceDirectoryMatch> deriveRelativeDirectoryMatchesFromSource(
            String sourceDir,
            List<SourceRoot> sourceRoots,
            IProgressMonitor monitor
    ) {
        List<SourceDirectoryMatch> candidates = new ArrayList<>();
        Path source = toNormalizedPath(sourceDir);
        if (source != null && sourceRoots != null) {
            for (SourceRoot root : sourceRoots) {
                checkCanceled(monitor);
                if (!source.startsWith(root.path)) {
                    continue;
                }
                Path relative = root.path.relativize(source);
                candidates.add(new SourceDirectoryMatch(
                        normalizeRelativePath(relative.toString())
                ));
                return candidates;
            }
        }

        String markerCandidate = deriveRelativeDirectoryPathFromSource(sourceDir);
        if (markerCandidate == null) {
            return candidates;
        }
        candidates.add(new SourceDirectoryMatch(
                normalizeRelativePath(markerCandidate)
        ));
        return candidates;
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

    private String deriveRelativeDirectoryPathFromSource(String sourceDir) {
        String norm = normalizeSourceDirectoryPath(sourceDir);
        String[] markers = new String[]{"/src/main/java", "/src/test/java", "/src/java", "/src"};
        for (String marker : markers) {
            String markerWithChild = marker + "/";
            int markerWithChildIndex = norm.indexOf(markerWithChild);
            if (markerWithChildIndex >= 0) {
                return norm.substring(markerWithChildIndex + markerWithChild.length());
            }
            int exactMarkerIndex = norm.indexOf(marker);
            if (exactMarkerIndex >= 0 && exactMarkerIndex + marker.length() == norm.length()) {
                return "";
            }
        }
        int javaRootIndex = norm.lastIndexOf("/java/");
        if (javaRootIndex >= 0 && javaRootIndex + 6 < norm.length()) {
            return norm.substring(javaRootIndex + 6);
        }
        if (norm.endsWith("/java")) {
            return "";
        }
        return null;
    }

    private String normalizeSourceDirectoryPath(String sourceDir) {
        String norm = sourceDir.replace('\\', '/');
        while (norm.endsWith("/.")) {
            norm = norm.substring(0, norm.length() - 2);
        }
        while (norm.endsWith("/") && norm.length() > 1) {
            norm = norm.substring(0, norm.length() - 1);
        }
        return norm;
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

    private String normalizeRelativePath(String value) {
        String normalized = normalizePath(value);
        if (normalized.isEmpty()) {
            return "";
        }
        try {
            String relative = Paths.get(normalized).normalize().toString();
            if (".".equals(relative)) {
                return "";
            }
            return relative.replace(File.separatorChar, '/');
        } catch (InvalidPathException ex) {
            return normalized.replace(File.separatorChar, '/');
        }
    }

    private String toClassRelativePath(String sourceRelativePath) {
        String rel = normalizePath(sourceRelativePath);
        if (!rel.toLowerCase(Locale.ROOT).endsWith(".java")) {
            return null;
        }
        return rel.substring(0, rel.length() - ".java".length()) + ".class";
    }

    private Path toNormalizedPath(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        try {
            return Paths.get(value.trim()).toAbsolutePath().normalize();
        } catch (InvalidPathException ex) {
            return null;
        }
    }

    private List<SourceRoot> normalizeSourceRoots(List<String> sourcepaths) {
        List<SourceRoot> roots = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        if (sourcepaths == null) {
            return roots;
        }
        int index = 0;
        for (String sourcepath : sourcepaths) {
            Path root = toNormalizedPath(sourcepath);
            if (root == null) {
                index++;
                continue;
            }
            String key = root.toString();
            if (seen.add(key)) {
                roots.add(new SourceRoot(root, index));
            }
            index++;
        }
        roots.sort((a, b) -> {
            int lengthCompare = Integer.compare(b.path.toString().length(), a.path.toString().length());
            return lengthCompare != 0 ? lengthCompare : Integer.compare(a.index, b.index);
        });
        return roots;
    }

    private boolean isAnalysisTargetFile(String name) {
        if (name == null) {
            return false;
        }
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".class") || lower.endsWith(".jar") || lower.endsWith(".zip");
    }

    private boolean isClassFile(String name) {
        return name != null && name.toLowerCase(Locale.ROOT).endsWith(".class");
    }

    private boolean isJavaSourceFile(String name) {
        return name != null && name.toLowerCase(Locale.ROOT).endsWith(".java");
    }

    private void addIfNew(String path, List<String> out, Set<String> seen) {
        if (seen.add(path)) out.add(path);
    }

    private static void checkCanceled(IProgressMonitor monitor) {
        if (monitor != null && monitor.isCanceled()) {
            throw new java.util.concurrent.CancellationException("Command cancelled");
        }
    }

    private static final class SourceRoot {
        private final Path path;
        private final int index;

        private SourceRoot(Path path, int index) {
            this.path = path;
            this.index = index;
        }
    }

    private static final class SourceDirectoryMatch {
        private final String relativePath;

        private SourceDirectoryMatch(String relativePath) {
            this.relativePath = relativePath;
        }
    }

    private enum SourceDirectoryResolution {
        NOT_SOURCE_DIRECTORY,
        SOURCE_DIRECTORY_NO_OUTPUTS,
        SOURCE_DIRECTORY_WITH_OUTPUTS
    }
}
