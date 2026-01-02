package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.util.List;

public class SourcePathResolver {

    public String resolve(String realSourcePath, List<String> sourcepaths, String targetPath) {
        if (realSourcePath == null || realSourcePath.trim().isEmpty()) {
            return null;
        }

        File realFile = new File(realSourcePath);
        if (realFile.isAbsolute() && realFile.exists()) {
            return realFile.getAbsolutePath();
        }

        if (sourcepaths != null && !sourcepaths.isEmpty()) {
            for (String sourceRoot : sourcepaths) {
                if (sourceRoot == null || sourceRoot.trim().isEmpty()) {
                    continue;
                }
                File candidate = new File(sourceRoot, realSourcePath);
                if (candidate.exists() && candidate.isFile()) {
                    return candidate.getAbsolutePath();
                }
            }
        }

        if (targetPath != null && !targetPath.trim().isEmpty()) {
            File targetFile = new File(targetPath);
            if (targetFile.exists() && targetFile.isFile()) {
                String normalizedTarget = normalize(targetFile.getPath());
                String normalizedReal = normalize(realSourcePath);
                if (normalizedTarget.endsWith(normalizedReal) ||
                    targetFile.getName().equals(new File(realSourcePath).getName())) {
                    return targetFile.getAbsolutePath();
                }
            }
        }

        return null;
    }

    private static String normalize(String value) {
        return value.replace('\\', '/');
    }
}
