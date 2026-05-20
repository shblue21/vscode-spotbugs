package com.spotbugs.vscode.runner.api;

import java.util.Collections;
import java.util.List;

public class CommandResponse {
    private static final int SCHEMA_VERSION = 2;

    private final int schemaVersion;
    private final Object results;
    private final List<CommandError> errors;
    private final RunAnalysisSummary stats;

    private CommandResponse(Object results, List<CommandError> errors, RunAnalysisSummary stats) {
        this.schemaVersion = SCHEMA_VERSION;
        this.results = results != null ? results : Collections.emptyList();
        this.errors = errors != null ? errors : Collections.emptyList();
        this.stats = stats;
    }

    public static CommandResponse success(Object results, RunAnalysisSummary stats) {
        return new CommandResponse(results, Collections.emptyList(), stats);
    }

    public static CommandResponse error(String code, String message) {
        return error(code, message, null);
    }

    public static CommandResponse error(String code, String message, RunAnalysisSummary stats) {
        CommandError error = new CommandError(code, message);
        return new CommandResponse(Collections.emptyList(), Collections.singletonList(error), stats);
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

    public RunAnalysisSummary getStats() {
        return stats;
    }
}
