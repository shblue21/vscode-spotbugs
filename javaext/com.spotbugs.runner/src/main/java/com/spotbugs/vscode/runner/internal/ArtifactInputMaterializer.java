package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CancellationException;
import org.eclipse.core.runtime.IProgressMonitor;

/** Explicit bytecode inputs never trigger source/output discovery. */
public final class ArtifactInputMaterializer {
    public List<String> resolveTargets(String path, IProgressMonitor monitor) {
        List<String> targets = new ArrayList<>();
        collect(new File(path), targets, monitor);
        return targets;
    }

    private void collect(File file, List<String> targets, IProgressMonitor monitor) {
        if (monitor != null && monitor.isCanceled()) throw new CancellationException("Command cancelled");
        if (java.nio.file.Files.isSymbolicLink(file.toPath())) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) collect(child, targets, monitor);
        } else if (file.isFile()) {
            String name = file.getName().toLowerCase(Locale.ROOT);
            if (name.endsWith(".class") || name.endsWith(".jar") || name.endsWith(".zip")) targets.add(file.getAbsolutePath());
        }
    }
}
