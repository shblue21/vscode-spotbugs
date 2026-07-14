package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.IOException;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicBoolean;

import org.eclipse.core.runtime.NullProgressMonitor;
import org.junit.Test;

import edu.umd.cs.findbugs.FindBugs2;
import edu.umd.cs.findbugs.FindBugsProgress;
import edu.umd.cs.findbugs.Project;

public class SpotBugsExecutorCancellationTest {

    @Test
    public void progressCancellationInterruptsTheCurrentSpotBugsExecution() throws Exception {
        NullProgressMonitor monitor = new NullProgressMonitor();
        AtomicBoolean interrupted = new AtomicBoolean(false);
        StubFindBugs findBugs = new StubFindBugs(progress -> {
            if (progress == null) {
                throw new AssertionError("Cancellation progress callback was not installed");
            }
            monitor.setCanceled(true);
            progress.finishClass();
            interrupted.set(Thread.interrupted());
            if (interrupted.get()) {
                throw new InterruptedException("cancelled");
            }
        });
        SpotBugsExecutor executor = new SpotBugsExecutor(
                findBugs,
                new Project(),
                9,
                Collections.emptyList()
        );

        try {
            executor.executeBugsWithWarnings(monitor);
            fail("Expected current SpotBugs execution to be interrupted");
        } catch (InterruptedException expected) {
            assertTrue(interrupted.get());
        }
    }

    private static final class StubFindBugs extends FindBugs2 {

        private final Execution execution;
        private FindBugsProgress progress;

        private StubFindBugs(Execution execution) {
            this.execution = execution;
        }

        @Override
        public void setProgressCallback(FindBugsProgress progress) {
            this.progress = progress;
        }

        @Override
        public void execute() throws IOException, InterruptedException {
            execution.run(progress);
        }
    }

    @FunctionalInterface
    private interface Execution {
        void run(FindBugsProgress progress) throws IOException, InterruptedException;
    }
}
