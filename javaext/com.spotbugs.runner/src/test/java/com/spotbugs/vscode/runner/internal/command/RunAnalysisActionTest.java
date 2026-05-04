package com.spotbugs.vscode.runner.internal.command;

import static org.junit.Assert.assertEquals;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CancellationException;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.internal.AnalyzerService;

public class RunAnalysisActionTest {

    @Test
    public void executeWrapsAnalyzerFailuresAsAnalysisFailedEnvelope() {
        RunAnalysisAction action = new RunAnalysisAction(() -> new AnalyzerService() {
            @Override
            public List<BugInfo> analyzeToBugs(IProgressMonitor monitor, String... filePaths)
                    throws IOException, InterruptedException {
                throw new IOException("analysis boom");
            }
        });

        JsonObject response = execute(action);

        assertEquals(2, response.get("schemaVersion").getAsInt());
        assertEquals(0, response.getAsJsonArray("results").size());
        assertEquals("ANALYSIS_FAILED", firstError(response).get("code").getAsString());
        assertEquals("analysis boom", firstError(response).get("message").getAsString());
        assertEquals(0, response.getAsJsonObject("stats").get("findingCount").getAsInt());
    }

    @Test
    public void executeWrapsAnalyzerCancellationsAsAnalysisCancelledEnvelope() {
        RunAnalysisAction action = new RunAnalysisAction(() -> new AnalyzerService() {
            @Override
            public List<BugInfo> analyzeToBugs(IProgressMonitor monitor, String... filePaths)
                    throws IOException, InterruptedException {
                throw new CancellationException("Command cancelled");
            }
        });

        JsonObject response = execute(action);

        assertEquals(2, response.get("schemaVersion").getAsInt());
        assertEquals(0, response.getAsJsonArray("results").size());
        assertEquals("ANALYSIS_CANCELLED", firstError(response).get("code").getAsString());
        assertEquals("Command cancelled", firstError(response).get("message").getAsString());
        assertEquals(0, response.getAsJsonObject("stats").get("findingCount").getAsInt());
    }

    @Test
    public void executeReportsSuccessFindingCountFromResults() {
        RunAnalysisAction action = new RunAnalysisAction(() -> new AnalyzerService() {
            @Override
            public List<BugInfo> analyzeToBugs(IProgressMonitor monitor, String... filePaths) {
                return Collections.emptyList();
            }
        });

        JsonObject response = execute(action);

        assertEquals(2, response.get("schemaVersion").getAsInt());
        assertEquals(0, response.getAsJsonArray("errors").size());
        assertEquals(0, response.getAsJsonArray("results").size());
        assertEquals(0, response.getAsJsonObject("stats").get("findingCount").getAsInt());
    }

    private static JsonObject execute(RunAnalysisAction action) {
        String json = action.execute(new ActionInvocation(
                "java.spotbugs.run",
                new Object[] { "/workspace/build/classes", "{}" },
                new NullProgressMonitor(),
                Thread.currentThread(),
                System.nanoTime()
        ));
        return JsonParser.parseString(json).getAsJsonObject();
    }

    private static JsonObject firstError(JsonObject response) {
        return response.getAsJsonArray("errors").get(0).getAsJsonObject();
    }
}
