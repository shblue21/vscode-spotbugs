package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.bcel.Const;
import org.apache.bcel.generic.ClassGen;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class SourceInputMaterializerTest {

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    @Test
    public void packageSelectionAddsOnlyExplicitlyMappedDescendantSources() throws Exception {
        for (boolean debug : new boolean[] { true, false }) {
            File project = temporaryFolder.newFolder("descendants-" + debug);
            File root = mkdirs(project, "src");
            File selected = mkdirs(root, "pkg");
            File nested = mkdirs(selected, "generated");
            File unmapped = mkdirs(nested, "unmapped");
            File sibling = mkdirs(root, "outside");
            File out = mkdirs(project, "out");
            File nestedOut = mkdirs(project, "nested-output");
            File unrelatedOut = mkdirs(project, "unrelated");
            touch(selected, "A.java");
            touch(mkdirs(nested, "pkg"), "G.java");
            touch(mkdirs(unmapped, "pkg"), "Missing.java");
            touch(mkdirs(sibling, "pkg"), "Outside.java");
            File a = writeClass(mkdirs(out, "pkg"), "pkg.A", "A.java");
            File retained = writeClassWithoutSource(new File(out, "pkg"), "pkg.ParentHelper");
            File nestedPackage = mkdirs(nestedOut, "pkg");
            File g = debug ? writeClass(nestedPackage, "pkg.G", "G.java")
                    : writeClassWithoutSource(nestedPackage, "pkg.G");
            // Neither an unmapped deeper root nor a sibling may trigger supplemental fallback.
            File unrelatedPackage = mkdirs(unrelatedOut, "pkg");
            writeClass(unrelatedPackage, "pkg.Missing", "Missing.java");
            writeClass(unrelatedPackage, "pkg.Outside", "Outside.java");
            writeClass(unrelatedPackage, "pkg.G", "G.java");
            Map<String, String> mappings = new LinkedHashMap<>();
            mappings.put(root.getAbsolutePath(), out.getAbsolutePath());
            mappings.put(nested.getAbsolutePath(), nestedOut.getAbsolutePath());
            mappings.put(sibling.getAbsolutePath(), unrelatedOut.getAbsolutePath());
            for (String[] inputs : new String[][] {
                    { selected.getAbsolutePath() },
                    { selected.getAbsolutePath(), nested.getAbsolutePath() + "/pkg/G.java" }
            }) {
                List<String> actual = new SourceInputMaterializer().resolveTargets(
                        inputs, listOfFiles(out, nestedOut, unrelatedOut),
                        listOf(root.getAbsolutePath(), nested.getAbsolutePath(), unmapped.getAbsolutePath(), sibling.getAbsolutePath()),
                        mappings, null);
                assertEquals(sortedPaths(a, retained, g), sorted(actual));
            }
        }
    }

    @Test
    public void missingDescendantOutputDoesNotSearchOtherOutputs() throws Exception {
        File project = temporaryFolder.newFolder("missing-descendant");
        File root = mkdirs(project, "src");
        File selected = mkdirs(root, "pkg");
        File nested = mkdirs(selected, "generated");
        touch(selected, "A.java");
        touch(mkdirs(nested, "pkg"), "G.java");
        File out = mkdirs(project, "out");
        File unrelated = mkdirs(project, "unrelated");
        File a = writeClass(mkdirs(out, "pkg"), "pkg.A", "A.java");
        writeClass(mkdirs(unrelated, "pkg"), "pkg.G", "G.java");
        Map<String, String> mappings = new LinkedHashMap<>();
        mappings.put(root.getAbsolutePath(), out.getAbsolutePath());
        mappings.put(nested.getAbsolutePath(), new File(project, "not-built").getAbsolutePath());
        assertEquals(Collections.singletonList(a.getAbsolutePath()), new SourceInputMaterializer().resolveTargets(
                new String[] { selected.getAbsolutePath() }, listOfFiles(out, unrelated),
                listOf(root.getAbsolutePath(), nested.getAbsolutePath()), mappings, null));
    }

    @Test
    public void parsesEachClassOncePerCallWithoutSharingSelectionDecisionsOrKeepingStaleMetadata() throws Exception {
        File project = temporaryFolder.newFolder("metadata-cache");
        File root = mkdirs(project, "src");
        File sources = mkdirs(root, "pkg");
        File aSource = touch(sources, "A.java");
        File bSource = touch(sources, "B.java");
        File out = mkdirs(project, "out");
        File classes = mkdirs(out, "pkg");
        File a = writeClass(classes, "pkg.A", "A.java");
        File b = writeClass(classes, "pkg.B", "B.java");
        File helper = writeClass(classes, "pkg.Helper", "A.java");
        File unknown = writeClassWithoutSource(classes, "pkg.Unknown");
        File corrupt = touch(classes, "Broken.class");
        Map<String, Integer> reads = new LinkedHashMap<>();
        SourceInputMaterializer materializer = new SourceInputMaterializer() {
            @Override
            String readSourceFile(File file) throws java.io.IOException {
                reads.merge(file.getName(), 1, Integer::sum);
                return super.readSourceFile(file);
            }
        };
        List<String> roots = Collections.singletonList(root.getAbsolutePath());
        List<File> outputs = Collections.singletonList(out);
        assertEquals(listOf(a.getAbsolutePath(), helper.getAbsolutePath(), b.getAbsolutePath()),
                materializer.resolveTargets(new String[] { aSource.getAbsolutePath(), bSource.getAbsolutePath() }, outputs, roots, null));
        assertEquals(5, reads.size());
        assertTrue(reads.values().stream().allMatch(count -> count == 1));
        reads.clear();
        // Unknown metadata is excluded for a file, included for a folder, even in the same call.
        assertEquals(sortedPaths(a, helper, b, unknown, corrupt), sorted(materializer.resolveTargets(
                new String[] { aSource.getAbsolutePath(), sources.getAbsolutePath() }, outputs, roots, null)));
        assertTrue(reads.values().stream().allMatch(count -> count == 1));
        writeClass(classes, "pkg.Helper", "B.java");
        reads.clear();
        assertEquals(Collections.singletonList(a.getAbsolutePath()), materializer.resolveTargets(
                new String[] { aSource.getAbsolutePath() }, outputs, roots, null));
        assertEquals(Integer.valueOf(1), reads.get("Helper.class"));
    }

    @Test
    public void cancellationDuringMetadataReadDoesNotPoisonTheNextCall() throws Exception {
        File project = temporaryFolder.newFolder("cancel-cache");
        File root = mkdirs(project, "src");
        File source = touch(root, "A.java");
        File out = mkdirs(project, "out");
        File target = writeClass(out, "A", "A.java");
        org.eclipse.core.runtime.NullProgressMonitor monitor = new org.eclipse.core.runtime.NullProgressMonitor();
        SourceInputMaterializer materializer = new SourceInputMaterializer() {
            boolean first = true;
            @Override
            String readSourceFile(File file) throws java.io.IOException {
                if (first) { first = false; monitor.setCanceled(true); }
                return super.readSourceFile(file);
            }
        };
        try {
            materializer.resolveTargets(new String[] { source.getAbsolutePath() },
                    Collections.singletonList(out), Collections.singletonList(root.getAbsolutePath()), monitor);
            org.junit.Assert.fail("Expected cancellation");
        } catch (java.util.concurrent.CancellationException expected) {
            monitor.setCanceled(false);
        }
        assertEquals(Collections.singletonList(target.getAbsolutePath()), materializer.resolveTargets(
                new String[] { source.getAbsolutePath() }, Collections.singletonList(out),
                Collections.singletonList(root.getAbsolutePath()), monitor));
    }

    private File writeClassWithoutSource(File parent, String className) throws Exception {
        ClassGen generated = new ClassGen(className, "java.lang.Object", "Unknown.java", Const.ACC_PUBLIC, null);
        for (org.apache.bcel.classfile.Attribute attribute : generated.getAttributes()) {
            if (attribute instanceof org.apache.bcel.classfile.SourceFile) generated.removeAttribute(attribute);
        }
        File file = new File(parent, className.substring(className.lastIndexOf('.') + 1) + ".class");
        generated.getJavaClass().dump(file.getAbsolutePath());
        return file;
    }

    @Test
    public void javaFileIncludesSecondaryTopLevelClassWithoutBasenameAnchor() throws Exception {
        File project = temporaryFolder.newFolder("secondary");
        File sourceRoot = mkdirs(project, "src");
        File outputRoot = mkdirs(project, "out");
        File sourceFile = touch(mkdirs(sourceRoot, "demo"), "Definitions.java");
        File outputPackage = mkdirs(outputRoot, "demo");
        File first = writeClass(outputPackage, "demo.A", "Definitions.java");
        File second = writeClass(outputPackage, "demo.Helper", "Definitions.java");
        writeClass(outputPackage, "demo.Other", "Other.java");
        assertEquals(sortedPaths(first, second), sorted(resolve(sourceFile, outputRoot, sourceRoot)));
    }

    @Test
    public void mappedPackageUsesOnlyItsDeclaredOutputAndIncludesSecondaryClasses() throws Exception {
        File project = temporaryFolder.newFolder("mapped-package");
        File sourceRoot = mkdirs(project, "src");
        File sourceDir = mkdirs(sourceRoot, "demo");
        File sourceFile = touch(sourceDir, "A.java");
        File correct = mkdirs(project, "correct");
        File wrong = mkdirs(project, "wrong");
        File correctPackage = mkdirs(correct, "demo");
        File first = writeClass(correctPackage, "demo.A", "A.java");
        File helper = writeClass(correctPackage, "demo.Helper", "A.java");
        writeClass(mkdirs(wrong, "demo"), "demo.A", "A.java");
        Map<String, String> mapping = Collections.singletonMap(sourceRoot.getAbsolutePath(), correct.getAbsolutePath());
        SourceInputMaterializer materializer = new SourceInputMaterializer();
        for (File selected : new File[] { sourceDir, sourceFile }) {
            assertEquals(sortedPaths(first, helper), sorted(materializer.resolveTargets(
                    new String[] { selected.getAbsolutePath() }, java.util.Arrays.asList(wrong, correct),
                    Collections.singletonList(sourceRoot.getAbsolutePath()), mapping, null)));
        }
    }

    @Test
    public void mappedPackageRetainsClassesWithoutSourceFileDebugInformation() throws Exception {
        File project = temporaryFolder.newFolder("no-debug");
        File sourceRoot = mkdirs(project, "src");
        File sourceDir = mkdirs(sourceRoot, "demo");
        touch(sourceDir, "A.java");
        File output = mkdirs(project, "out");
        File outputPackage = mkdirs(output, "demo");
        ClassGen generated = new ClassGen("demo.Helper", "java.lang.Object", "A.java", Const.ACC_PUBLIC, null);
        for (org.apache.bcel.classfile.Attribute attribute : generated.getAttributes()) {
            if (attribute instanceof org.apache.bcel.classfile.SourceFile) generated.removeAttribute(attribute);
        }
        File helper = new File(outputPackage, "Helper.class");
        generated.getJavaClass().dump(helper.getAbsolutePath());
        List<String> actual = new SourceInputMaterializer().resolveTargets(
                new String[] { sourceDir.getAbsolutePath() }, Collections.singletonList(output),
                Collections.singletonList(sourceRoot.getAbsolutePath()),
                Collections.singletonMap(sourceRoot.getAbsolutePath(), output.getAbsolutePath()), null);
        assertEquals(Collections.singletonList(helper.getAbsolutePath()), actual);
    }

    @Test
    public void recursivelyCollectsCaseInsensitiveClassJarAndZipTargets() throws Exception {
        File root = temporaryFolder.newFolder("targets");
        File nested = new File(root, "nested");
        assertTrue(nested.mkdirs());

        File classFile = touch(root, "Foo.CLASS");
        File jarFile = touch(nested, "app.JAR");
        File zipFile = touch(root, "lib.ZIP");
        touch(root, "notes.txt");

        List<String> actual = new SourceInputMaterializer().resolveTargets(
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

        List<String> actual = resolve(sourceFile, outputRoot, sourceRoot);

        assertEquals(sortedPaths(classFile, anonymousClassFile, innerClassFile), sorted(actual));
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

        List<String> actual = resolve(
                sourceFile,
                outputRoot,
                listOf(broadSourceRoot.getAbsolutePath(), narrowSourceRoot.getAbsolutePath())
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

        List<String> actual = resolve(
                sourceFile,
                outputRoot,
                listOf(broadSourceRoot.getAbsolutePath(), narrowSourceRoot.getAbsolutePath())
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

        List<String> actual = resolve(
                sourceFile,
                outputRoot,
                Collections.singletonList(new File(project, "other-source").getAbsolutePath())
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

        List<String> actual = resolve(sourceFile, outputRoot, sourceRoot);

        assertEquals(Collections.emptyList(), actual);
    }

    @Test
    public void sourcePackageDirectoryOnlyCollectsMappedClasses() throws Exception {
        File project = temporaryFolder.newFolder("project");
        File sourceRoot = mkdirs(project, "generated-sources");
        File sourceDir = mkdirs(sourceRoot, "demo");
        File outputRoot = mkdirs(project, "target/classes");
        touch(sourceDir, "Repro.java");
        File outputPackage = mkdirs(outputRoot, "demo");
        File classFile = writeClass(outputPackage, "demo.Repro", "Repro.java");
        File secondaryClassFile = writeClass(outputPackage, "demo.Helper", "Repro.java");
        writeClass(outputPackage, "demo.Old", "Old.java");

        List<String> actual = resolve(sourceDir, outputRoot, sourceRoot);

        assertEquals(sortedPaths(classFile, secondaryClassFile), sorted(actual));
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

        List<String> actual = resolve(selectedDir, outputRoot, sourceRoot);

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

        List<String> actual = resolve(sourceDir, outputRoot, sourceRoot);

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

            List<String> actual = resolve(selectedDir, outputRoot, Collections.emptyList());

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

        List<String> actual = resolve(sourceRoot, outputRoot, sourceRoot);

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

        List<String> actual = resolve(sourceRoot, outputRoot, Collections.emptyList());

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
            List<String> actual = resolve(sourceRootPath, outputRoot, Collections.emptyList());

            assertEquals(Collections.singletonList(classFile.getAbsolutePath()), sorted(actual));
        }
    }

    @Test
    public void projectDirectoryMapsAllConfiguredSourceRootsToTheirOutputs() throws Exception {
        File project = temporaryFolder.newFolder("project-aggregate");
        File mainSource = mkdirs(project, "src/main/java");
        File linkedSource = temporaryFolder.newFolder("linked-source");
        File mainOutput = mkdirs(project, "target/classes");
        File linkedOutput = mkdirs(project, "target/generated-classes");
        File mainFile = touch(mkdirs(mainSource, "demo"), "Main.java");
        File linkedFile = touch(mkdirs(linkedSource, "generated"), "Generated.java");
        File mainClass = touch(mkdirs(mainOutput, "demo"), "Main.class");
        File linkedClass = touch(mkdirs(linkedOutput, "generated"), "Generated.class");
        touch(mkdirs(mainOutput, "generated"), "Generated.class");
        Map<String, String> sourceOutputs = new LinkedHashMap<>();
        sourceOutputs.put(mainSource.getAbsolutePath(), mainOutput.getAbsolutePath());
        sourceOutputs.put(linkedSource.getAbsolutePath(), linkedOutput.getAbsolutePath());

        List<String> actual = new SourceInputMaterializer().resolveTargets(
                new String[] { project.getAbsolutePath() },
                listOfFiles(mainOutput, linkedOutput),
                listOf(mainSource.getAbsolutePath(), linkedSource.getAbsolutePath()),
                sourceOutputs,
                null
        );

        assertEquals(sortedPaths(mainClass, linkedClass), sorted(actual));
        assertTrue(mainFile.isFile());
        assertTrue(linkedFile.isFile());
    }

    private File touch(File parent, String name) throws Exception {
        File file = new File(parent, name);
        assertTrue(file.createNewFile());
        return file;
    }

    private File writeClass(File parent, String className, String sourceFileName) throws Exception {
        File file = new File(parent, className.substring(className.lastIndexOf('.') + 1) + ".class");
        new ClassGen(
                className,
                "java.lang.Object",
                sourceFileName,
                Const.ACC_PUBLIC | Const.ACC_SUPER,
                null
        ).getJavaClass().dump(file);
        return file;
    }

    private List<String> resolve(File input, File outputRoot, File sourceRoot) throws Exception {
        return resolve(
                input,
                outputRoot,
                Collections.singletonList(sourceRoot.getAbsolutePath())
        );
    }

    private List<String> resolve(File input, File outputRoot, List<String> sourcepaths) throws Exception {
        return resolve(input.getAbsolutePath(), outputRoot, sourcepaths);
    }

    private List<String> resolve(String inputPath, File outputRoot, List<String> sourcepaths) throws Exception {
        return new SourceInputMaterializer().resolveTargets(
                new String[] { inputPath },
                Collections.singletonList(outputRoot),
                sourcepaths,
                null
        );
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

    private List<File> listOfFiles(File... values) {
        List<File> result = new ArrayList<>();
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
