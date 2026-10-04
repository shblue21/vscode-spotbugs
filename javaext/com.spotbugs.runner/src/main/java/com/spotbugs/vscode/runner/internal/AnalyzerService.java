package com.spotbugs.vscode.runner.internal;

import java.util.List;

import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;
import com.spotbugs.vscode.runner.internal.config.PreferencesApplier;

import org.eclipse.core.runtime.IProgressMonitor;

import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.config.UserPreferences;

public class AnalyzerService {

    private final FindBugs2 findBugs;
    private final UserPreferences userPreferences;
    private List<String> targetResolutionRoots;
    private List<String> runtimeClasspaths;
    private List<String> extraAuxClasspaths;
    private AnalysisConfig config;
    private int lastTargetCount = 0;
    private int lastTargetResolutionRootCount = 0;
    private int lastAuxClasspathCount = 0;

    public AnalyzerService() {
        this.userPreferences = UserPreferences.createDefaultUserPreferences();
        this.findBugs = new FindBugs2();
        this.findBugs.setUserPreferences(this.userPreferences);
    }

    public void setConfiguration(AnalysisConfig cfg) {
        this.config = cfg;
        // Apply user preferences via dedicated applier
        new PreferencesApplier().apply(this.userPreferences, this.findBugs, cfg);
        this.targetResolutionRoots = cfg != null
                ? cfg.getTargetResolutionRoots()
                : java.util.Collections.emptyList();
        this.runtimeClasspaths = cfg != null
                ? cfg.getRuntimeClasspaths()
                : java.util.Collections.emptyList();
        this.extraAuxClasspaths = cfg != null
                ? cfg.getExtraAuxClasspaths()
                : java.util.Collections.emptyList();
    }

    public int getLastTargetCount() {
        return lastTargetCount;
    }

    public int getLastTargetResolutionRootCount() {
        return lastTargetResolutionRootCount;
    }

    public int getLastAuxClasspathCount() {
        return lastAuxClasspathCount;
    }

    public SpotBugsAnalysisResult analyzeToBugsWithWarnings(
            IProgressMonitor monitor,
            boolean includeBaselineXml,
            AnalysisInput[] inputs
    ) throws java.io.IOException, InterruptedException {
        AnalysisInput[] selectedInputs = inputs.clone();
        PreparedAnalysis prepared = prepareAnalysis(monitor, selectedInputs);
        if (prepared == null) {
            return SpotBugsAnalysisResult.empty();
        }
        checkCanceled(monitor);
        SpotBugsAnalysisResult result = new SpotBugsExecutor(
                this.findBugs,
                prepared.project,
                prepared.rankThreshold,
                this.config != null ? this.config.getConfidenceThreshold() : null,
                prepared.plugins
        ).executeBugsWithWarnings(monitor, includeBaselineXml);
        checkCanceled(monitor);
        List<BugInfo> bugs = result.getBugs();
        applyFullPaths(bugs, monitor, selectedInputs);
        return result;
    }

    private PreparedAnalysis prepareAnalysis(IProgressMonitor monitor, AnalysisInput[] inputs) throws java.io.IOException {
        checkCanceled(monitor);
        this.lastTargetCount = 0;
        this.lastTargetResolutionRootCount = 0;
        this.lastAuxClasspathCount = 0;
        if (inputs.length == 0) {
            return null;
        }

        Project project = new Project();
        ClasspathConfigurer cpCfg = new ClasspathConfigurer();
        List<java.io.File> targetResolutionRootDirs = cpCfg.directoriesFrom(this.targetResolutionRoots);
        List<String> sourcepaths = this.config != null
                ? this.config.getSourcepaths()
                : java.util.Collections.emptyList();
        project.addSourceDirs(sourcepaths);
        this.lastTargetResolutionRootCount = targetResolutionRootDirs.size();
        List<String> targets = new InputMaterializer().resolveTargets(
                inputs, targetResolutionRootDirs, sourcepaths,
                this.config != null ? this.config.getSourceOutputs() : java.util.Collections.emptyMap(), monitor);
        this.lastTargetCount = targets.size();
        if (targets.isEmpty()) {
            return null;
        }
        checkCanceled(monitor);
        for (String t : targets) {
            project.addFile(t);
        }
        ClasspathConfigurer.AppliedAuxClasspath appliedAuxClasspath = cpCfg.apply(
                project,
                this.runtimeClasspaths,
                this.extraAuxClasspaths
        );
        this.lastAuxClasspathCount = appliedAuxClasspath.getEntryCount();
        Integer rankThreshold = this.config != null ? this.config.getPriorityThreshold() : null;
        java.util.List<String> plugins = this.config != null
                ? this.config.getPlugins()
                : java.util.Collections.emptyList();
        return new PreparedAnalysis(project, rankThreshold, plugins);
    }

    private void applyFullPaths(List<BugInfo> bugs, IProgressMonitor monitor, AnalysisInput[] inputs) {
        if (bugs == null || bugs.isEmpty()) {
            return;
        }
        List<String> sourcepaths = this.config != null ? this.config.getSourcepaths() : java.util.Collections.emptyList();
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

    private static final class PreparedAnalysis {
        private final Project project;
        private final Integer rankThreshold;
        private final List<String> plugins;

        private PreparedAnalysis(Project project, Integer rankThreshold, List<String> plugins) {
            this.project = project;
            this.rankThreshold = rankThreshold;
            this.plugins = plugins;
        }
    }

}
