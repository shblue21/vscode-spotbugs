package com.spotbugs.vscode.runner;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.spotbugs.vscode.runner.api.BugInfo;

import edu.umd.cs.findbugs.BugCollectionBugReporter;
import edu.umd.cs.findbugs.BugInstance;
import edu.umd.cs.findbugs.DetectorFactoryCollection;
import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Project;

public class SimpleFindbugsExecutor {

    private final FindBugs2 findBugs;
    private final Project project;
    private final BugCollectionBugReporter bugReporter;

    private void log(String message) {
        System.out.println("[SpotBugs][Executor] " + message);
    }

    public SimpleFindbugsExecutor(FindBugs2 findBugs, Project project) {
        this.findBugs = findBugs;
        this.project = project;
        this.bugReporter = new BugCollectionBugReporter(project);
        this.bugReporter.setPriorityThreshold(1);
        log("Created.");
    }

    public String execute() throws IOException, InterruptedException {
        log("Configuring FindBugs2...");
        findBugs.setProject(project);
        findBugs.setBugReporter(bugReporter);
        findBugs.setDetectorFactoryCollection(DetectorFactoryCollection.instance());

        findBugs.execute();
        log("Execution finished.");

        return getBugsAsJson();
    }

    private String getBugsAsJson() {
        Collection<BugInstance> bugs = bugReporter.getBugCollection().getCollection();
        log("Found bugs: count=" + bugs.size());
        List<BugInfo> bugList = new ArrayList<>();

        for (BugInstance bug : bugs) {
            bugList.add(new BugInfo(bug));
        }

        Gson gson = new GsonBuilder().setPrettyPrinting().create();
        String json = gson.toJson(bugList);
        log("Returning JSON result.");
        return json;
    }
}
