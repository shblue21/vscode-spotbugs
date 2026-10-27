package com.spotbugs.vscode.runner.internal;

import java.util.List;

/** Engine-independent paths prepared for one analysis. Contains no owned resources. */
public final class PreparedAnalysisInput {
    private final List<String> targets;
    private final List<String> sourcepaths;
    private final List<String> auxClasspaths;

    public PreparedAnalysisInput(List<String> targets, List<String> sourcepaths, List<String> auxClasspaths) {
        this.targets = List.copyOf(targets);
        this.sourcepaths = List.copyOf(sourcepaths);
        this.auxClasspaths = List.copyOf(auxClasspaths);
    }

    public List<String> getTargets() { return targets; }
    public List<String> getSourcepaths() { return sourcepaths; }
    public List<String> getAuxClasspaths() { return auxClasspaths; }
}
