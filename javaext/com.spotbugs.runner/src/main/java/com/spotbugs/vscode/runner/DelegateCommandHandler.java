package com.spotbugs.vscode.runner;

import java.util.List;
import java.util.Map;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;

import com.google.gson.Gson;
import com.spotbugs.vscode.runner.api.Config;

public class DelegateCommandHandler implements IDelegateCommandHandler {

    public DelegateCommandHandler() {
        log("Handler created.");
    }

    private void log(String message) {
        System.out.println("[Spotbugs-Runner] " + message);
    }

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) {
        log("Received command: " + commandId);
        if ("java.spotbugs.run".equals(commandId)) {
            try {
                if (arguments != null && arguments.size() > 1) {
                    String filePath = (String) arguments.get(0);
                    String configJson = (String) arguments.get(1);

                    Gson gson = new Gson();
                    Config config = gson.fromJson(configJson, Config.class);

                    log("-> Analyzing: " + filePath);
                    log("-> With Config: " + config.toString());

                    AnalyzerService analyzerService = new AnalyzerService();

                    Map<String, Object> configMap = new java.util.HashMap<>();
                    configMap.put("effort", config.getEffort());

                    analyzerService.setConfiguration(configMap);
                    return analyzerService.analyze(filePath);
                } else {
                    log("-> Error: Invalid arguments for " + commandId);
                }
            } catch (Exception e) {
                // Print stack trace to stderr so it can be seen in the LS log
                e.printStackTrace();
            }
            return "[]"; // Return empty JSON array on error
        }
        log("-> Error: Command not recognized: " + commandId);
        return "Command not recognized";
    }
}