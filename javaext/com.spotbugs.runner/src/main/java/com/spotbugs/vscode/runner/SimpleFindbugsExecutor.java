package com.spotbugs.vscode.runner;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.spotbugs.vscode.runner.api.BugInfo;
import edu.umd.cs.findbugs.*;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

public class SimpleFindbugsExecutor {

    private final FindBugs2 findBugs;
    private final Project project;
    private final BugCollectionBugReporter bugReporter;
    private final String LOG_FILE = "/tmp/spotbugs_debug.log";

    private void log(String message) {
        try (PrintWriter writer = new PrintWriter(new FileWriter(LOG_FILE, true))) {
            writer.println(java.time.LocalDateTime.now() + ": " + message);
        } catch (IOException e) {
            System.err.println("Failed to write to log file: " + message);
        }
    }

    public SimpleFindbugsExecutor(FindBugs2 findBugs, Project project) {
        this.findBugs = findBugs;
        this.project = project;
        this.bugReporter = new BugCollectionBugReporter(project);
        this.bugReporter.setPriorityThreshold(1);
        log("SimpleFindbugsExecutor initialized.");
    }

    public String execute() throws IOException, InterruptedException {
        log("Executor configuring FindBugs2...");
        findBugs.setProject(project);
        findBugs.setBugReporter(bugReporter);
        findBugs.setDetectorFactoryCollection(DetectorFactoryCollection.instance());

        findBugs.execute();
        log("FindBugs2 execution finished.");

        return getBugsAsJson();
    }

    private String getBugsAsJson() {
        Collection<BugInstance> bugs = bugReporter.getBugCollection().getCollection();
        log("Found " + bugs.size() + " bugs.");
        List<BugInfo> bugList = new ArrayList<>();

        for (BugInstance bug : bugs) {
            BugInfo bugInfo = new BugInfo();
            bugInfo.setType(bug.getType());
            bugInfo.setRank(bug.getBugRank());
            bugInfo.setPriority(bug.getPriorityString());
            bugInfo.setMessage(bug.getMessage());
            bugInfo.setSourceFile(bug.getPrimarySourceLineAnnotation().getSourceFile());
            bugInfo.setStartLine(bug.getPrimarySourceLineAnnotation().getStartLine());
            bugInfo.setEndLine(bug.getPrimarySourceLineAnnotation().getEndLine());
            bugList.add(bugInfo);
        }

        Gson gson = new GsonBuilder().setPrettyPrinting().create();
        String json = gson.toJson(bugList);
        log("Returning JSON result.");
        return json;
    }
}