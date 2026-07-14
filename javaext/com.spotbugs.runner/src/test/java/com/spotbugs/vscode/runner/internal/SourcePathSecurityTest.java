package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.Collections;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import com.spotbugs.vscode.runner.api.BugInfo;

import edu.umd.cs.findbugs.BugInstance;
import edu.umd.cs.findbugs.Priorities;
import edu.umd.cs.findbugs.SourceLineAnnotation;

public class SourcePathSecurityTest {

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    @Test
    public void bugInfoDropsUnsafeSourceMetadataWithoutDroppingFinding() {
        for (String sourceFile : new String[] {
                "\\\\attacker\\share\\Example.java",
                "\\\\?\\UNC\\attacker\\share\\Example.java",
                "../Example.java",
                "/tmp/Example.java",
                "C:\\tmp\\Example.java"
        }) {
            BugInfo info = new BugInfo(bugWithSource("Example", sourceFile));

            assertEquals("ICAST_BAD_SHIFT_AMOUNT", info.getType());
            assertEquals("", info.getSourceFile());
            assertEquals("", info.getRealSourcePath());
        }
    }

    @Test
    public void bugInfoPreservesPortableRelativeSourceLocation() {
        BugInfo info = new BugInfo(bugWithSource("com.acme.Example", "Example.java"));

        assertEquals("Example.java", info.getSourceFile());
        assertEquals("com/acme/Example.java", info.getRealSourcePath());
    }

    @Test
    public void resolverOnlyReadsRelativePathsBelowConfiguredSourceRoot() throws Exception {
        File workspace = temporaryFolder.newFolder("workspace");
        File sourceRoot = mkdirs(workspace, "src");
        File expectedSource = touch(mkdirs(sourceRoot, "com/acme"), "Example.java");
        File outsideSource = touch(workspace, "Outside.java");
        SourcePathResolver resolver = new SourcePathResolver();

        assertEquals(
                expectedSource.getAbsolutePath(),
                resolver.resolve(
                        "com/acme/Example.java",
                        Collections.singletonList(sourceRoot.getAbsolutePath()),
                        null
                )
        );
        assertNull(resolver.resolve(
                outsideSource.getAbsolutePath(),
                Collections.singletonList(sourceRoot.getAbsolutePath()),
                null
        ));
        assertNull(resolver.resolve(
                "../Outside.java",
                Collections.singletonList(sourceRoot.getAbsolutePath()),
                null
        ));
        assertNull(resolver.resolve(
                "\\\\attacker\\share\\Example.java",
                Collections.singletonList(sourceRoot.getAbsolutePath()),
                null
        ));
    }

    private static BugInstance bugWithSource(String className, String sourceFile) {
        return new BugInstance("ICAST_BAD_SHIFT_AMOUNT", Priorities.LOW_PRIORITY)
                .addClass(className)
                .addSourceLine(new SourceLineAnnotation(className, sourceFile, 1, 1, 0, 0));
    }

    private static File mkdirs(File parent, String relativePath) {
        File directory = new File(parent, relativePath);
        assertTrue(directory.mkdirs());
        return directory;
    }

    private static File touch(File parent, String name) throws Exception {
        File file = new File(parent, name);
        assertTrue(file.createNewFile());
        return file;
    }
}
