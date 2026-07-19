package com.spotbugs.vscode.runner.internal;

import java.io.PrintWriter;
import java.io.StringWriter;

import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.sarif.SarifBugReporter;

final class DeferredSarifBugReporter extends SarifBugReporter {

    DeferredSarifBugReporter(Project project) {
        super(project);
    }

    @Override
    public void finish() {
        // FindBugs2 calls finish inside the analysis. Defer serialization so a
        // report-only failure cannot discard otherwise valid findings.
    }

    String writeSarif() {
        StringWriter writer = new StringWriter();
        setWriter(new PrintWriter(writer));
        try {
            super.finish();
            return writer.toString();
        } finally {
            // SarifBugReporter skips this when serialization throws.
            getBugCollection().bugsPopulated();
        }
    }
}
