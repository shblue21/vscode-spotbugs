package com.spotbugs.vscode.runner.internal;

import java.util.List;

import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;
import com.spotbugs.vscode.runner.internal.config.PreferencesApplier;

import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.config.UserPreferences;

public class AnalyzerService {

    private final FindBugs2 findBugs;
    private final UserPreferences userPreferences;
    private List<String> projectClasspaths;
    private AnalysisConfig config;
    private int lastTargetCount = 0;

    public AnalyzerService() {
        this.userPreferences = UserPreferences.createDefaultUserPreferences();
        this.findBugs = new FindBugs2();
        this.findBugs.setUserPreferences(this.userPreferences);
    }

    public void setConfiguration(AnalysisConfig cfg) {
        this.config = cfg;
        // Apply user preferences via dedicated applier
        new PreferencesApplier().apply(this.userPreferences, this.findBugs, cfg);
        // Keep classpaths locally for project setup
        this.projectClasspaths = cfg != null ? cfg.getClasspaths() : java.util.Collections.emptyList();
    }

    public int getLastTargetCount() {
        return lastTargetCount;
    }

    public List<BugInfo> analyzeToBugs(String... filePaths) {
        try {
            this.lastTargetCount = 0;
            if (filePaths == null || filePaths.length == 0) {
                return java.util.Collections.emptyList();
            }

            Project project = new Project();
            // Resolve concrete targets
            ClasspathConfigurer cpCfg = new ClasspathConfigurer();
            List<java.io.File> cpDirs = cpCfg.directoriesFrom(this.projectClasspaths);
            TargetResolver resolver = new TargetResolver();
            List<String> targets = resolver.resolveTargets(filePaths, cpDirs);
            this.lastTargetCount = targets.size();
            if (targets.isEmpty()) {
                return java.util.Collections.emptyList();
            }
            for (String t : targets) {
                project.addFile(t);
            }
            // Apply classpaths
            cpCfg.apply(project, this.projectClasspaths);

            SpotBugsRunner runner = new SpotBugsRunner();
            Integer reporterPriority = computeReporterPriorityThreshold(this.config != null ? this.config.getPriorityThreshold() : null);
            java.util.List<String> plugins = this.config != null ? this.config.getPlugins() : java.util.Collections.emptyList();
            List<BugInfo> bugs = runner.run(this.findBugs, project, reporterPriority, plugins);
            applyFullPaths(bugs, filePaths);
            // Precise post-filter by rank when requested
            Integer rankThreshold = this.config != null ? this.config.getPriorityThreshold() : null;
            if (rankThreshold != null) {
                final int maxRank = Math.max(1, Math.min(20, rankThreshold.intValue()));
                java.util.Iterator<BugInfo> it = bugs.iterator();
                while (it.hasNext()) {
                    BugInfo b = it.next();
                    if (b == null) continue;
                    if (b.getRank() > maxRank) it.remove();
                }
            }
            return bugs;
        } catch (Exception e) {
            return java.util.Collections.emptyList();
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

    private void applyFullPaths(List<BugInfo> bugs, String... filePaths) {
        if (bugs == null || bugs.isEmpty()) {
            return;
        }
        List<String> sourcepaths = this.config != null ? this.config.getSourcepaths() : java.util.Collections.emptyList();
        String targetPath = (filePaths != null && filePaths.length > 0) ? filePaths[0] : null;
        SourcePathResolver resolver = new SourcePathResolver();
        for (BugInfo bug : bugs) {
            if (bug == null) {
                continue;
            }
            if (bug.getFullPath() != null && !bug.getFullPath().isEmpty()) {
                continue;
            }
            String fullPath = resolver.resolve(bug.getRealSourcePath(), sourcepaths, targetPath);
            if (fullPath != null && !fullPath.isEmpty()) {
                bug.setFullPath(fullPath);
            }
        }
    }

}
