package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;

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

    @Test
    public void resolvesJavaFileUsingConfiguredSourcepath() throws Exception {
        File project = temporaryFolder.newFolder("project");
        File sourceRoot = mkdirs(project, "generated-sources");
        File outputRoot = mkdirs(project, "target/classes");
        File sourceFile = touch(mkdirs(sourceRoot, "demo"), "Repro.java");
        File outputPackage = mkdirs(outputRoot, "demo");
        File classFile = touch(outputPackage, "Repro.class");
        File innerClassFile = touch(outputPackage, "Repro$Inner.class");
        File anonymousClassFile = touch(outputPackage, "Repro$1.class");
        touch(outputPackage, "ReproOther.class");
        touch(outputPackage, "Other.class");

        List<String> actual = new TargetResolver().resolveTargets(
                new String[] { sourceFile.getAbsolutePath() },
                Collections.singletonList(outputRoot),
                Collections.singletonList(sourceRoot.getAbsolutePath()),
                null
        );

        assertEquals(sortedPaths(classFile, anonymousClassFile, innerClassFile), sorted(actual));
    }

    @Test
    public void resolvesAllTopLevelClassesDeclaredInSelectedJavaFile() throws Exception {
        File project = temporaryFolder.newFolder("multi-top-level-project");
        File sourceRoot = mkdirs(project, "src/main/java");
        File sourcePackage = mkdirs(sourceRoot, "demo");
        File outputRoot = mkdirs(project, "target/classes");
        File sourceFile = writeJavaSource(
                sourcePackage,
                "Repro.java",
                "package demo; public class Repro { static class Inner {} } " +
                        "class Helper { static class Nested {} } " +
                        "class Same$Source {}"
        );
        File foreignDollarSourceFile = writeJavaSource(
                sourcePackage,
                "Helper$Foreign.java",
                "package demo; class Helper$Foreign {}"
        );
        compileJavaSources(outputRoot, sourceFile, foreignDollarSourceFile);

        File outputPackage = new File(outputRoot, "demo");
        File reproClass = new File(outputPackage, "Repro.class");
        File reproInnerClass = new File(outputPackage, "Repro$Inner.class");
        File helperClass = new File(outputPackage, "Helper.class");
        File helperNestedClass = new File(outputPackage, "Helper$Nested.class");
        File sameSourceDollarClass = new File(outputPackage, "Same$Source.class");
        File foreignDollarClass = new File(outputPackage, "Helper$Foreign.class");
        assertTrue(foreignDollarClass.isFile());

        List<String> actual = new TargetResolver().resolveTargets(
                new String[] { sourceFile.getAbsolutePath() },
                Collections.singletonList(outputRoot),
                Collections.singletonList(sourceRoot.getAbsolutePath()),
                null
        );

        assertEquals(
                sortedPaths(
                        reproClass,
                        reproInnerClass,
                        helperClass,
                        helperNestedClass,
                        sameSourceDollarClass
                ),
                sorted(actual)
        );
    }

    @Test
    public void fallsBackToAnchorFamilyForSameNamedSourcesAcrossSourceRoots() throws Exception {
        File project = temporaryFolder.newFolder("same-named-source-project");
        File selectedSourceRoot = mkdirs(project, "src/main/java");
        File otherSourceRoot = mkdirs(project, "generated/java");
        File selectedSourcePackage = mkdirs(selectedSourceRoot, "demo");
        File otherSourcePackage = mkdirs(otherSourceRoot, "demo");
        File outputRoot = mkdirs(project, "target/classes");
        File selectedSource = writeJavaSource(
                selectedSourcePackage,
                "Repro.java",
                "package demo; public class Repro { static class Inner {} } " +
                        "class SelectedOnly {}"
        );
        File otherSource = writeJavaSource(
                otherSourcePackage,
                "Repro.java",
                "package demo; class OtherRootOnly {}"
        );
        compileJavaSources(outputRoot, selectedSource, otherSource);

        File outputPackage = new File(outputRoot, "demo");
        File reproClass = new File(outputPackage, "Repro.class");
        File reproInnerClass = new File(outputPackage, "Repro$Inner.class");
        assertTrue(new File(outputPackage, "SelectedOnly.class").isFile());
        assertTrue(new File(outputPackage, "OtherRootOnly.class").isFile());

        List<String> actual = new TargetResolver().resolveTargets(
                new String[] { selectedSource.getAbsolutePath() },
                Collections.singletonList(outputRoot),
                listOf(
                        selectedSourceRoot.getAbsolutePath(),
                        otherSourceRoot.getAbsolutePath()
                ),
                null
        );

        assertEquals(sortedPaths(reproClass, reproInnerClass), sorted(actual));
    }

    @Test
    public void prefersLongestConfiguredSourcepathForJavaFile() throws Exception {
        File project = temporaryFolder.newFolder("project");
        File broadSourceRoot = mkdirs(project, "generated-sources");
        File narrowSourceRoot = mkdirs(broadSourceRoot, "demo");
        File outputRoot = mkdirs(project, "target/classes");
        File sourceFile = touch(narrowSourceRoot, "Repro.java");
        File broadClassFile = touch(mkdirs(outputRoot, "demo"), "Repro.class");
        File narrowClassFile = touch(outputRoot, "Repro.class");

        List<String> actual = new TargetResolver().resolveTargets(
                new String[] { sourceFile.getAbsolutePath() },
                Collections.singletonList(outputRoot),
                listOf(broadSourceRoot.getAbsolutePath(), narrowSourceRoot.getAbsolutePath()),
                null
        );

        assertEquals(Collections.singletonList(narrowClassFile.getAbsolutePath()), actual);
        assertTrue(broadClassFile.exists());
    }

    @Test
    public void doesNotFallBackToBroaderSourcepathWhenLongestCandidateHasNoClass() throws Exception {
        File project = temporaryFolder.newFolder("project");
        File broadSourceRoot = mkdirs(project, "generated-sources");
        File narrowSourceRoot = mkdirs(broadSourceRoot, "demo");
        File outputRoot = mkdirs(project, "target/classes");
        File sourceFile = touch(narrowSourceRoot, "Repro.java");
        touch(mkdirs(outputRoot, "demo"), "Repro.class");

        List<String> actual = new TargetResolver().resolveTargets(
                new String[] { sourceFile.getAbsolutePath() },
                Collections.singletonList(outputRoot),
                listOf(broadSourceRoot.getAbsolutePath(), narrowSourceRoot.getAbsolutePath()),
                null
        );

        assertEquals(Collections.emptyList(), actual);
    }

    @Test
    public void keepsMarkerFallbackWhenSourcepathDoesNotMatchJavaFile() throws Exception {
        File project = temporaryFolder.newFolder("project");
        File sourceRoot = mkdirs(project, "src/main/java");
        File outputRoot = mkdirs(project, "target/classes");
        File sourceFile = touch(mkdirs(sourceRoot, "demo"), "Repro.java");
        File classFile = touch(mkdirs(outputRoot, "demo"), "Repro.class");

        List<String> actual = new TargetResolver().resolveTargets(
                new String[] { sourceFile.getAbsolutePath() },
                Collections.singletonList(outputRoot),
                Collections.singletonList(new File(project, "other-source").getAbsolutePath()),
                null
        );

        assertEquals(Collections.singletonList(classFile.getAbsolutePath()), actual);
    }

    @Test
    public void doesNotResolveJavaFileByBasenameWhenConfiguredSourcepathCandidateFails() throws Exception {
        File project = temporaryFolder.newFolder("project");
        File sourceRoot = mkdirs(project, "generated-sources");
        File outputRoot = mkdirs(project, "target/classes");
        File sourceFile = touch(mkdirs(sourceRoot, "demo"), "Repro.java");
        touch(mkdirs(outputRoot, "other"), "Repro.class");

        List<String> actual = new TargetResolver().resolveTargets(
                new String[] { sourceFile.getAbsolutePath() },
                Collections.singletonList(outputRoot),
                Collections.singletonList(sourceRoot.getAbsolutePath()),
                null
        );

        assertEquals(Collections.emptyList(), actual);
    }

    @Test
    public void resolvesSourceDirectoryUsingConfiguredSourcepath() throws Exception {
        File project = temporaryFolder.newFolder("project");
        File sourceRoot = mkdirs(project, "generated-sources");
        File sourceDir = mkdirs(sourceRoot, "demo");
        File outputRoot = mkdirs(project, "target/classes");
        touch(sourceDir, "Repro.java");
        File classFile = touch(mkdirs(outputRoot, "demo"), "Repro.class");

        List<String> actual = new TargetResolver().resolveTargets(
                new String[] { sourceDir.getAbsolutePath() },
                Collections.singletonList(outputRoot),
                Collections.singletonList(sourceRoot.getAbsolutePath()),
                null
        );

        assertEquals(Collections.singletonList(classFile.getAbsolutePath()), actual);
    }

    @Test
    public void bytecodeOnlyDirectoryUnderConfiguredSourcepathFallsBackToDirectCollection() throws Exception {
        File project = temporaryFolder.newFolder("project");
        File sourceRoot = mkdirs(project, "src/main/java");
        File selectedDir = mkdirs(sourceRoot, "lib");
        File outputRoot = mkdirs(project, "target/classes");
        File classFile = touch(selectedDir, "Library.class");
        File jarFile = touch(selectedDir, "library.jar");
        File zipFile = touch(selectedDir, "archive.zip");
        touch(mkdirs(outputRoot, "other"), "Other.class");

        List<String> actual = new TargetResolver().resolveTargets(
                new String[] { selectedDir.getAbsolutePath() },
                Collections.singletonList(outputRoot),
                Collections.singletonList(sourceRoot.getAbsolutePath()),
                null
        );

        assertEquals(sortedPaths(classFile, jarFile, zipFile), sorted(actual));
    }

    @Test
    public void sourceDirectoryMappingExcludesArchivesFromMappedOutputPackage() throws Exception {
        File project = temporaryFolder.newFolder("project");
        File sourceRoot = mkdirs(project, "generated-sources");
        File sourceDir = mkdirs(sourceRoot, "demo");
        File outputRoot = mkdirs(project, "target/classes");
        File outputPackage = mkdirs(outputRoot, "demo");
        touch(sourceDir, "Repro.java");
        File classFile = touch(outputPackage, "Repro.class");
        touch(outputPackage, "library.jar");
        touch(outputPackage, "archive.zip");

        List<String> actual = new TargetResolver().resolveTargets(
                new String[] { sourceDir.getAbsolutePath() },
                Collections.singletonList(outputRoot),
                Collections.singletonList(sourceRoot.getAbsolutePath()),
                null
        );

        assertEquals(Collections.singletonList(classFile.getAbsolutePath()), actual);
    }

    @Test
    public void markerLikeBytecodeOnlyDirectoriesFallBackToDirectCollection() throws Exception {
        int index = 0;
        for (String relativeSourceLikePath : listOf(
                "src/lib",
                "src/main/java/lib",
                "src/main/resources/lib",
                "generated/java"
        )) {
            File project = temporaryFolder.newFolder("project-" + index++);
            File selectedDir = mkdirs(project, relativeSourceLikePath);
            File outputRoot = mkdirs(project, "target/classes");
            File classFile = touch(selectedDir, "Library.class");
            File jarFile = touch(selectedDir, "library.jar");
            File zipFile = touch(selectedDir, "archive.zip");
            touch(mkdirs(outputRoot, "other"), "Other.class");

            List<String> actual = new TargetResolver().resolveTargets(
                    new String[] { selectedDir.getAbsolutePath() },
                    Collections.singletonList(outputRoot),
                    Collections.emptyList(),
                    null
            );

            assertEquals(sortedPaths(classFile, jarFile, zipFile), sorted(actual));
        }
    }

    @Test
    public void sourcepathRootDirectoryOnlyCollectsMappedClasses() throws Exception {
        File project = temporaryFolder.newFolder("project");
        File sourceRoot = mkdirs(project, "generated-sources");
        File outputRoot = mkdirs(project, "target/classes");
        File sourcePackage = mkdirs(sourceRoot, "demo");
        File outputPackage = mkdirs(outputRoot, "demo");
        File otherOutput = mkdirs(outputRoot, "other");
        touch(sourcePackage, "Repro.java");
        File classFile = touch(outputPackage, "Repro.class");
        File innerClassFile = touch(outputPackage, "Repro$Inner.class");
        File anonymousClassFile = touch(outputPackage, "Repro$1.class");
        touch(outputPackage, "ReproOther.class");
        touch(otherOutput, "Other.class");
        touch(sourcePackage, "Missing.java");
        touch(sourcePackage, "library.jar");
        touch(otherOutput, "Missing.class");

        List<String> actual = new TargetResolver().resolveTargets(
                new String[] { sourceRoot.getAbsolutePath() },
                Collections.singletonList(outputRoot),
                Collections.singletonList(sourceRoot.getAbsolutePath()),
                null
        );

        assertEquals(sortedPaths(classFile, anonymousClassFile, innerClassFile), sorted(actual));
    }

    @Test
    public void exactJavaSourceRootDirectoryMapsToOutputClasses() throws Exception {
        File project = temporaryFolder.newFolder("project");
        File sourceRoot = mkdirs(project, "generated/java");
        File outputRoot = mkdirs(project, "target/classes");
        File sourcePackage = mkdirs(sourceRoot, "demo");
        touch(sourcePackage, "Repro.java");
        touch(sourcePackage, "library.jar");
        File classFile = touch(mkdirs(outputRoot, "demo"), "Repro.class");

        List<String> actual = new TargetResolver().resolveTargets(
                new String[] { sourceRoot.getAbsolutePath() },
                Collections.singletonList(outputRoot),
                Collections.emptyList(),
                null
        );

        assertEquals(Collections.singletonList(classFile.getAbsolutePath()), sorted(actual));
    }

    @Test
    public void markerSourceRootDirectoryVariantsDoNotExpandToEntireOutputRoot() throws Exception {
        File project = temporaryFolder.newFolder("project");
        File sourceRoot = mkdirs(project, "src/main/java");
        File outputRoot = mkdirs(project, "target/classes");
        File sourcePackage = mkdirs(sourceRoot, "demo");
        touch(sourcePackage, "Repro.java");
        touch(sourcePackage, "library.jar");
        File classFile = touch(mkdirs(outputRoot, "demo"), "Repro.class");
        touch(mkdirs(outputRoot, "other"), "Other.class");

        for (String sourceRootPath : listOf(
                sourceRoot.getAbsolutePath(),
                sourceRoot.getAbsolutePath() + File.separator,
                sourceRoot.getAbsolutePath() + File.separator + "."
        )) {
            List<String> actual = new TargetResolver().resolveTargets(
                    new String[] { sourceRootPath },
                    Collections.singletonList(outputRoot),
                    Collections.emptyList(),
                    null
            );

            assertEquals(Collections.singletonList(classFile.getAbsolutePath()), sorted(actual));
        }
    }

    private File touch(File parent, String name) throws Exception {
        File file = new File(parent, name);
        assertTrue(file.createNewFile());
        return file;
    }

    private File writeJavaSource(File parent, String name, String source) throws Exception {
        File file = new File(parent, name);
        Files.write(file.toPath(), source.getBytes(StandardCharsets.UTF_8));
        return file;
    }

    private void compileJavaSources(File outputRoot, File... sourceFiles) {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        assertNotNull("Tests require a JDK with javac", compiler);
        List<String> arguments = listOf(
                "--release",
                "8",
                "-g:source",
                "-Xlint:-options",
                "-d",
                outputRoot.getAbsolutePath()
        );
        for (File sourceFile : sourceFiles) {
            arguments.add(sourceFile.getAbsolutePath());
        }
        assertEquals(0, compiler.run(null, null, null, arguments.toArray(new String[0])));
    }

    private File mkdirs(File parent, String relativePath) {
        File dir = new File(parent, relativePath);
        assertTrue(dir.mkdirs());
        return dir;
    }

    private List<String> listOf(String... values) {
        List<String> result = new ArrayList<>();
        Collections.addAll(result, values);
        return result;
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
