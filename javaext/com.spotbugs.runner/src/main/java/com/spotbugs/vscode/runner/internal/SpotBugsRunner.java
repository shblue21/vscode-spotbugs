package com.spotbugs.vscode.runner.internal;

import java.io.IOException;
import java.util.List;

import com.spotbugs.vscode.runner.api.BugInfo;

import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Project;

/**
 * Encapsulates SpotBugs execution against a configured Project.
 */
public class SpotBugsRunner {

    public List<BugInfo> run(FindBugs2 findBugs, Project project) throws IOException, InterruptedException {
        SpotBugsExecutor executor = new SpotBugsExecutor(findBugs, project, null, null);
        return executor.executeBugs();
    }

    public List<BugInfo> run(FindBugs2 findBugs, Project project, Integer reporterPriorityThreshold, java.util.List<String> pluginJars)
            throws IOException, InterruptedException {
        SpotBugsExecutor executor = new SpotBugsExecutor(findBugs, project, reporterPriorityThreshold, pluginJars);
        return executor.executeBugs();
    }
}
