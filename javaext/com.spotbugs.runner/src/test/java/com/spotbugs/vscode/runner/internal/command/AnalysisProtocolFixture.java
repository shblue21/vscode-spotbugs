package com.spotbugs.vscode.runner.internal.command;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

public final class AnalysisProtocolFixture {

    private static final String FIXTURE_ROOT = "test-fixtures/analysis-protocol";

    private AnalysisProtocolFixture() {
    }

    static String read(String name) throws IOException {
        return new String(Files.readAllBytes(findFixture(name).toPath()), StandardCharsets.UTF_8);
    }

    static JsonObject readJsonObject(String name) throws IOException {
        return JsonParser.parseString(read(name)).getAsJsonObject();
    }

    static String resolveRepositoryPath(String repoRelativePath) {
        return new File(findRepositoryRoot(), repoRelativePath).getAbsolutePath();
    }

    private static File findFixture(String name) {
        File fixture = new File(new File(findRepositoryRoot(), FIXTURE_ROOT), name);
        if (fixture.isFile()) {
            return fixture;
        }
        throw new IllegalStateException("Analysis protocol fixture not found: " + name);
    }

    private static File findRepositoryRoot() {
        File dir = new File(System.getProperty("user.dir")).getAbsoluteFile();
        while (dir != null) {
            File fixtureRoot = new File(dir, FIXTURE_ROOT);
            if (fixtureRoot.isDirectory()) {
                return dir;
            }
            dir = dir.getParentFile();
        }
        throw new IllegalStateException("Analysis protocol fixture root not found: " + FIXTURE_ROOT);
    }
}
