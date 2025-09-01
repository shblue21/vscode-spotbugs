package com.spotbugs.vscode.runner;

import java.util.List;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;
 

public class DelegateCommandHandler implements IDelegateCommandHandler {

    private final CommandFacade facade = new CommandFacade();

    public DelegateCommandHandler() {
        log("Handler created.");
    }

    private void log(String message) {
        System.out.println("[SpotBugs][Runner] " + message);
    }

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) {
        log("Received command: " + commandId);
        if ("java.spotbugs.run".equals(commandId)) {
            try {
                if (arguments != null && arguments.size() > 1) {
                    return facade.runAnalysis(arguments.get(0), arguments.get(1));
                } else {
                    log("-> Error: Invalid arguments for " + commandId);
                }
            } catch (Exception e) {
                System.err.println("[SpotBugs][Runner] Command handling failed: " + e.getMessage());
                e.printStackTrace();
            }
            return "[]"; // Return empty JSON array on error
        }
        log("-> Error: Command not recognized: " + commandId);
        return "Command not recognized";
    }
}
