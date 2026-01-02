package com.spotbugs.vscode.runner.api;

import java.util.Collections;
import java.util.List;
import java.util.Map;

public class CommandResponse {
    private static final int SCHEMA_VERSION = 1;

    private final int schemaVersion;
    private final Object results;
    private final List<CommandError> errors;
    private final Map<String, Object> stats;

    private CommandResponse(Object results, List<CommandError> errors, Map<String, Object> stats) {
        this.schemaVersion = SCHEMA_VERSION;
        this.results = results != null ? results : Collections.emptyList();
        this.errors = errors != null ? errors : Collections.emptyList();
        this.stats = stats;
    }

    public static CommandResponse success(Object results, Map<String, Object> stats) {
        return new CommandResponse(results, Collections.emptyList(), stats);
    }

    public static CommandResponse error(String code, String message) {
        CommandError error = new CommandError(code, message);
        return new CommandResponse(Collections.emptyList(), Collections.singletonList(error), null);
    }

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public Object getResults() {
        return results;
    }

    public List<CommandError> getErrors() {
        return errors;
    }

    public Map<String, Object> getStats() {
        return stats;
    }
}
