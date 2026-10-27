package com.spotbugs.vscode.runner.internal;

import java.util.List;
import java.util.Objects;

import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;
import com.spotbugs.vscode.runner.internal.config.PreferencesApplier;

import org.eclipse.core.runtime.IProgressMonitor;

import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.config.UserPreferences;

public class AnalyzerService {

    private final FindBugs2 findBugs;
    private final AnalysisConfig config;
    private int lastTargetCount = 0;
    private int lastTargetResolutionRootCount = 0;
    private int lastAuxClasspathCount = 0;

    public AnalyzerService(AnalysisConfig config) {
        this.config = Objects.requireNonNull(config, "config");
        UserPreferences userPreferences = UserPreferences.createDefaultUserPreferences();
        this.findBugs = new FindBugs2();
        this.findBugs.setUserPreferences(userPreferences);
        // Apply user preferences via dedicated applier
        new PreferencesApplier().apply(userPreferences, this.findBugs, config.getExecutionOptions());
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
        Project project = prepareAnalysis(monitor, selectedInputs);
        if (project == null) {
            return SpotBugsAnalysisResult.empty();
        }
        checkCanceled(monitor);
        SpotBugsAnalysisResult result = new SpotBugsExecutor(
                this.findBugs,
                project,
                this.config.getExecutionOptions().getRankThreshold(),
                this.config.getExecutionOptions().getConfidenceThreshold(),
                this.config.getExecutionOptions().getPlugins()
        ).executeBugsWithWarnings(monitor, includeBaselineXml);
        checkCanceled(monitor);
        List<BugInfo> bugs = result.getBugs();
        applyFullPaths(bugs, monitor, selectedInputs);
        return result;
    }

    private Project prepareAnalysis(IProgressMonitor monitor, AnalysisInput[] inputs) throws java.io.IOException {
        checkCanceled(monitor);
        this.lastTargetCount = 0;
        this.lastTargetResolutionRootCount = 0;
        this.lastAuxClasspathCount = 0;
        if (inputs.length == 0) {
            return null;
        }

        Project project = new Project();
        ClasspathConfigurer cpCfg = new ClasspathConfigurer();
        List<java.io.File> targetResolutionRootDirs = cpCfg.directoriesFrom(this.config.getTargetResolutionRoots());
        List<String> sourcepaths = this.config.getSourcepaths();
        project.addSourceDirs(sourcepaths);
        this.lastTargetResolutionRootCount = targetResolutionRootDirs.size();
        List<String> targets = new InputMaterializer().resolveTargets(
                inputs, targetResolutionRootDirs, sourcepaths,
                this.config.getSourceOutputs(), monitor);
        this.lastTargetCount = targets.size();
        if (targets.isEmpty()) {
            return null;
        }
        checkCanceled(monitor);
        for (String t : targets) {
            project.addFile(t);
        }
        List<String> auxClasspaths = cpCfg.buildEffectiveAuxClasspath(
                this.config.getRuntimeClasspaths(), this.config.getExtraAuxClasspaths());
        for (String entry : auxClasspaths) {
            project.addAuxClasspathEntry(entry);
        }
        this.lastAuxClasspathCount = auxClasspaths.size();
        return project;
    }

    private void applyFullPaths(List<BugInfo> bugs, IProgressMonitor monitor, AnalysisInput[] inputs) {
        if (bugs == null || bugs.isEmpty()) {
            return;
        }
        List<String> sourcepaths = this.config.getSourcepaths();
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
