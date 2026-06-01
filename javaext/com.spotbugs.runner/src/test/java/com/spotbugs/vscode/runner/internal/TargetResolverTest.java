package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class TargetResolverTest {

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    @Test
    public void recursivelyCollectsCaseInsensitiveClassJarAndZipTargets() throws Exception {
        File root = temporaryFolder.newFolder("targets");
        File nested = new File(root, "nested");
        assertTrue(nested.mkdirs());

        File classFile = touch(root, "Foo.CLASS");
        File jarFile = touch(nested, "app.JAR");
        File zipFile = touch(root, "lib.ZIP");
        touch(root, "notes.txt");

        List<String> actual = new TargetResolver().resolveTargets(
                new String[] { root.getAbsolutePath() },
                Collections.emptyList()
        );

        assertEquals(sortedPaths(classFile, jarFile, zipFile), sorted(actual));
    }

    private File touch(File parent, String name) throws Exception {
        File file = new File(parent, name);
        assertTrue(file.createNewFile());
        return file;
    }

    private List<String> sortedPaths(File... files) {
        List<String> paths = new ArrayList<>();
        for (File file : files) {
            paths.add(file.getAbsolutePath());
        }
        Collections.sort(paths);
        return paths;
    }

    private List<String> sorted(List<String> values) {
        List<String> copy = new ArrayList<>(values);
        Collections.sort(copy);
        return copy;
    }
}
