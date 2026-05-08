package com.spotbugs.vscode.runner.internal.command;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CancellationException;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.junit.Test;

import com.spotbugs.vscode.runner.api.BugInfo;
import com.spotbugs.vscode.runner.internal.AnalyzerService;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;
import com.spotbugs.vscode.runner.internal.config.ConfigParser;
import com.spotbugs.vscode.runner.internal.config.ConfigValidator;

public class AnalysisPipelineTest {

    @Test
    public void runConfiguresAnalyzerAndReturnsSuccessResults() throws Exception {
        CapturingAnalyzerService analyzer = new CapturingAnalyzerService(Collections.nCopies(2, (BugInfo) null));
        AnalysisPipeline pipeline = new AnalysisPipeline(() -> analyzer);
        RunAnalysisRequest request = request("/workspace/build/classes");

        AnalysisPipelineResult result = pipeline.run(new NullProgressMonitor(), request);

        assertEquals(AnalysisPipelineResult.Status.SUCCESS, result.getStatus());
        assertSame(analyzer, result.getAnalyzer());
        assertSame(request.getConfig(), analyzer.config);
        assertEquals("/workspace/build/classes", analyzer.targetPath);
        assertEquals(2, result.getResults().size());
        assertEquals(2, result.getFindingCount());
        assertTrue(result.getStartMillis() > 0L);
    }

    @Test
    public void runNormalizesNullAnalyzerResultsToEmptySuccessResults() throws Exception {
        AnalysisPipeline pipeline = new AnalysisPipeline(() -> new CapturingAnalyzerService(null));

        AnalysisPipelineResult result = pipeline.run(new NullProgressMonitor(), request("/workspace/build/classes"));

        assertEquals(AnalysisPipelineResult.Status.SUCCESS, result.getStatus());
        assertEquals(0, result.getResults().size());
        assertEquals(0, result.getFindingCount());
    }

    @Test
    public void runReturnsCancelledWhenMonitorIsCancelledAfterAnalyzerReturns() throws Exception {
        NullProgressMonitor monitor = new NullProgressMonitor();
        AnalysisPipeline pipeline = new AnalysisPipeline(() -> new AnalyzerService() {
            @Override
            public List<BugInfo> analyzeToBugs(IProgressMonitor progressMonitor, String... filePaths) {
                progressMonitor.setCanceled(true);
                return Collections.nCopies(2, (BugInfo) null);
            }
        });

        AnalysisPipelineResult result = pipeline.run(monitor, request("/workspace/build/classes"));

        assertEquals(AnalysisPipelineResult.Status.CANCELLED, result.getStatus());
        assertEquals(0, result.getResults().size());
        assertEquals(0, result.getFindingCount());
    }

    @Test
    public void runReturnsCancelledForCancellationExceptions() throws Exception {
        AnalysisPipeline pipeline = new AnalysisPipeline(() -> new AnalyzerService() {
            @Override
            public List<BugInfo> analyzeToBugs(IProgressMonitor monitor, String... filePaths) {
                throw new CancellationException("stop");
            }
        });

        AnalysisPipelineResult result = pipeline.run(new NullProgressMonitor(), request("/workspace/build/classes"));

        assertEquals(AnalysisPipelineResult.Status.CANCELLED, result.getStatus());
        assertEquals(0, result.getFindingCount());
    }

    @Test
    public void runReturnsCancelledForInterruptedExceptionsAndRestoresInterruptStatus() throws Exception {
        AnalysisPipeline pipeline = new AnalysisPipeline(() -> new AnalyzerService() {
            @Override
            public List<BugInfo> analyzeToBugs(IProgressMonitor monitor, String... filePaths)
                    throws IOException, InterruptedException {
                throw new InterruptedException("stop");
            }
        });

        AnalysisPipelineResult result = null;
        boolean wasInterrupted = false;
        try {
            result = pipeline.run(new NullProgressMonitor(), request("/workspace/build/classes"));
            wasInterrupted = Thread.currentThread().isInterrupted();
        } finally {
            Thread.interrupted();
        }

        assertTrue(wasInterrupted);
        assertNotNull(result);
        assertEquals(AnalysisPipelineResult.Status.CANCELLED, result.getStatus());
        assertEquals(0, result.getFindingCount());
    }

    @Test
    public void runReturnsFailedResultWithOriginalException() throws Exception {
        IOException failure = new IOException("analysis boom");
        AnalysisPipeline pipeline = new AnalysisPipeline(() -> new AnalyzerService() {
            @Override
            public List<BugInfo> analyzeToBugs(IProgressMonitor monitor, String... filePaths)
                    throws IOException, InterruptedException {
                throw failure;
            }
        });

        AnalysisPipelineResult result = pipeline.run(new NullProgressMonitor(), request("/workspace/build/classes"));

        assertEquals(AnalysisPipelineResult.Status.FAILED, result.getStatus());
        assertSame(failure, result.getFailure());
        assertEquals(0, result.getResults().size());
        assertEquals(0, result.getFindingCount());
    }

    private static RunAnalysisRequest request(String targetPath) throws Exception {
        return new RunAnalysisRequest(targetPath, defaultConfig());
    }

    private static AnalysisConfig defaultConfig() throws Exception {
        return new RunAnalysisRequestParser(new ConfigParser(), new ConfigValidator())
                .parse(context("/workspace/build/classes", "{}"))
                .getConfig();
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

    private static final class CapturingAnalyzerService extends AnalyzerService {
        private final List<BugInfo> result;
        private AnalysisConfig config;
        private String targetPath;

        private CapturingAnalyzerService(List<BugInfo> result) {
            this.result = result;
        }

        @Override
        public void setConfiguration(AnalysisConfig cfg) {
            this.config = cfg;
        }

        @Override
        public List<BugInfo> analyzeToBugs(IProgressMonitor monitor, String... filePaths) {
            this.targetPath = filePaths != null && filePaths.length > 0 ? filePaths[0] : null;
            return result;
        }
    }
}
