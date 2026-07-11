package com.spotbugs.vscode.runner.internal.command;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.spotbugs.vscode.runner.api.CommandResponse;
import com.spotbugs.vscode.runner.internal.PluginInventoryService;

public final class PluginInventoryAction extends AbstractCommandAction {

    private static final String COMMAND_ID = "java.spotbugs.plugins.inventory";

    private final PluginInventoryService service;

    public PluginInventoryAction() {
        this(new PluginInventoryService());
    }

    PluginInventoryAction(PluginInventoryService service) {
        this.service = service != null ? service : new PluginInventoryService();
    }

    @Override
    public String id() {
        return COMMAND_ID;
    }

    @Override
    protected CommandResult run(ActionContext context) throws Exception {
        return success(CommandResponse.success(service.inspect(parsePluginPaths(context)), null));
    }

    private List<String> parsePluginPaths(ActionContext context) throws CommandActionException {
        String requestJson = context.optionalStringArg(0);
        if (requestJson == null || requestJson.trim().isEmpty()) {
            return Collections.emptyList();
        }

        JsonObject request = parseObject(requestJson);
        JsonElement pluginsElement = request.get("plugins");
        if (pluginsElement == null || pluginsElement.isJsonNull()) {
            return Collections.emptyList();
        }
        if (!pluginsElement.isJsonArray()) {
            throw new CommandActionException("INVALID_ARGUMENT", "Argument 'plugins' must be an array of strings");
        }

        JsonArray array = pluginsElement.getAsJsonArray();
        List<String> plugins = new ArrayList<>();
        for (int index = 0; index < array.size(); index++) {
            JsonElement element = array.get(index);
            if (element == null || !element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
                throw new CommandActionException("INVALID_ARGUMENT", "Argument 'plugins' must be an array of strings");
            }
            String path = element.getAsString().trim();
            plugins.add(path);
        }
        return Collections.unmodifiableList(new ArrayList<>(plugins));
    }

    private JsonObject parseObject(String json) throws CommandActionException {
        try {
            JsonElement parsed = JsonParser.parseString(json);
            if (parsed != null && parsed.isJsonObject()) {
                return parsed.getAsJsonObject();
            }
        } catch (RuntimeException ignored) {
        }
        throw new CommandActionException("INVALID_ARGUMENT", "Invalid plugin inventory request JSON");
    }
}
