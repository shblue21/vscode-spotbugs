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

    public List<BugInfo> analyzeToBugs(String... filePaths) {
        try {
            if (filePaths == null || filePaths.length == 0) {
                return java.util.Collections.emptyList();
            }

            Project project = new Project();
            // Resolve concrete targets
            ClasspathConfigurer cpCfg = new ClasspathConfigurer();
            List<java.io.File> cpDirs = cpCfg.directoriesFrom(this.projectClasspaths);
            TargetResolver resolver = new TargetResolver();
            List<String> targets = resolver.resolveTargets(filePaths, cpDirs);
            if (targets.isEmpty()) {
                return java.util.Collections.emptyList();
            }
            for (String t : targets) {
                project.addFile(t);
            }
            // Apply classpaths
            cpCfg.apply(project, this.projectClasspaths);

            SpotBugsRunner runner = new SpotBugsRunner();
            List<BugInfo> bugs = runner.run(this.findBugs, project);
            return bugs;
        } catch (Exception e) {
            return java.util.Collections.emptyList();
        }
    }

}
