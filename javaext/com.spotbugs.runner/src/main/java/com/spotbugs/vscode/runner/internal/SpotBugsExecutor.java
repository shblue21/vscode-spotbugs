package com.spotbugs.vscode.runner.internal;

import java.io.File;
import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLClassLoader;
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
    private final Integer reporterPriorityThreshold; // 1..3 (High..Low) or null
    private final List<String> pluginJars; // optional

    public SpotBugsExecutor(FindBugs2 findBugs, Project project, Integer reporterPriorityThreshold, List<String> pluginJars) {
        this.findBugs = findBugs;
        this.project = project;
        this.bugReporter = new BugCollectionBugReporter(project);
        this.reporterPriorityThreshold = reporterPriorityThreshold;
        this.pluginJars = pluginJars;
        // Keep behavior compatible: default to 1 (highest only) if not provided
        this.bugReporter.setPriorityThreshold(this.reporterPriorityThreshold != null ? this.reporterPriorityThreshold.intValue() : 1);
    }

    public List<BugInfo> executeBugs() throws IOException, InterruptedException {
        findBugs.setProject(project);
        findBugs.setBugReporter(bugReporter);

        ClassLoader prev = Thread.currentThread().getContextClassLoader();
        URLClassLoader pluginLoader = null;
        try {
            DetectorFactoryCollection dfc;
            if (pluginJars != null && !pluginJars.isEmpty()) {
                URL[] urls = pluginJarsToUrls(pluginJars);
                // If no valid URLs, fall back to default discovery
                if (urls.length > 0) {
                    pluginLoader = new URLClassLoader(urls, prev);
                    Thread.currentThread().setContextClassLoader(pluginLoader);
                }
            }
            dfc = DetectorFactoryCollection.instance();
            findBugs.setDetectorFactoryCollection(dfc);
            findBugs.execute();
        } finally {
            // restore TCCL
            Thread.currentThread().setContextClassLoader(prev);
            if (pluginLoader != null) try { pluginLoader.close(); } catch (IOException ignored) {}
        }
        return collectBugs();
    }

    private static URL[] pluginJarsToUrls(List<String> jars) {
        List<URL> urls = new ArrayList<>();
        for (String p : jars) {
            if (p == null) continue;
            File f = new File(p);
            if (!f.exists() || !f.isFile()) continue;
            try {
                urls.add(f.toURI().toURL());
            } catch (MalformedURLException ignored) {}
        }
        return urls.toArray(new URL[0]);
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
