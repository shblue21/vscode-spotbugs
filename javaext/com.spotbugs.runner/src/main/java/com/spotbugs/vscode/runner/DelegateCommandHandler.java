package com.spotbugs.vscode.runner;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;

import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.List;

public class DelegateCommandHandler implements IDelegateCommandHandler {

    private final String LOG_FILE = "/tmp/spotbugs_delegate_debug.log";

    public DelegateCommandHandler() {
        log("DelegateCommandHandler INSTANTIATED.");
    }

    private void log(String message) {
        try (PrintWriter writer = new PrintWriter(new FileWriter(LOG_FILE, true))) {
            writer.println(java.time.LocalDateTime.now() + ": " + message);
        } catch (IOException e) {
            System.err.println("DELEGATE_LOG_ERROR: " + message);
        }
    }

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) {
        log("executeCommand received: " + commandId + " (VERSION: 2)");
        if ("java.spotbugs.run".equals(commandId)) {
            try {
                if (arguments != null && !arguments.isEmpty()) {
                    String filePath = (String) arguments.get(0);
                    log("Analyzing file: " + filePath);
                    
                    AnalyzerService analyzerService = new AnalyzerService();
                    analyzerService.setConfiguration(new java.util.HashMap<>());
                    String result = analyzerService.analyze(filePath);
                    log("Analysis call finished. Result: " + result);
                    return result;
                }
            } catch (Exception e) {
                log("ERROR in executeCommand: " + e.toString());
            }
            return "[]"; // Return empty JSON array on error
        }
        log("Command not recognized: " + commandId);
        return "Command not recognized";
    }
}
