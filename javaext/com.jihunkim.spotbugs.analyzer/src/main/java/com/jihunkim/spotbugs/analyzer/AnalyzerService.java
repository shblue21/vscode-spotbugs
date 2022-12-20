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

    public void work(List<String> files) {
        for (String file : files) {
            runFindBug(new File(file));
        }
    }

    private void runFindBug(File file) {
        BugCollectionBugReporter bugReporter = runner.run(file.toPath());
        SortedBugCollection sortedBugCollection = (SortedBugCollection) bugReporter.getBugCollection();
        for (BugInstance bugInstance : sortedBugCollection) {
            AnalyzerResult analyzerResult = new AnalyzerResult();
            analyzerResult.setBugType(bugInstance.getType());
            analyzerResult.setBugCategory(bugInstance.getBugPattern().getCategory());
            analyzerResult.setBugAbbreviation(bugInstance.getBugPattern().getAbbrev());
            analyzerResult.setBugMessage(bugInstance.getMessageWithoutPrefix());
            analyzerResult.setBugRank(bugInstance.getBugRank());
            analyzerResult.setClassName(bugInstance.getPrimaryClass().getClassName());
            analyzerResult.setMethodName(bugInstance.getPrimaryMethod().toString());
            analyzerResult.setStartLine(bugInstance.getPrimarySourceLineAnnotation().getStartLine());
            analyzerResult.setEndLine(bugInstance.getPrimarySourceLineAnnotation().getEndLine());
            bugInstance.getBugPattern().getUri().ifPresentOrElse(uri -> analyzerResult.setExternalUrl(uri.toString()), () -> analyzerResult.setExternalUrl(""));            
        }
    }
}
