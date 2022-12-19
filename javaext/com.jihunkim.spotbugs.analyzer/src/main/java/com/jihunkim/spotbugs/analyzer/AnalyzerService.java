package com.jihunkim.spotbugs.analyzer;

import java.io.File;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.jihunkim.spotbugs.runner.api.AnalyzerResult;

import edu.umd.cs.findbugs.BugCollection;
import edu.umd.cs.findbugs.BugCollectionBugReporter;
import edu.umd.cs.findbugs.BugInstance;
import edu.umd.cs.findbugs.SortedBugCollection;

public class AnalyzerService {
    private AnalyzerRunner runner;
    private List<AnalyzerResult> result;

    public AnalyzerService() {
        runner = new AnalyzerRunner();
    }

    public void run(File file) {
        BugCollectionBugReporter bugReporter = runner.run(file.toPath());
        SortedBugCollection sortedBugCollection = (SortedBugCollection) bugReporter.getBugCollection();
        for (BugInstance bugInstance : sortedBugCollection) {
            Map<String, Object> map = new HashMap<>();
            map.put("bugType", bugInstance.getType());
            map.put("bugCategory", bugInstance.getBugPattern().getCategory());
            map.put("bugAbbreviation", bugInstance.getBugPattern().getAbbrev());
            map.put("bugMessage", bugInstance.getMessageWithoutPrefix());
            map.put("bugRank", bugInstance.getBugRank());
            map.put("className", bugInstance.getPrimaryClass().getClassName());
            map.put("methodName", bugInstance.getPrimaryMethod().toString());
            map.put("startLine", bugInstance.getPrimarySourceLineAnnotation().getStartLine());
            map.put("endLine", bugInstance.getPrimarySourceLineAnnotation().getEndLine());

            bugInstance.getBugPattern().getUri().ifPresentOrElse(uri -> map.put("externalUrl", uri.toString()), () -> map.put("externalUrl", ""));

            System.out.println(map);
        }
    }
}
