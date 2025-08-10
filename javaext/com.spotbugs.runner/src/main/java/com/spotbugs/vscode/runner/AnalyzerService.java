package com.spotbugs.vscode.runner;

import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.config.UserPreferences;

import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.Map;

public class AnalyzerService {

    private final String LOG_FILE = "/tmp/spotbugs_debug.log";
    private final FindBugs2 findBugs;
    private final UserPreferences userPreferences;

    public AnalyzerService() {
        log("Initializing AnalyzerService...");
        this.userPreferences = UserPreferences.createDefaultUserPreferences();
        this.findBugs = new FindBugs2();
        this.findBugs.setUserPreferences(this.userPreferences);
        log("AnalyzerService initialized.");
    }

    private void log(String message) {
        try (PrintWriter writer = new PrintWriter(new FileWriter(LOG_FILE, true))) {
            writer.println(java.time.LocalDateTime.now() + ": " + message);
        } catch (IOException e) {
            System.err.println("Failed to write to log file: " + message);
        }
    }

    public void setConfiguration(Map<String, Object> config) {
        log("Setting configuration...");
        String effort = (String) config.getOrDefault("effort", "max");
        this.userPreferences.setEffort(effort);
        log("Configuration set with effort: " + effort);
    }

    public String analyze(String... filePaths) {
        log("Analyze command received.");
        try {
            if (filePaths == null || filePaths.length == 0) {
                log("Error: No files provided for analysis.");
                return "[]"; // Return empty JSON array on error
            }
            log("Analyzing files: " + String.join(", ", filePaths));

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

            log("Creating Spotbugs executor...");
            SimpleFindbugsExecutor executor = new SimpleFindbugsExecutor(this.findBugs, project);
            String result = executor.execute();
            log("Executor finished.");
            return result;
        } catch (Exception e) {
            log("FATAL ERROR during analysis: " + e.toString());
            try (PrintWriter pw = new PrintWriter(new FileWriter(LOG_FILE, true))) {
                e.printStackTrace(pw);
            } catch (IOException ioe) {
                e.printStackTrace();
            }
            return "[]"; // Return empty JSON array on fatal error
        }
    }
}
