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

    public List<BugInfo> analyzeToBugs(String... filePaths) {
        return analyzeToBugs(null, filePaths);
    }

    public List<BugInfo> analyzeToBugs(IProgressMonitor monitor, String... filePaths) {
        try {
            PreparedAnalysis prepared = prepareAnalysis(monitor, filePaths);
            if (prepared == null) {
                return java.util.Collections.emptyList();
            }
            SpotBugsRunner runner = new SpotBugsRunner();
            checkCanceled(monitor);
            List<BugInfo> bugs = runner.run(
                    this.findBugs,
                    prepared.project,
                    prepared.reporterPriorityThreshold,
                    prepared.plugins
            );
            checkCanceled(monitor);
            applyFullPaths(bugs, monitor, filePaths);
            applyRankThreshold(bugs, monitor);
            return bugs;
        } catch (Exception e) {
            return java.util.Collections.emptyList();
        }
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
                    prepared.reporterPriorityThreshold,
                    prepared.plugins
            );
        } catch (Exception e) {
            return "";
        }
    }

    private static Integer computeReporterPriorityThreshold(Integer rankThreshold) {
        if (rankThreshold == null) return Integer.valueOf(1); // preserve prior default behavior
        int r = Math.max(1, Math.min(20, rankThreshold.intValue()));
        // Map rank → priority category: High(1..4)=1, Medium(5..9)=2, Low(10..20)=3
        if (r <= 4) return Integer.valueOf(1);
        if (r <= 9) return Integer.valueOf(2);
        return Integer.valueOf(3);
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
        this.lastTargetResolutionRootCount = targetResolutionRootDirs.size();
        TargetResolver resolver = new TargetResolver();
        List<String> targets = resolver.resolveTargets(filePaths, targetResolutionRootDirs, monitor);
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
        Integer reporterPriority = computeReporterPriorityThreshold(
                this.config != null ? this.config.getPriorityThreshold() : null
        );
        java.util.List<String> plugins = this.config != null
                ? this.config.getPlugins()
                : java.util.Collections.emptyList();
        return new PreparedAnalysis(project, reporterPriority, plugins);
    }

    private void applyRankThreshold(List<BugInfo> bugs, IProgressMonitor monitor) {
        Integer rankThreshold = this.config != null ? this.config.getPriorityThreshold() : null;
        if (rankThreshold == null) {
            return;
        }
        final int maxRank = Math.max(1, Math.min(20, rankThreshold.intValue()));
        java.util.Iterator<BugInfo> it = bugs.iterator();
        while (it.hasNext()) {
            checkCanceled(monitor);
            BugInfo bug = it.next();
            if (bug == null) {
                continue;
            }
            if (bug.getRank() > maxRank) {
                it.remove();
            }
        }
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
        private final Integer reporterPriorityThreshold;
        private final List<String> plugins;

        private PreparedAnalysis(Project project, Integer reporterPriorityThreshold, List<String> plugins) {
            this.project = project;
            this.reporterPriorityThreshold = reporterPriorityThreshold;
            this.plugins = plugins;
        }
    }

}
