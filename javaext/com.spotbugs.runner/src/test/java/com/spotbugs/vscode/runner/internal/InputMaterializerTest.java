package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.*;
import java.io.File;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class InputMaterializerTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    @Test
    public void explicitArtifactDirectoryDoesNotResolveJavaSources() throws Exception {
        File source = temporary.newFolder("src");
        File output = temporary.newFolder("bin");
        Files.createFile(new File(source, "Example.java").toPath());
        File compiled = new File(output, "Example.class");
        Files.createFile(compiled.toPath());
        InputMaterializer materializer = new InputMaterializer();
        assertTrue(materializer.resolveTargets(new AnalysisInput[] {
                new AnalysisInput(AnalysisInput.Kind.ARTIFACT, source.getPath())
        }, List.of(output), List.of(source.getPath()), Map.of(source.getPath(), output.getPath()), null).isEmpty());
        assertEquals(List.of(compiled.getAbsolutePath()), materializer.resolveTargets(new AnalysisInput[] {
                new AnalysisInput(AnalysisInput.Kind.SOURCE, new File(source, "Example.java").getPath())
        }, List.of(output), List.of(source.getPath()), Map.of(source.getPath(), output.getPath()), null));
    }

    @Test
    public void multipleExplicitInputsAreDeduplicatedInOrder() throws Exception {
        File a = temporary.newFile("A.class");
        File b = temporary.newFile("B.jar");
        assertEquals(List.of(a.getAbsolutePath(), b.getAbsolutePath()), new InputMaterializer().resolveTargets(
                new AnalysisInput[] { new AnalysisInput(AnalysisInput.Kind.ARTIFACT, a.getPath()),
                    new AnalysisInput(AnalysisInput.Kind.ARTIFACT, b.getPath()), new AnalysisInput(AnalysisInput.Kind.ARTIFACT, a.getPath()) },
                List.of(), List.of(), Map.of(), null));
    }

    @Test(expected = java.util.concurrent.CancellationException.class)
    public void cancellationPreventsEnumeration() {
        NullProgressMonitor monitor = new NullProgressMonitor();
        monitor.setCanceled(true);
        new ArtifactInputMaterializer().resolveTargets(temporary.getRoot().getPath(), monitor);
    }
}
