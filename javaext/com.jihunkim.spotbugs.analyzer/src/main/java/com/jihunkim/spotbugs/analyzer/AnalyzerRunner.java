package com.jihunkim.spotbugs.analyzer;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

import edu.umd.cs.findbugs.BugCollectionBugReporter;
import edu.umd.cs.findbugs.BugRanker;
import edu.umd.cs.findbugs.DetectorFactoryCollection;
import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Priorities;
import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.config.UserPreferences;

public class AnalyzerRunner {

    public BugCollectionBugReporter run(List<File> files) {
        DetectorFactoryCollection.resetInstance(new DetectorFactoryCollection());

        try (FindBugs2 engine = new FindBugs2(); Project project = new Project()) {
            for (File file : files) {
                project.addFile(file.getAbsolutePath());
            }
            engine.setProject(project);

            final DetectorFactoryCollection detectorFactoryCollection = DetectorFactoryCollection.instance();
            engine.setDetectorFactoryCollection(detectorFactoryCollection);

            BugCollectionBugReporter bugReporter = new BugCollectionBugReporter(project);
            bugReporter.setPriorityThreshold(Priorities.LOW_PRIORITY);
            bugReporter.setRankThreshold(BugRanker.VISIBLE_RANK_MAX);

            engine.setBugReporter(bugReporter);
            final UserPreferences preferences = UserPreferences.createDefaultUserPreferences();
            preferences.getFilterSettings().clearAllCategories();
            preferences.enableAllDetectors(true);
            engine.setUserPreferences(preferences);

            try {
                engine.execute();
                
            } catch (final IOException | InterruptedException e) {
                throw new AssertionError("Analysis failed with exception", e);
            }
            if (!bugReporter.getQueuedErrors().isEmpty()) {
                bugReporter.reportQueuedErrors();
                throw new AssertionError(
                        "Analysis failed with exception. Check stderr for detail.");
            }
            return bugReporter;
        }
    }

}
