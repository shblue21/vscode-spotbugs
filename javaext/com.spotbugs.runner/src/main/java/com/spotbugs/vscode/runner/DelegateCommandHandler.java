package com.spotbugs.vscode.runner;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;

import com.google.gson.Gson;
import com.spotbugs.vscode.runner.api.Config;

import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.List;
import java.util.Map;

public class DelegateCommandHandler implements IDelegateCommandHandler {

    private final String LOG_FILE = "/tmp/spotbugs_debug.log";

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
                if (arguments != null && arguments.size() > 1) {
                    String filePath = (String) arguments.get(0);
                    String configJson = (String) arguments.get(1);

                    Gson gson = new Gson();
                    Config config = gson.fromJson(configJson, Config.class);

                    log("Analyzing file: " + filePath);
                    log("With Config: " + config.toString());
                    
                    AnalyzerService analyzerService = new AnalyzerService();

                    Map<String, Object> configMap = new java.util.HashMap<>();
                    configMap.put("effort", config.getEffort());
                    // We can add other properties like javaHome, pluginsFile here in the future

                    analyzerService.setConfiguration(configMap);
                    String result = analyzerService.analyze(filePath);
                    log("Analysis call finished. Result: " + result);
                    return result;
                } else {
                    log("Invalid arguments for java.spotbugs.run");
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
