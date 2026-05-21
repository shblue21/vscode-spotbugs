package com.spotbugs.vscode.runner.internal.command;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.eclipse.core.runtime.NullProgressMonitor;
import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.spotbugs.vscode.runner.internal.config.ConfigParser;
import com.spotbugs.vscode.runner.internal.config.ConfigValidator;
import com.spotbugs.vscode.runner.internal.config.Effort;

public class RunAnalysisRequestParserTest {

    private final RunAnalysisRequestParser parser = new RunAnalysisRequestParser(
            new ConfigParser(),
            new ConfigValidator()
    );

    @Test
    public void parseReturnsTargetPathAndValidatedConfig() throws Exception {
        JsonObject fixture = AnalysisProtocolFixture.readJsonObject("run-analysis-request-full.json");
        JsonObject payload = fixture.getAsJsonObject("payload");
        JsonObject parseablePayload = payload.deepCopy();
        resolveFixturePathList(parseablePayload, "includeFilterPaths");
        resolveFixturePathList(parseablePayload, "excludeFilterPaths");
        resolveFixturePathList(parseablePayload, "excludeBaselineBugsPaths");
        resolveFixturePath(parseablePayload, "excludeFilterPath");

        RunAnalysisRequest request = parser.parse(context(
                fixture.get("targetPath").getAsString(),
                parseablePayload.toString()
        ));

        assertEquals("/workspace/build/classes", request.getTargetPath());
        assertNotNull(request.getConfig());
        assertEquals(Effort.MAX, request.getConfig().getEffort());
        assertEquals(
                Arrays.asList("/workspace/build/classes", "/workspace/build/generated"),
                request.getConfig().getTargetResolutionRoots()
        );
        assertEquals(
                Arrays.asList("/workspace/build/classes", "/workspace/lib/dependency.jar"),
                request.getConfig().getRuntimeClasspaths()
        );
        assertEquals(Collections.singletonList("."), request.getConfig().getExtraAuxClasspaths());
        assertEquals(
                Arrays.asList("/workspace/src/main/java", "/workspace/generated/sources"),
                request.getConfig().getSourcepaths()
        );
        assertEquals(Integer.valueOf(5), request.getConfig().getPriorityThreshold());
        assertEquals(
                resolvedFixturePathList(payload, "includeFilterPaths"),
                request.getConfig().getIncludeFilterPaths()
        );
        assertEquals(
                resolvedFixturePathList(payload, "excludeFilterPaths"),
                request.getConfig().getExcludeFilterPaths()
        );
        assertEquals(
                resolvedFixturePathList(payload, "excludeBaselineBugsPaths"),
                request.getConfig().getExcludeBaselineBugsPaths()
        );
        assertEquals(
                AnalysisProtocolFixture.resolveRepositoryPath(payload.get("excludeFilterPath").getAsString()),
                request.getConfig().getExcludeFilterPath()
        );
        assertEquals(
                Arrays.asList("/workspace/plugin-a.jar", "/workspace/plugin-b.jar"),
                request.getConfig().getPlugins()
        );
    }

    @Test
    public void parseTreatsMissingBlankAndNonStringConfigAsDefaultConfig() throws Exception {
        RunAnalysisRequest missing = parser.parse(context("/workspace/build/classes"));
        RunAnalysisRequest blank = parser.parse(context("/workspace/build/classes", "   "));
        RunAnalysisRequest nonString = parser.parse(context("/workspace/build/classes", Integer.valueOf(7)));

        assertEquals(Effort.DEFAULT, missing.getConfig().getEffort());
        assertEquals(Effort.DEFAULT, blank.getConfig().getEffort());
        assertEquals(Effort.DEFAULT, nonString.getConfig().getEffort());
    }

    @Test
    public void parseRaisesConfigParseErrors() {
        AbstractCommandAction.CommandActionException failure = expectFailure(() ->
                parser.parse(context("/workspace/build/classes", "{"))
        );

        assertEquals("CFG_BAD_JSON", failure.getCode());
        assertEquals("Invalid config JSON", failure.getMessage());
    }

    @Test
    public void parseRaisesConfigValidationErrors() {
        String missingPath = new File(
                System.getProperty("java.io.tmpdir"),
                "spotbugs-missing-" + System.nanoTime() + ".jar"
        ).getAbsolutePath();

        AbstractCommandAction.CommandActionException failure = expectFailure(() ->
                parser.parse(context(
                        "/workspace/build/classes",
                        "{\"extraAuxClasspaths\":[\"" + jsonString(missingPath) + "\"]}"
                ))
        );

        assertEquals("CFG_AUX_CLASSPATH_NOT_FOUND", failure.getCode());
        assertTrue(failure.getMessage().contains(missingPath));
    }

    @Test
    public void parseRaisesInvalidArgumentForBadTargetPath() {
        AbstractCommandAction.CommandActionException failure = expectFailure(() ->
                parser.parse(context(Integer.valueOf(7), "{}"))
        );

        assertEquals("INVALID_ARGUMENT", failure.getCode());
        assertEquals("Argument 'path' must be a string", failure.getMessage());
    }

    private static AbstractCommandAction.ActionContext context(Object... args) {
        return new AbstractCommandAction.ActionContext(new ActionInvocation(
                "java.spotbugs.run",
                args,
                new NullProgressMonitor(),
                Thread.currentThread(),
                System.nanoTime()
        ));
    }

    private static AbstractCommandAction.CommandActionException expectFailure(ThrowingRunnable runnable) {
        try {
            runnable.run();
            fail("Expected CommandActionException");
            return null;
        } catch (AbstractCommandAction.CommandActionException failure) {
            return failure;
        }
    }

    private static String jsonString(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static void resolveFixturePathList(JsonObject payload, String fieldName) {
        JsonArray source = payload.getAsJsonArray(fieldName);
        JsonArray resolved = new JsonArray();
        for (int index = 0; index < source.size(); index++) {
            resolved.add(AnalysisProtocolFixture.resolveRepositoryPath(source.get(index).getAsString()));
        }
        payload.add(fieldName, resolved);
    }

    private static void resolveFixturePath(JsonObject payload, String fieldName) {
        payload.addProperty(
                fieldName,
                AnalysisProtocolFixture.resolveRepositoryPath(payload.get(fieldName).getAsString())
        );
    }

    private static List<String> resolvedFixturePathList(JsonObject payload, String fieldName) {
        JsonArray source = payload.getAsJsonArray(fieldName);
        List<String> resolved = new ArrayList<>();
        for (int index = 0; index < source.size(); index++) {
            resolved.add(AnalysisProtocolFixture.resolveRepositoryPath(source.get(index).getAsString()));
        }
        return resolved;
    }

    private interface ThrowingRunnable {
        void run() throws AbstractCommandAction.CommandActionException;
    }
}
