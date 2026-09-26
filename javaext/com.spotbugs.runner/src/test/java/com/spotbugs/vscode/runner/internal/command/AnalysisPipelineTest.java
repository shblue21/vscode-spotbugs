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
import com.spotbugs.vscode.runner.internal.AnalysisInput;
import com.spotbugs.vscode.runner.internal.SpotBugsAnalysisResult;
import com.spotbugs.vscode.runner.internal.config.AnalysisConfig;

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
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor progressMonitor, boolean includeBaselineXml, AnalysisInput[] inputs) {
                progressMonitor.setCanceled(true);
                return new SpotBugsAnalysisResult(Collections.nCopies(2, (BugInfo) null), Collections.emptyList());
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
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, boolean includeBaselineXml, AnalysisInput[] inputs) {
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
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, boolean includeBaselineXml, AnalysisInput[] inputs)
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
    public void runReturnsCancelledWhenAnalyzerFailureFollowsMonitorCancellation() throws Exception {
        NullProgressMonitor monitor = new NullProgressMonitor();
        AnalysisPipeline pipeline = new AnalysisPipeline(() -> new AnalyzerService() {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor progressMonitor, boolean includeBaselineXml, AnalysisInput[] inputs)
                    throws IOException {
                progressMonitor.setCanceled(true);
                throw new IOException("wrapped interruption");
            }
        });

        AnalysisPipelineResult result = pipeline.run(monitor, request("/workspace/build/classes"));

        assertEquals(AnalysisPipelineResult.Status.CANCELLED, result.getStatus());
        assertEquals(0, result.getFindingCount());
    }

    @Test
    public void runReturnsFailedResultWithOriginalException() throws Exception {
        IOException failure = new IOException("analysis boom");
        AnalysisPipeline pipeline = new AnalysisPipeline(() -> new AnalyzerService() {
            @Override
            public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, boolean includeBaselineXml, AnalysisInput[] inputs)
                    throws IOException, InterruptedException {
                throw failure;
            }
        });

        AnalysisPipelineResult result = pipeline.run(new NullProgressMonitor(), request("/workspace/build/classes"));

        assertEquals(AnalysisPipelineResult.Status.FAILED, result.getStatus());
        assertSame(failure, result.getFailure());
        assertEquals(0, result.getResults().size());
        assertEquals(0, result.getWarnings().size());
        assertEquals(0, result.getFindingCount());
    }

    private static RunAnalysisRequest request(String targetPath) throws Exception {
        return new RunAnalysisRequest(targetPath, defaultConfig(), false, new com.spotbugs.vscode.runner.internal.AnalysisInput[] { new com.spotbugs.vscode.runner.internal.AnalysisInput(com.spotbugs.vscode.runner.internal.AnalysisInput.Kind.ARTIFACT, targetPath) });
    }

    private static AnalysisConfig defaultConfig() throws Exception {
        return new RunAnalysisRequestParser()
                .parse(context("/workspace/build/classes", "{\"inputs\":[{\"kind\":\"artifact\",\"path\":\"/workspace/build/classes\"}]}"))
                .getConfig();
    }

    private static AbstractCommandAction.ActionContext context(Object... args) {
        return new AbstractCommandAction.ActionContext(args, new NullProgressMonitor());
    }

    private static final class CapturingAnalyzerService extends AnalyzerService {
        private final List<BugInfo> bugs;
        private AnalysisConfig config;
        private String targetPath;

        private CapturingAnalyzerService(List<BugInfo> bugs) {
            this.bugs = bugs;
        }

        @Override
        public void setConfiguration(AnalysisConfig cfg) {
            this.config = cfg;
        }

        @Override
        public SpotBugsAnalysisResult analyzeToBugsWithWarnings(IProgressMonitor monitor, boolean includeBaselineXml, AnalysisInput[] inputs) {
            this.targetPath = inputs.length > 0 ? inputs[0].path : null;
            return bugs != null ? new SpotBugsAnalysisResult(bugs, Collections.emptyList()) : null;
        }
    }
}
