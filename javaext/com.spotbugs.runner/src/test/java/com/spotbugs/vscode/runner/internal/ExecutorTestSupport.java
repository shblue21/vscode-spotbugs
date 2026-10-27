package com.spotbugs.vscode.runner.internal;

import java.util.List;
import com.google.gson.JsonObject;
import com.google.gson.JsonArray;
import com.spotbugs.vscode.runner.internal.config.AnalysisExecutionOptions;
import com.spotbugs.vscode.runner.internal.config.ConfigParser;
import com.spotbugs.vscode.runner.internal.config.ConfigValidator;

final class ExecutorTestSupport {
    static PreparedAnalysisInput input(String... targets) {
        return new PreparedAnalysisInput(List.of(targets), List.of(), List.of());
    }

    static AnalysisExecutionOptions options(int rank, List<String> paths) {
        JsonObject json = new JsonObject();
        json.addProperty("priorityThreshold", rank);
        json.addProperty("minimumConfidence", "low");
        JsonArray plugins = new JsonArray();
        for (String path : paths) plugins.add(path);
        json.add("plugins", plugins);
        return new ConfigValidator().validate(new ConfigParser().parse(json.toString()).getSchema())
                .getConfig().getExecutionOptions();
    }
}
