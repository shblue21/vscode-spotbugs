package com.spotbugs.runner;

import java.io.File;
import java.io.FileWriter;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;

import com.spotbugs.runner.api.AnalyzerResult;
import com.spotbugs.runner.api.IAnalyzerService;

public class DelegateCommandHandler implements IDelegateCommandHandler {
    public static final String JAVA_SPOTBUGS_RUN = "java.spotbugs.run";

    private AnalyzerLoader analyzerLoader = new AnalyzerLoader();
    private IAnalyzerService analyzerService = null;

    public DelegateCommandHandler() throws Exception {

        // analyzerService = analyzerLoader.loadAnalyzerService("");

        // if (!version.equals(getVersion())) { // If not equal, load new version
        // }
        // try {
        // checkerService.initialize();
        // checkerService.setConfiguration(config);
        // } catch (Throwable throwable) { // Initialization faild
        // checkerService.dispose(); // Unwind what's already initialized
        // checkerService = null; // Remove checkerService
        // throw throwable; // Resend the exception or error out
        // }
    }

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor progress) throws Exception {
        // create txt file and write start time
        final String logPath = String.format("%s\\%s",
                "C:\\sourcecode\\vscode-spotbugs\\javaext\\com.spotbugs.analyzer\\src\\test\\resource",
                "log.txt");
        final File logFile = new File(logPath);
        if (!logFile.exists()) {
            logFile.createNewFile();
        }
        switch (commandId) {
            case JAVA_SPOTBUGS_RUN:
                try {
                    final String startTime = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date());

                    final FileWriter fileWriter = new FileWriter(logFile);
                    fileWriter.write(startTime);
                    fileWriter.close();

                    List<String> filesToCheck = new ArrayList<>();
                    filesToCheck.add(
                            "C:\\sourcecode\\vscode-spotbugs\\javaext\\com.spotbugs.analyzer\\src\\test\\resource\\PepperBoxKafkaSampler.class");
                    // analyze(filesToCheck);
                } catch (Exception e) {
                    FileWriter fileWriter = new FileWriter(logFile, true);
                    fileWriter.write(e.getMessage());
                    fileWriter.close();
                }

                return null;
            default:
                break;
        }
        throw new UnsupportedOperationException(
                String.format("Java lombok plugin doesn't support the command '%s'.", commandId));
    }

    // public List<AnalyzerResult> analyze(List<String> filesToCheck) throws
    // Exception {

    // if (filesToCheck.isEmpty() || analyzerService == null) {
    // return Collections.emptyList();
    // }
    // final List<File> filesToCheckFiles =
    // filesToCheck.stream().map(File::new).collect(Collectors.toList());

    // return analyzerService.analyze(filesToCheckFiles);
    // }

}
