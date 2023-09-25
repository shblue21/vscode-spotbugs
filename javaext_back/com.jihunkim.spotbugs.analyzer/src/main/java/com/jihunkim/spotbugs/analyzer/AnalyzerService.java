package com.jihunkim.spotbugs.analyzer;

import java.io.File;
import java.io.FileWriter;
import java.text.SimpleDateFormat;
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
        // create temp text file 't.txt' and append bugInstance.getType()
        final String logPath = String.format("%s\\%s",
                "C:\\sourcecode\\vscode-spotbugs\\javaext\\com.jihunkim.spotbugs.analyzer\\src\\test\\resource",
                "log2.txt");
        final File logFile = new File(logPath);
        if (!logFile.exists()) {
            logFile.createNewFile();
        }
        final String startTime = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date());

        final FileWriter fileWriter = new FileWriter(logFile);
        fileWriter.write(startTime);
        fileWriter.close();
        
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
            bugInstance.getBugPattern().getUri().ifPresentOrElse(uri -> analyzerResult.setExternalUrl(uri.toString()),
                    () -> analyzerResult.setExternalUrl(""));

            result.add(analyzerResult);
        }
        return result;
    }
}
