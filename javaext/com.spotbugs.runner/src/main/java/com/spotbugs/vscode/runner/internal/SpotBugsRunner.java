package com.spotbugs.vscode.runner.internal;

import java.io.IOException;
import java.util.List;

import com.spotbugs.vscode.runner.api.BugInfo;

import org.eclipse.core.runtime.IProgressMonitor;

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

    public List<BugInfo> run(FindBugs2 findBugs, Project project, Integer rankThreshold, java.util.List<String> pluginJars)
            throws IOException, InterruptedException {
        return runWithWarnings(findBugs, project, rankThreshold, pluginJars, null).getBugs();
    }

    public SpotBugsAnalysisResult runWithWarnings(
            FindBugs2 findBugs,
            Project project,
            Integer rankThreshold,
            java.util.List<String> pluginJars,
            IProgressMonitor monitor
    ) throws IOException, InterruptedException {
        SpotBugsExecutor executor = new SpotBugsExecutor(findBugs, project, rankThreshold, pluginJars);
        return executor.executeBugsWithWarnings(monitor);
    }

    public String runNativeSarif(
            FindBugs2 findBugs,
            Project project,
            Integer rankThreshold,
            java.util.List<String> pluginJars
    ) throws IOException, InterruptedException {
        SpotBugsExecutor executor = new SpotBugsExecutor(findBugs, project, rankThreshold, pluginJars);
        return executor.executeNativeSarif();
    }
}
