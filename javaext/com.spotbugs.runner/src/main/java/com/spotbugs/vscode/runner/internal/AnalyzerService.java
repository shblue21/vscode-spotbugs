package com.spotbugs.vscode.runner.internal;

import java.util.List;
import java.util.Objects;

import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;

import org.eclipse.core.runtime.IProgressMonitor;

/** Coordinates input preparation, execution, and source location enrichment. */
public class AnalyzerService {

    private final AnalysisConfig config;
    private int lastTargetCount = 0;
    private int lastTargetResolutionRootCount = 0;
    private int lastAuxClasspathCount = 0;

    public AnalyzerService(AnalysisConfig config) {
        this.config = Objects.requireNonNull(config, "config");
    }

    public AnalysisPreparationStats getPreparationStats() {
        return new AnalysisPreparationStats(lastTargetCount, lastTargetResolutionRootCount, lastAuxClasspathCount);
    }

    public SpotBugsAnalysisResult analyzeToBugsWithWarnings(
            IProgressMonitor monitor,
            boolean includeBaselineXml,
            AnalysisInput[] inputs
    ) throws java.io.IOException, InterruptedException {
        AnalysisInput[] selectedInputs = inputs.clone();
        PreparedAnalysisInput prepared = prepareAnalysis(monitor, selectedInputs);
        if (prepared == null) {
            return SpotBugsAnalysisResult.empty();
        }
        checkCanceled(monitor);
        SpotBugsAnalysisResult result = new SpotBugsExecutor().execute(
                prepared, config.getExecutionOptions(), monitor, includeBaselineXml);
        checkCanceled(monitor);
        List<BugInfo> bugs = result.getBugs();
        applyFullPaths(bugs, monitor, selectedInputs);
        return result;
    }

    private PreparedAnalysisInput prepareAnalysis(IProgressMonitor monitor, AnalysisInput[] inputs) throws java.io.IOException {
        checkCanceled(monitor);
        this.lastTargetCount = 0;
        this.lastTargetResolutionRootCount = 0;
        this.lastAuxClasspathCount = 0;
        if (inputs.length == 0) {
            return null;
        }

        ClasspathConfigurer cpCfg = new ClasspathConfigurer();
        List<java.io.File> targetResolutionRootDirs = cpCfg.directoriesFrom(config.getTargetResolutionRoots());
        List<String> sourcepaths = config.getSourcepaths();
        this.lastTargetResolutionRootCount = targetResolutionRootDirs.size();
        List<String> targets = new InputMaterializer().resolveTargets(
                inputs, targetResolutionRootDirs, sourcepaths,
                config.getSourceOutputs(), monitor);
        this.lastTargetCount = targets.size();
        if (targets.isEmpty()) {
            return null;
        }
        checkCanceled(monitor);
        List<String> auxClasspaths = cpCfg.buildEffectiveAuxClasspath(
                config.getRuntimeClasspaths(), config.getExtraAuxClasspaths());
        this.lastAuxClasspathCount = auxClasspaths.size();
        return new PreparedAnalysisInput(targets, sourcepaths, auxClasspaths);
    }

    private void applyFullPaths(List<BugInfo> bugs, IProgressMonitor monitor, AnalysisInput[] inputs) {
        if (bugs == null || bugs.isEmpty()) {
            return;
        }
        List<String> sourcepaths = config.getSourcepaths();
        SourcePathResolver resolver = new SourcePathResolver();
        for (BugInfo bug : bugs) {
            checkCanceled(monitor);
            if (bug == null) {
                continue;
            }
            if (bug.getFullPath() != null && !bug.getFullPath().isEmpty()) {
                continue;
            }
            for (AnalysisInput input : inputs) {
                String fullPath = resolver.resolve(bug.getRealSourcePath(), sourcepaths, input.path, monitor);
                if (fullPath != null && !fullPath.isEmpty()) {
                    bug.setFullPath(fullPath);
                    break;
                }
            }
        }
    }

    private static void checkCanceled(IProgressMonitor monitor) {
        if (monitor != null && monitor.isCanceled()) {
            throw new java.util.concurrent.CancellationException("Command cancelled");
        }
    }

}
