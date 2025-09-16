package com.spotbugs.vscode.runner.internal;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import com.spotbugs.vscode.runner.api.BugInfo;

import edu.umd.cs.findbugs.BugCollectionBugReporter;
import edu.umd.cs.findbugs.BugInstance;
import edu.umd.cs.findbugs.DetectorFactoryCollection;
import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Project;

public class SpotBugsExecutor {

    private final FindBugs2 findBugs;
    private final Project project;
    private final BugCollectionBugReporter bugReporter;

    public SpotBugsExecutor(FindBugs2 findBugs, Project project) {
        this.findBugs = findBugs;
        this.project = project;
        this.bugReporter = new BugCollectionBugReporter(project);
        this.bugReporter.setPriorityThreshold(1);
    }

    public List<BugInfo> executeBugs() throws IOException, InterruptedException {
        findBugs.setProject(project);
        findBugs.setBugReporter(bugReporter);
        findBugs.setDetectorFactoryCollection(DetectorFactoryCollection.instance());
        findBugs.execute();
        return collectBugs();
    }

    private List<BugInfo> collectBugs() {
        Collection<BugInstance> bugs = bugReporter.getBugCollection().getCollection();
        List<BugInfo> bugList = new ArrayList<>();
        for (BugInstance bug : bugs) {
            bugList.add(new BugInfo(bug));
        }
        return bugList;
    }
}
