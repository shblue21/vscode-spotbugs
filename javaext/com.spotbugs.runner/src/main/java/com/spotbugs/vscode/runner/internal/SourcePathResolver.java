package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.nio.file.InvalidPathException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import org.eclipse.core.runtime.IProgressMonitor;

public class SourcePathResolver {

    public String resolve(String realSourcePath, List<String> sourcepaths, String targetPath) {
        return resolve(realSourcePath, sourcepaths, targetPath, null);
    }

    public String resolve(String realSourcePath, List<String> sourcepaths, String targetPath, IProgressMonitor monitor) {
        checkCanceled(monitor);
        String safeRelativePath = SourcePathPolicy.relativeSourcePath(realSourcePath);
        if (safeRelativePath == null) {
            return null;
        }

        if (sourcepaths != null && !sourcepaths.isEmpty()) {
            for (String sourceRoot : sourcepaths) {
                checkCanceled(monitor);
                if (sourceRoot == null || sourceRoot.trim().isEmpty()) {
                    continue;
                }

                try {
                    Path normalizedRoot = Paths.get(sourceRoot).toAbsolutePath().normalize();
                    Path candidate = normalizedRoot.resolve(safeRelativePath).normalize();
                    if (candidate.startsWith(normalizedRoot) && Files.isRegularFile(candidate)) {
                        return candidate.toString();
                    }
                } catch (InvalidPathException ignored) {
                    // Ignore malformed configured source roots and try the next one.
                }
            }
        }

        if (targetPath != null && !targetPath.trim().isEmpty()) {
            File targetFile = new File(targetPath);
            if (targetFile.exists() && targetFile.isFile()) {
                String normalizedTarget = normalize(targetFile.getPath());
                String normalizedReal = normalize(safeRelativePath);
                if (normalizedTarget.endsWith(normalizedReal) ||
                    targetFile.getName().equals(new File(safeRelativePath).getName())) {
                    return targetFile.getAbsolutePath();
                }
            }
        }

        return null;
    }

    private static String normalize(String value) {
        return value.replace('\\', '/');
    }

    private static void checkCanceled(IProgressMonitor monitor) {
        if (monitor != null && monitor.isCanceled()) {
            throw new java.util.concurrent.CancellationException("Command cancelled");
        }
    }
}
