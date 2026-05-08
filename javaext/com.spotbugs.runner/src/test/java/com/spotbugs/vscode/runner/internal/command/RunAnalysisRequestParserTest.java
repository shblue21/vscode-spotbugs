package com.spotbugs.vscode.runner.internal.command;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;

import org.eclipse.core.runtime.NullProgressMonitor;
import org.junit.Test;

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
        RunAnalysisRequest request = parser.parse(context(
                "/workspace/build/classes",
                "{\"effort\":\"max\",\"runtimeClasspaths\":[\"/workspace/lib.jar\"]}"
        ));

        assertEquals("/workspace/build/classes", request.getTargetPath());
        assertNotNull(request.getConfig());
        assertEquals(Effort.MAX, request.getConfig().getEffort());
        assertEquals(1, request.getConfig().getRuntimeClasspaths().size());
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

    private interface ThrowingRunnable {
        void run() throws AbstractCommandAction.CommandActionException;
    }
}
