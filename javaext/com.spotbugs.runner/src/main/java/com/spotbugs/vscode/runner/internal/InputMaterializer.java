package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.eclipse.core.runtime.IProgressMonitor;

public final class InputMaterializer {
    public List<String> resolveTargets(AnalysisInput[] inputs, List<File> outputs,
            List<String> sources, Map<String, String> sourceOutputs, IProgressMonitor monitor) throws IOException {
        LinkedHashSet<String> targets = new LinkedHashSet<>();
        SourceInputMaterializer source = new SourceInputMaterializer();
        ArtifactInputMaterializer artifact = new ArtifactInputMaterializer();
        for (AnalysisInput input : inputs) {
            targets.addAll(input.kind == AnalysisInput.Kind.SOURCE
                    ? source.resolveTargets(new String[] { input.path }, outputs, sources, sourceOutputs, monitor)
                    : artifact.resolveTargets(input.path, monitor));
        }
        return new ArrayList<>(targets);
    }
}
