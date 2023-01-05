package com.jihunkim.spotbugs.analyzer;

import java.io.File;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

import edu.umd.cs.findbugs.BugCollectionBugReporter;
import edu.umd.cs.findbugs.BugInstance;
import edu.umd.cs.findbugs.SortedBugCollection;

public class AnalyzerService {

    public List<AnalyzerResult> analyze(List<File> filesToCheck) throws Exception {
        AnalyzerRunner runner = new AnalyzerRunner();
        List<AnalyzerResult> result = new ArrayList<>();

        // String[] files to Path[] filePaths

        BugCollectionBugReporter bugReporter = runner.run(filesToCheck);
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

            // create temp text file 't.txt' and append bugInstance.getType()
            File file = new File("t.txt");
            if (!file.exists()) {
                file.createNewFile();
            }
            java.io.FileWriter fw = new java.io.FileWriter(file, true);
            fw.write(new Date() + " " + bugInstance.getType());
            fw.flush();
            fw.close();

            result.add(analyzerResult);
        }
        return result;
    }
}
