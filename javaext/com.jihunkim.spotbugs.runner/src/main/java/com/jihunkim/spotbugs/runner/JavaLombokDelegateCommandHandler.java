package com.jihunkim.spotbugs.runner;

import java.util.List;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;
//import edu.umd.cs.findbugs.config.*;

public class JavaLombokDelegateCommandHandler implements IDelegateCommandHandler {
    public static final String JAVA_CODEACTION_LOMBOK_ANNOTATIONS = "java.codeAction.lombok.getAnnotations";
    public static final String JAVA_SPOTBUGS_RUN = "java.spotbugs.run";
    IProgressMonitor monitor;

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

    private void oneCycletest(){
//        final FindBugsProjects projects = new FindBugsProjects(project);


    }
}
