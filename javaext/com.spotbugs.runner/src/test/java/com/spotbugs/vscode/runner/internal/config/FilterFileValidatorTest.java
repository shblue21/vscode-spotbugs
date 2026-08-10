package com.spotbugs.vscode.runner.internal.config;

import static org.junit.Assert.assertNull;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;

import org.junit.Test;

public class FilterFileValidatorTest {

    @Test
    public void acceptsManagedSuppressionFilterShape() throws Exception {
        Path filter = Files.createTempFile("spotbugs-suppressions", ".xml");
        try {
            String xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                + "<!-- Managed by vscode-spotbugs; format-version: 1. -->\n"
                + "<FindBugsFilter>\n"
                + "  <Match>\n"
                + "    <Class name=\"example.Service\" />\n"
                + "    <Method name=\"load\" params=\"java.lang.String\" returns=\"void\" />\n"
                + "    <Bug pattern=\"NP_NULL_ON_SOME_PATH\" />\n"
                + "  </Match>\n"
                + "</FindBugsFilter>\n";
            Files.writeString(filter, xml);

            assertNull(
                FilterFileValidator.validateExcludeFilters(
                    Collections.singletonList(filter.toString())
                )
            );
        } finally {
            Files.deleteIfExists(filter);
        }
    }
}
