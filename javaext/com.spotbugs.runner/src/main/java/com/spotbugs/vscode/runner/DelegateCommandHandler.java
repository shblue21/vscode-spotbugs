package com.spotbugs.vscode.runner;

import java.util.List;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;
 

public class DelegateCommandHandler implements IDelegateCommandHandler {

    private final CommandFacade facade = new CommandFacade();

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) {
        if ("java.spotbugs.run".equals(commandId)) {
            try {
                if (arguments != null && arguments.size() > 1) {
                    return facade.runAnalysis(arguments.get(0), arguments.get(1));
                } else {
                    // invalid args
                }
            } catch (Exception e) {
                // swallow errors: facade returns structured error to client
            }
            return "[]"; // Return empty JSON array on error
        }
        return "Command not recognized";
    }
}
