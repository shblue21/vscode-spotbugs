package com.spotbugs.vscode.runner.internal;

import java.io.IOException;
import java.util.List;

import com.spotbugs.vscode.runner.api.BugInfo;

import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Project;

/**
 * Encapsulates FindBugs execution against a configured Project.
 */
public class FindBugsRunner {

    public List<BugInfo> run(FindBugs2 findBugs, Project project) throws IOException, InterruptedException {
        SimpleFindbugsExecutor executor = new SimpleFindbugsExecutor(findBugs, project);
        return executor.executeBugs();
    }
}
