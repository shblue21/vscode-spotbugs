package com.spotbugs.vscode.runner.api;

import java.util.List;
import java.util.stream.Collectors;
import edu.umd.cs.findbugs.DetectorFactory;

public final class DetectorInventoryEntry {
    private final String className;
    private final boolean defaultEnabled;
    private final List<String> reports;
    public DetectorInventoryEntry(DetectorFactory factory) {
        className = factory.getFullName();
        defaultEnabled = factory.isDefaultEnabled();
        reports = factory.getReportedBugPatterns().stream().map(pattern -> pattern.getType()).sorted().collect(Collectors.toList());
    }
}
