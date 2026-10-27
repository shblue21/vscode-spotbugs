package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.*;
import static com.spotbugs.vscode.runner.internal.ExecutorTestSupport.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CancellationException;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.junit.Test;
import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.Project;

public class SpotBugsExecutorOwnershipTest {
    @Test
    public void eachCallOwnsFreshEngineAndProjectAndDetachesReportsBeforeClosing() throws Exception {
        List<TrackingEngine> engines = new ArrayList<>();
        SpotBugsExecutor executor = new SpotBugsExecutor(() -> {
            TrackingEngine engine = new TrackingEngine(null, null);
            engines.add(engine);
            return engine;
        }, PluginLifecycle.DEFAULT);
        SpotBugsAnalysisResult first = executor.execute(input(), options(20, List.of()), null, true);
        executor.execute(input(), options(9, List.of()), null, false);
        assertEquals(2, engines.size());
        assertNotSame(engines.get(0), engines.get(1));
        assertNotSame(engines.get(0).attachedProject, engines.get(1).attachedProject);
        for (TrackingEngine engine : engines) {
            assertTrue(engine.executed);
            assertEquals(1, engine.closeCount);
            assertNull(engine.getProject());
        }
        assertNotNull(first.getNativeSarif());
        assertTrue(first.getBaselineXml().contains("BugCollection"));
    }

    @Test
    public void executionFailureRemainsPrimaryWhenEngineCloseAlsoFails() throws Exception {
        IOException failure = new IOException("execution failed");
        RuntimeException closeFailure = new RuntimeException("close failed");
        TrackingEngine engine = new TrackingEngine(failure, closeFailure);
        try {
            new SpotBugsExecutor(() -> engine, PluginLifecycle.DEFAULT)
                    .execute(input(), options(9, List.of()), null, false);
            fail("Expected execution failure");
        } catch (IOException actual) {
            assertSame(failure, actual);
            assertArrayEquals(new Throwable[] { closeFailure }, actual.getSuppressed());
        }
        assertEquals(1, engine.closeCount);
        assertNull(engine.getProject());
    }

    @Test
    public void pluginLoadFailureStillClosesEngine() throws Exception {
        TrackingEngine engine = new TrackingEngine(null, null);
        try {
            new SpotBugsExecutor(() -> engine, PluginLifecycle.DEFAULT)
                    .execute(input(), options(9, List.of("/missing/spotbugs-plugin.jar")), null, false);
            fail("Expected plugin failure");
        } catch (IOException expected) {
            assertFalse(engine.executed);
            assertEquals(1, engine.closeCount);
        }
    }

    @Test
    public void cancellationBeforeExecutionDoesNotAllocateEngine() throws Exception {
        NullProgressMonitor monitor = new NullProgressMonitor();
        monitor.setCanceled(true);
        try {
            new SpotBugsExecutor(() -> { throw new AssertionError("Engine allocated"); }, PluginLifecycle.DEFAULT)
                    .execute(input(), options(9, List.of()), monitor, false);
            fail("Expected cancellation");
        } catch (CancellationException expected) {
            assertFalse(Thread.currentThread().isInterrupted());
        }
    }

    @Test
    public void allEffortModesReachEngineWithTheirFeatureSettings() throws Exception {
        String[] efforts = { "min", "less", "default", "max" };
        edu.umd.cs.findbugs.config.AnalysisFeatureSetting[][] expected = {
                edu.umd.cs.findbugs.FindBugs.MIN_EFFORT, edu.umd.cs.findbugs.FindBugs.LESS_EFFORT,
                edu.umd.cs.findbugs.FindBugs.DEFAULT_EFFORT, edu.umd.cs.findbugs.FindBugs.MAX_EFFORT
        };
        for (int i = 0; i < efforts.length; i++) {
            final int mode = i;
            edu.umd.cs.findbugs.config.AnalysisFeatureSetting[][] applied = { null };
            FindBugs2 engine = new FindBugs2() {
                @Override public void setAnalysisFeatureSettings(
                        edu.umd.cs.findbugs.config.AnalysisFeatureSetting[] settings) {
                    super.setAnalysisFeatureSettings(settings);
                    applied[0] = settings;
                }
                @Override public void execute() {
                    assertArrayEquals(expected[mode], applied[0]);
                }
            };
            com.spotbugs.vscode.runner.internal.config.AnalysisExecutionOptions options =
                    new com.spotbugs.vscode.runner.internal.config.ConfigValidator().validate(
                            new com.spotbugs.vscode.runner.internal.config.ConfigParser().parse(
                                    "{\"effort\":\"" + efforts[i] + "\"}").getSchema())
                            .getConfig().getExecutionOptions();
            new SpotBugsExecutor(() -> engine, PluginLifecycle.DEFAULT).execute(input(), options, null, false);
        }
    }

    private static final class TrackingEngine extends FindBugs2 {
        private final IOException executionFailure;
        private final RuntimeException closeFailure;
        private boolean executed;
        private int closeCount;
        private Project attachedProject;

        TrackingEngine(IOException executionFailure, RuntimeException closeFailure) {
            this.executionFailure = executionFailure;
            this.closeFailure = closeFailure;
        }

        @Override public void execute() throws IOException {
            executed = true;
            attachedProject = getProject();
            if (executionFailure != null) throw executionFailure;
        }

        @Override public void close() {
            closeCount++;
            super.close();
            if (closeFailure != null) throw closeFailure;
        }
    }
}
