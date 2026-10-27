package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CancellationException;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.spotbugs.vscode.runner.internal.config.ConfigParser;
import com.spotbugs.vscode.runner.internal.config.ConfigValidator;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.junit.Test;

public class AnalyzerPreparationStatsTest {
    @Test
    public void cancellationDuringTargetDiscoveryKeepsOnlyCompletedStages() throws Exception {
        Path root = Files.createTempDirectory("analysis-stats");
        try {
            AnalyzerService analyzer = new AnalyzerService();
            JsonObject json = new JsonObject();
            JsonArray roots = new JsonArray();
            roots.add(root.toString());
            json.add("targetResolutionRoots", roots);
            analyzer.setConfiguration(new ConfigValidator().validate(
                    new ConfigParser().parse(json.toString()).getSchema()).getConfig());
            NullProgressMonitor monitor = new NullProgressMonitor() {
                @Override public boolean isCanceled() {
                    return analyzer.getPreparationStats().getTargetResolutionRootCount() == 1;
                }
            };
            try {
                analyzer.analyzeToBugsWithWarnings(monitor, false,
                        new AnalysisInput[] { new AnalysisInput(AnalysisInput.Kind.ARTIFACT, root.toString()) });
                fail("Expected cancellation during discovery");
            } catch (CancellationException expected) {
                AnalysisPreparationStats snapshot = analyzer.getPreparationStats();
                assertEquals(1, snapshot.getTargetResolutionRootCount());
                assertEquals(0, snapshot.getTargetCount());
                assertEquals(0, snapshot.getAuxClasspathCount());
                analyzer.analyzeToBugsWithWarnings(null, false, new AnalysisInput[0]);
                assertEquals(1, snapshot.getTargetResolutionRootCount());
                assertEquals(0, analyzer.getPreparationStats().getTargetResolutionRootCount());
            }
        } finally {
            Files.delete(root);
        }
    }
}
