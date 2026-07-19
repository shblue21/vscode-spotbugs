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

    public List<BugInfo> analyzeToBugs(String... filePaths) throws java.io.IOException, InterruptedException {
        return analyzeToBugs(null, filePaths);
    }

    public List<BugInfo> analyzeToBugs(IProgressMonitor monitor, String... filePaths)
            throws java.io.IOException, InterruptedException {
        return analyzeToBugsWithWarnings(monitor, filePaths).getBugs();
    }

    public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, String... filePaths)
            throws java.io.IOException, InterruptedException {
        PreparedAnalysis prepared = prepareAnalysis(monitor, filePaths);
        if (prepared == null) {
            return SpotBugsAnalysisResult.empty();
        }
        SpotBugsRunner runner = new SpotBugsRunner();
        checkCanceled(monitor);
        SpotBugsAnalysisResult result = runner.runWithWarnings(
                this.findBugs,
                prepared.project,
                prepared.rankThreshold,
                prepared.plugins,
                monitor
        );
        checkCanceled(monitor);
        List<BugInfo> bugs = result.getBugs();
        applyFullPaths(bugs, monitor, filePaths);
        return new SpotBugsAnalysisResult(
                bugs,
                result.getWarnings(),
                result.getReportSummary(),
                result.getNativeSarif()
        );
    }

    public String analyzeToNativeSarif(String... filePaths) {
        return analyzeToNativeSarif(null, filePaths);
    }

    public String analyzeToNativeSarif(IProgressMonitor monitor, String... filePaths) {
        try {
            PreparedAnalysis prepared = prepareAnalysis(monitor, filePaths);
            if (prepared == null) {
                return "";
            }
            SpotBugsRunner runner = new SpotBugsRunner();
            checkCanceled(monitor);
            return runner.runNativeSarif(
                    this.findBugs,
                    prepared.project,
                    prepared.rankThreshold,
                    prepared.plugins
            );
        } catch (Exception e) {
            return "";
        }
    }

    private PreparedAnalysis prepareAnalysis(IProgressMonitor monitor, String... filePaths) throws java.io.IOException {
        checkCanceled(monitor);
        this.lastTargetCount = 0;
        this.lastTargetResolutionRootCount = 0;
        this.lastAuxClasspathCount = 0;
        if (filePaths == null || filePaths.length == 0) {
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
        TargetResolver resolver = new TargetResolver();
        List<String> targets = resolver.resolveTargets(filePaths, targetResolutionRootDirs, sourcepaths, monitor);
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

    private void applyFullPaths(List<BugInfo> bugs, IProgressMonitor monitor, String... filePaths) {
        if (bugs == null || bugs.isEmpty()) {
            return;
        }
        List<String> sourcepaths = this.config != null ? this.config.getSourcepaths() : java.util.Collections.emptyList();
        String targetPath = (filePaths != null && filePaths.length > 0) ? filePaths[0] : null;
        SourcePathResolver resolver = new SourcePathResolver();
        for (BugInfo bug : bugs) {
            checkCanceled(monitor);
            if (bug == null) {
                continue;
            }
            if (bug.getFullPath() != null && !bug.getFullPath().isEmpty()) {
                continue;
            }
            String fullPath = resolver.resolve(bug.getRealSourcePath(), sourcepaths, targetPath, monitor);
            if (fullPath != null && !fullPath.isEmpty()) {
                bug.setFullPath(fullPath);
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
