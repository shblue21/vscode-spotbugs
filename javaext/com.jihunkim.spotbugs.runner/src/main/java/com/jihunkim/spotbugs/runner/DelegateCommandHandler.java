package com.jihunkim.spotbugs.runner;

import java.util.List;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;

import com.jihunkim.spotbugs.runner.api.AnalyzerResult;
import com.jihunkim.spotbugs.runner.api.IAnalyzerService;

public class DelegateCommandHandler implements IDelegateCommandHandler {
    public static final String JAVA_CODEACTION_LOMBOK_ANNOTATIONS = "java.codeAction.lombok.getAnnotations";
    public static final String JAVA_SPOTBUGS_RUN = "java.spotbugs.run";
    
    private AnalyzerLoader analyzerLoader = new AnalyzerLoader();
    private IAnalyzerService analyzerService = null;

    public DelegateCommandHandler() throws Exception {

        final String jarPath = String.format("%s/checkstyle-%s-all.jar", "test", "8.29");
        analyzerService = analyzerLoader.loadAnalyzerService(jarPath);

        // if (!version.equals(getVersion())) { // If not equal, load new version
        // }
        // try {
        //     checkerService.initialize();
        //     checkerService.setConfiguration(config);
        // } catch (Throwable throwable) { // Initialization faild
        //     checkerService.dispose(); // Unwind what's already initialized
        //     checkerService = null;    // Remove checkerService
        //     throw throwable;          // Resend the exception or error out
        // }
    }

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor progress) throws Exception {
        switch (commandId) {
            case JAVA_SPOTBUGS_RUN:
                System.out.println("JAVA_CODEACTION_LOMBOK");
                return null;
            default:
                break;
        }
        throw new UnsupportedOperationException(
                String.format("Java lombok plugin doesn't support the command '%s'.", commandId));
    }

    // protected List<AnalyzerResult> analyze(List<String> filesToCheck) throws Exception{

    //     if (filesToCheck.isEmpty() || analyzerService == null) {
    //         return Collections.emptyMap();
    //     }
    //     final List<File> filesToCheck = filesToCheckUris.stream().map(File::new).collect(Collectors.toList());
    //     final IFile resource = JDTUtils.findFile(filesToCheck.get(0).toURI().toString());
    //     return checkerService.checkCode(filesToCheck, resource != null ? resource.getCharset() : "utf8");

    //     return analyzerService.analyze(files);
    // }


   
}
