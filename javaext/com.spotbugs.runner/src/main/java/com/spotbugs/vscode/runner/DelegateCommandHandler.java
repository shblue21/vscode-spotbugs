package com.spotbugs.vscode.runner;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;

import com.google.gson.Gson;
import com.spotbugs.vscode.runner.api.CommandResponse;
import com.spotbugs.vscode.runner.internal.command.CommandAction;
import com.spotbugs.vscode.runner.internal.command.RunAnalysisAction;

public class DelegateCommandHandler implements IDelegateCommandHandler {

    private final Map<String, CommandAction> actions;
    private static final Gson GSON = new Gson();

    public DelegateCommandHandler() {
        this.actions = initialiseActions();
    }

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) {
        CommandAction action = actions.get(commandId);
        if (action == null) {
            return GSON.toJson(CommandResponse.error("UNKNOWN_COMMAND", "Command not recognized"));
        }
        Object[] args = arguments != null ? arguments.toArray() : new Object[0];
        try {
            return action.execute(args);
        } catch (Exception e) {
            return GSON.toJson(CommandResponse.error("COMMAND_FAILED", "Command failed"));
        }
    }

    private Map<String, CommandAction> initialiseActions() {
        Map<String, CommandAction> map = new HashMap<>();
        register(map, new RunAnalysisAction());
        return Collections.unmodifiableMap(map);
    }

    private static void register(Map<String, CommandAction> map, CommandAction action) {
        map.put(action.id(), action);
    }
}
