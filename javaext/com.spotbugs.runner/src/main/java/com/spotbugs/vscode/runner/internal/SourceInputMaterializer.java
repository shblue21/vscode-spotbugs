package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.io.IOException;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Optional;
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
public class SourceInputMaterializer {

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
        return resolveTargets(inputs, targetResolutionRootDirs, sourcepaths, Collections.emptyMap(), monitor);
    }

    public List<String> resolveTargets(
            String[] inputs,
            List<File> targetResolutionRootDirs,
            List<String> sourcepaths,
            Map<String, String> sourceOutputs,
            IProgressMonitor monitor
    ) throws IOException {
        List<String> targets = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        SourceFileCache sourceFiles = new SourceFileCache();
        List<SourceRoot> sourceRoots = normalizeSourceRoots(sourcepaths, sourceOutputs);
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
                boolean handledAsSource = collectOutputClassesForSourceDirectory(
                        p,
                        targetResolutionRootDirs,
                        sourceRoots,
                        sourceOutputs != null && !sourceOutputs.isEmpty(),
                        targets,
                        seen,
                        sourceFiles,
                        monitor
                );
                if (!handledAsSource) {
                    collectTargetsRecursively(f, targetResolutionRootDirs, sourceRoots, targets, seen, sourceFiles, monitor);
                }
                continue;
            }
            if (isAnalysisTargetFile(p)) {
                if (f.exists() && f.isFile()) addIfNew(f.getAbsolutePath(), targets, seen);
                continue;
            }
            if (isJavaSourceFile(p)) {
                addTargetsForJavaFile(p, targetResolutionRootDirs, sourceRoots, targets, seen, sourceFiles, monitor);
                continue;
            }
            // Unknown type: add existing file or scan directory
            if (f.exists()) {
                if (f.isFile()) addIfNew(f.getAbsolutePath(), targets, seen);
                else if (f.isDirectory()) collectTargetsRecursively(f, targetResolutionRootDirs, sourceRoots, targets, seen, sourceFiles, monitor);
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
            SourceFileCache sourceFiles,
            IProgressMonitor monitor
    ) throws IOException {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File c : children) {
            checkCanceled(monitor);
            if (c.isDirectory()) {
                collectTargetsRecursively(c, targetResolutionRootDirs, sourceRoots, out, seen, sourceFiles, monitor);
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
                addTargetsForJavaFile(c.getAbsolutePath(), targetResolutionRootDirs, sourceRoots, out, seen, sourceFiles, monitor);
                continue;
            }
        }
    }

    private boolean collectOutputClassesForSourceDirectory(
            String sourceDir,
            List<File> targetResolutionRootDirs,
            List<SourceRoot> sourceRoots,
            boolean sourceOutputsDeclared,
            List<String> out,
            Set<String> seen,
            SourceFileCache sourceFiles,
            IProgressMonitor monitor
    ) throws IOException {
        String relativeDir = deriveRelativeDirectoryPathFromSource(sourceDir, sourceRoots, monitor);
        boolean aggregateSourceRoots = relativeDir == null
                && sourceRoots != null
                && !sourceRoots.isEmpty()
                && sourceOutputsDeclared
                && !isInsideOutputRoot(sourceDir, targetResolutionRootDirs);
        if (relativeDir == null && !aggregateSourceRoots) {
            return false;
        }

        File sourceDirFile = new File(sourceDir);
        if (!aggregateSourceRoots && !containsJavaSourceRecursively(sourceDirFile, monitor)) {
            return false;
        }

        if (targetResolutionRootDirs == null || targetResolutionRootDirs.isEmpty()) {
            return true;
        }

        if (aggregateSourceRoots) {
            for (SourceRoot sourceRoot : sourceRoots) {
                checkCanceled(monitor);
                File sourceRootDir = sourceRoot.path.toFile();
                if (sourceRootDir.isDirectory()) {
                    collectMappedClassesForSourceTree(
                            sourceRootDir,
                            targetResolutionRootDirs,
                            sourceRoots,
                            out,
                            seen,
                            sourceFiles,
                            monitor
                    );
                }
            }
        } else if (relativeDir.isEmpty()) {
            collectMappedClassesForSourceTree(
                    sourceDirFile,
                    targetResolutionRootDirs,
                    sourceRoots,
                    out,
                    seen,
                    sourceFiles,
                    monitor
            );
        } else {
            List<File> selectedOutputs = targetResolutionRootDirs;
            Path selected = toNormalizedPath(sourceDir);
            for (SourceRoot root : sourceRoots) {
                if (selected != null && selected.startsWith(root.path)) {
                    if (root.outputRoot != null) {
                        selectedOutputs = Collections.singletonList(root.outputRoot.toFile());
                    }
                    break;
                }
            }
            for (File outputRoot : selectedOutputs) {
                checkCanceled(monitor);
                if (outputRoot == null) continue;
                File outputDir = new File(outputRoot, normalizePath(relativeDir));
                if (outputDir.isDirectory()) {
                    collectClassesForSelectedSources(sourceDirFile, outputDir, out, seen, sourceFiles, monitor);
                }
            }
            for (SourceRoot root : sourceRoots) {
                checkCanceled(monitor);
                if (selected != null && !root.path.equals(selected)
                        && root.path.startsWith(selected) && root.outputRoot != null) {
                    collectDeclaredSourceTree(root.path.toFile(), root, sourceRoots,
                            out, seen, sourceFiles, monitor);
                }
            }
        }
        return true;
    }

    /** Each declared descendant owns its walk; deeper roots are handled independently. */
    private void collectDeclaredSourceTree(File directory, SourceRoot owner,
            List<SourceRoot> roots, List<String> out, Set<String> seen,
            SourceFileCache sourceFiles, IProgressMonitor monitor) throws IOException {
        checkCanceled(monitor);
        Path location = directory.toPath().toAbsolutePath().normalize();
        for (SourceRoot root : roots) {
            if (location.startsWith(root.path)) {
                // In particular, do not enter a more specific root without a mapping.
                if (root != owner) return;
                break;
            }
        }
        File[] children = directory.listFiles();
        if (children == null) return;
        for (File child : children) {
            checkCanceled(monitor);
            if (child.isDirectory()) {
                collectDeclaredSourceTree(child, owner, roots, out, seen, sourceFiles, monitor);
            } else if (child.isFile() && isJavaSourceFile(child.getName())) {
                String relative = normalizeRelativePath(owner.path.relativize(child.toPath()
                        .toAbsolutePath().normalize()).toString());
                String classRelative = toClassRelativePath(relative);
                if (classRelative != null) {
                    addClassFamily(owner.outputRoot.toFile(), classRelative, out, seen, sourceFiles, monitor);
                }
            }
        }
    }

    private boolean isInsideOutputRoot(String sourceDir, List<File> outputRoots) {
        Path selected = toNormalizedPath(sourceDir);
        if (selected == null || outputRoots == null) {
            return false;
        }
        for (File outputRoot : outputRoots) {
            if (outputRoot == null) continue;
            Path root = toNormalizedPath(outputRoot.getAbsolutePath());
            if (root != null && selected.startsWith(root)) {
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
            SourceFileCache sourceFiles,
            IProgressMonitor monitor
    ) throws IOException {
        File[] children = sourceDir.listFiles();
        if (children == null) return;
        for (File c : children) {
            checkCanceled(monitor);
            if (c.isDirectory()) {
                collectMappedClassesForSourceTree(c, targetResolutionRootDirs, sourceRoots, out, seen, sourceFiles, monitor);
            } else if (c.isFile() && isJavaSourceFile(c.getName())) {
                addTargetsForJavaFile(c.getAbsolutePath(), targetResolutionRootDirs, sourceRoots, out, seen, sourceFiles, monitor);
            }
        }
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

    private void collectClassesForSelectedSources(
            File sourceDir,
            File outputDir,
            List<String> out,
            Set<String> seen,
            SourceFileCache sourceFiles,
            IProgressMonitor monitor
    ) {
        File[] children = outputDir.listFiles();
        if (children == null) return;
        for (File c : children) {
            checkCanceled(monitor);
            if (c.isDirectory()) {
                collectClassesForSelectedSources(
                        new File(sourceDir, c.getName()),
                        c,
                        out,
                        seen,
                        sourceFiles,
                        monitor
                );
                continue;
            }
            if (c.isFile() && isClassFile(c.getName())) {
                if (hasSelectedSource(c, sourceDir, sourceFiles, monitor)) {
                    addIfNew(c.getAbsolutePath(), out, seen);
                }
            }
        }
    }

    private boolean hasSelectedSource(File classFile, File sourceDir,
            SourceFileCache sourceFiles, IProgressMonitor monitor) {
        String sourceFileName = sourceFiles.read(classFile, monitor);
        return sourceFileName == null
                || !isJavaSourceFile(sourceFileName)
                || new File(sourceDir, sourceFileName).isFile();
    }

    private void addTargetsForJavaFile(
            String javaPath,
            List<File> targetResolutionRootDirs,
            List<SourceRoot> sourceRoots,
            List<String> out,
            Set<String> seen,
            SourceFileCache sourceFiles,
            IProgressMonitor monitor
    ) throws IOException {
        if (targetResolutionRootDirs == null || targetResolutionRootDirs.isEmpty()) return;
        SourceMatch match = deriveRelativePathFromSource(javaPath, sourceRoots, monitor);
        if (match == null) return;
        String classRel = toClassRelativePath(match.relativePath);
        if (classRel == null) return;
        List<File> outputRoots = match.outputRoot == null
                ? targetResolutionRootDirs
                : Collections.singletonList(match.outputRoot.toFile());
        for (File dir : outputRoots) {
            checkCanceled(monitor);
            if (dir != null && addClassFamily(dir, classRel, out, seen, sourceFiles, monitor)) return;
        }
    }

    private boolean addClassFamily(
            File outputRoot,
            String classRel,
            List<String> out,
            Set<String> seen,
            SourceFileCache sourceFiles,
            IProgressMonitor monitor
    ) {
        File anchor = new File(outputRoot, classRel);
        File packageDir = anchor.getParentFile();
        String anchorName = anchor.getName();
        String baseName = anchorName.substring(0, anchorName.length() - ".class".length());
        boolean found = anchor.isFile();
        if (found) addIfNew(anchor.getAbsolutePath(), out, seen);

        File[] siblings = packageDir != null ? packageDir.listFiles() : null;
        if (siblings == null) {
            return found;
        }

        List<File> nestedClasses = new ArrayList<>();
        String nestedPrefix = baseName + "$";
        for (File sibling : siblings) {
            checkCanceled(monitor);
            if (!sibling.isFile()) {
                continue;
            }
            String siblingName = sibling.getName();
            if (isClassFile(siblingName) && (
                    (anchor.isFile() && siblingName.startsWith(nestedPrefix))
                    || belongsToSource(sibling, baseName + ".java", sourceFiles, monitor))) {
                nestedClasses.add(sibling);
            }
        }
        nestedClasses.sort((a, b) -> a.getName().compareTo(b.getName()));
        for (File nestedClass : nestedClasses) {
            checkCanceled(monitor);
            addIfNew(nestedClass.getAbsolutePath(), out, seen);
            found = true;
        }
        return found;
    }

    private boolean belongsToSource(File classFile, String sourceName,
            SourceFileCache sourceFiles, IProgressMonitor monitor) {
        return sourceName.equals(sourceFiles.read(classFile, monitor));
    }

    String readSourceFile(File classFile) throws IOException {
        return SourcePathPolicy.sourceFileName(
                new ClassParser(classFile.getAbsolutePath()).parse().getSourceFileName());
    }

    /** Metadata only: callers retain their distinct treatment of unknown source names. */
    private final class SourceFileCache {
        private final Map<Path, Optional<String>> names = new HashMap<>();

        String read(File file, IProgressMonitor monitor) {
            checkCanceled(monitor);
            Path key = file.toPath().toAbsolutePath().normalize();
            Optional<String> name = names.get(key);
            if (name == null) {
                try {
                    name = Optional.ofNullable(readSourceFile(file));
                } catch (java.util.concurrent.CancellationException cancelled) {
                    throw cancelled;
                } catch (IOException | RuntimeException unreadable) {
                    name = Optional.empty();
                }
                checkCanceled(monitor);
                names.put(key, name);
            }
            return name.orElse(null);
        }
    }

    private SourceMatch deriveRelativePathFromSource(
            String sourcePath,
            List<SourceRoot> sourceRoots,
            IProgressMonitor monitor
    ) {
        Path source = toNormalizedPath(sourcePath);
        if (source != null && sourceRoots != null) {
            for (SourceRoot root : sourceRoots) {
                checkCanceled(monitor);
                if (!source.startsWith(root.path)) {
                    continue;
                }
                Path relative = root.path.relativize(source);
                String rel = normalizeRelativePath(relative.toString());
                return rel.isEmpty() ? null : new SourceMatch(rel, root.outputRoot);
            }
        }

        String markerCandidate = deriveRelativePathFromSource(sourcePath);
        return markerCandidate == null ? null
                : new SourceMatch(normalizeRelativePath(markerCandidate), null);
    }

    private String deriveRelativeDirectoryPathFromSource(
            String sourceDir,
            List<SourceRoot> sourceRoots,
            IProgressMonitor monitor
    ) {
        Path source = toNormalizedPath(sourceDir);
        if (source != null && sourceRoots != null) {
            for (SourceRoot root : sourceRoots) {
                checkCanceled(monitor);
                if (source.startsWith(root.path)) {
                    return normalizeRelativePath(root.path.relativize(source).toString());
                }
            }
        }
        return deriveRelativeDirectoryPathFromSource(sourceDir);
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
            if (norm.endsWith(marker)) {
                return "";
            }
        }
        int javaRootIndex = norm.lastIndexOf("/java/");
        if (javaRootIndex >= 0 && javaRootIndex + 6 < norm.length()) {
            return norm.substring(javaRootIndex + 6);
        }
        return norm.endsWith("/java") ? "" : null;
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

    private List<SourceRoot> normalizeSourceRoots(
            List<String> sourcepaths,
            Map<String, String> sourceOutputs
    ) {
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
                String output = sourceOutputs != null ? sourceOutputs.get(sourcepath) : null;
                roots.add(new SourceRoot(root, toNormalizedPath(output), index));
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
        private final Path outputRoot;
        private final int index;

        private SourceRoot(Path path, Path outputRoot, int index) {
            this.path = path;
            this.outputRoot = outputRoot;
            this.index = index;
        }
    }

    private static final class SourceMatch {
        private final String relativePath;
        private final Path outputRoot;

        private SourceMatch(String relativePath, Path outputRoot) {
            this.relativePath = relativePath;
            this.outputRoot = outputRoot;
        }
    }
}
