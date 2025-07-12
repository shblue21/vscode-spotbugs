package com.spotbugs.vscode.analyzer;

import edu.umd.cs.findbugs.BugCollection;
import edu.umd.cs.findbugs.BugCollectionBugReporter;
import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.SortedBugCollection;
import edu.umd.cs.findbugs.SortingBugReporter;
import edu.umd.cs.findbugs.config.UserPreferences;

import java.io.FileWriter;
import java.io.IOException;
import java.util.Map;

public class SimpleFindbugsExecutor {

    UserPreferences userPreferences;
    Project project;
    private SortingBugReporter bugReporter;

    public SimpleFindbugsExecutor(UserPreferences userPreferences, Project project) throws IOException {
        FileWriter fw = new FileWriter("C://test//spotbugs.log", true);
        fw.write("SimpleFindbugsExecutor Init : " + java.time.LocalDateTime.now() + "\n");
        fw.close();
        this.userPreferences = UserPreferences.createDefaultUserPreferences();
        this.userPreferences.setEffort("default");
        this.project = project;
    }

    public void execute() throws IOException, InterruptedException {
        FileWriter fw = new FileWriter("C://test//spotbugs.log", true);
        fw.write("SimpleFindbugsExecutor execute : " + java.time.LocalDateTime.now() + "\n");
        fw.close();
        final FindBugs2 findBugs = new FindBugs2();
        bugReporter = new SortingBugReporter();

        findBugs.setProject(this.project);
        findBugs.setBugReporter(bugReporter);
        findBugs.setUserPreferences(/
        runFindBugs(findBugs);
        final FileWriter test = new FileWriter("test.xml");
        bugReporter.getBugCollection().writeXML(test);
        test.close();

    }

    private static void runFindBugs(final FindBugs2 findBugs) throws IOException, InterruptedException {
        findBugs.execute();
    }

    public Map<String, String> getBugMap() {
        BugCollection bugCollection = bugReporter.getBugCollection();
        // bugCollection.writeXML

        return null;
    }
}
