package com.spotbugs.vscode.runner.internal.command;

import java.util.concurrent.CancellationException;

import org.eclipse.core.runtime.IProgressMonitor;

import com.spotbugs.vscode.runner.internal.AnalyzerService;
import com.spotbugs.vscode.runner.internal.SpotBugsAnalysisResult;

final class AnalysisPipeline {

    private final AnalyzerServiceFactory analyzerFactory;

    AnalysisPipeline() {
        this(AnalyzerService::new);
    }

    AnalysisPipeline(AnalyzerServiceFactory analyzerFactory) {
        this.analyzerFactory = analyzerFactory != null ? analyzerFactory : AnalyzerService::new;
    }

    AnalysisPipelineResult run(IProgressMonitor monitor, RunAnalysisRequest request) {
        AnalyzerService analyzer = analyzerFactory.create();
        analyzer.setConfiguration(request.getConfig());
        long startMillis = System.currentTimeMillis();
        try {
            SpotBugsAnalysisResult result = analyzer.analyzeToBugsWithWarnings(monitor, request.getTargetPath());
            if (monitor != null && monitor.isCanceled()) {
                return AnalysisPipelineResult.cancelled(analyzer, startMillis);
            }
            return AnalysisPipelineResult.success(analyzer, startMillis, result);
        } catch (CancellationException cancellation) {
            return AnalysisPipelineResult.cancelled(analyzer, startMillis);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return AnalysisPipelineResult.cancelled(analyzer, startMillis);
        } catch (Exception analysisFailure) {
            return AnalysisPipelineResult.failed(analyzer, startMillis, analysisFailure);
        }
    }
}
