package com.spotbugs.vscode.runner;

import java.util.Map;

import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.config.UserPreferences;

public class AnalyzerService {

    private final FindBugs2 findBugs;
    private final UserPreferences userPreferences;

    public AnalyzerService() {
        log("Service created.");
        this.userPreferences = UserPreferences.createDefaultUserPreferences();
        this.findBugs = new FindBugs2();
        this.findBugs.setUserPreferences(this.userPreferences);
    }

    private void log(String message) {
        System.out.println("[Spotbugs-Service] " + message);
    }

    public void setConfiguration(Map<String, Object> config) {
        log("Setting configuration...");
        String effort = (String) config.getOrDefault("effort", "default");
        this.userPreferences.setEffort(effort);
        log("-> Effort set to: " + effort);
    }

    public String analyze(String... filePaths) {
        try {
            if (filePaths == null || filePaths.length == 0) {
                log("-> Error: No files provided for analysis.");
                return "[]";
            }
            log("Analyzing: " + String.join(", ", filePaths));

            Project project = new Project();
            for (String path : filePaths) {
                project.addFile(path);
            }

            String classPath = System.getProperty("java.class.path");
            if (classPath != null) {
                String[] pathElements = classPath.split(System.getProperty("path.separator"));
                for (String element : pathElements) {
                    project.addAuxClasspathEntry(element);
                }
            }

            SimpleFindbugsExecutor executor = new SimpleFindbugsExecutor(this.findBugs, project);
            return executor.execute();
        } catch (Exception e) {
            e.printStackTrace();
            return "[]";
        }
    }
}