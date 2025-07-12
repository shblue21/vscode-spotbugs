package com.spotbugs.vscode.runner;

import com.spotbugs.runner.api.CheckResult;
import com.spotbugs.runner.api.ICheckerService;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;
import java.io.FileWriter;
import java.util.List;
import java.util.Map;

public class DelegateCommandHandler implements IDelegateCommandHandler {

    private static final String JAVA_SPOTBUGS_RUN = "java.spotbugs.run";

    private CheckstyleLoader checkstyleLoader = new CheckstyleLoader();
    private ICheckerService checkerService = null;
    private IAnalyzerService analyzerService = null;

    @Override
    public synchronized Object executeCommand(
            String commandId,
            List<Object> arguments,
            IProgressMonitor monitor) throws Exception {
        FileWriter fw = new FileWriter("C://test//spotbugs.log", true);
        fw.write("execute command : " + commandId + " : " + java.time.LocalDateTime.now() + "\n");
        fw.close();
        try {
            this.setConfiguration(null);
        } catch (Throwable e) {

            e.printStackTrace();
        }
        switch (commandId) {
            case JAVA_SPOTBUGS_RUN:
                return this.analyze();

            default:
                return null;
        }
    }

    @SuppressWarnings("unchecked")
    protected void setConfiguration(Map<String, Object> config) throws Throwable {
        // final String jarStorage = (String) config.get("jarStorage");
        // final String version = (String) config.get("version");
        final String jarPath = "C:\\sourcecode\\vscode-spotbugs\\server\\spotbugs-4.7.3.jar";
        // create log file to 'C://test//spotbugs.log'
        FileWriter fw = new FileWriter("C://test//spotbugs.log", true);
        fw.write("set configuration : " + java.time.LocalDateTime.now() + "\n");
        fw.close();

        if (analyzerService != null) {
            analyzerService.dispose();
        }
        // if (!version.equals(getVersion())) { // If not equal, load new version
        analyzerService = checkstyleLoader.loadAnalyzerService(jarPath);
        // }
        try {
            // analyzerService.initialize();
            // analyzerService.setConfiguration(config);
        } catch (Throwable throwable) { // Initialization faild
            analyzerService.dispose(); // Unwind what's already initialized
            analyzerService = null; // Remove analyzerService
            throw throwable; // Resend the exception or error out
        }
    }

    protected String getVersion() throws Exception {
        if (checkerService != null) {
            return checkerService.getVersion();
        }
        return null;
    }

    protected Map<String, List<CheckResult>> analyze() throws Exception {
        // if (filesToCheckUris.isEmpty() || analyzerService == null) {
        // return Collections.emptyMap();
        // }
        // final List<File> filesToCheck =
        // filesToCheckUris.stream().map(File::new).collect(Collectors.toList());
        // final IFile resource =
        // JDTUtils.findFile(filesToCheck.get(0).toURI().toString());
        
        FileWriter fw = new FileWriter("C://test//spotbugs.log", true);
        fw.write("DelegateCommandHandler analyze : " + java.time.LocalDateTime.now() + "\n");
        fw.close();
        try {
            analyzerService.analyze();

        } catch (Exception e) {
            FileWriter fw2 = new FileWriter("C://test//spotbugs.log", true);
            fw2.write("DelegateCommandHandler analyze error : " + e.getMessage() + "\n");
            fw2.close();
        }
        return null;
    }
}
