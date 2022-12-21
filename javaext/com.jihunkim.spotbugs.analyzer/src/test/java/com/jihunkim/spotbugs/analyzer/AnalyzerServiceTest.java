package com.jihunkim.spotbugs.analyzer;

import java.nio.file.Path;
import java.nio.file.Paths;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

public class AnalyzerServiceTest {

    AnalyzerService analyzerService;

    @BeforeClass
    public void setup() {
        analyzerService = new AnalyzerService();
    }

    @Test
    public void testAnalyzerService() {
        Path path = Paths.get("C:\\sourcecode\\vscode-spotbugs\\javaext\\com.jihunkim.spotbugs.analyzer\\src\\test\\resource\\PepperBoxKafkaSampler.class");
        // analyzerService.run(path.toFile());
        System.out.println("testAnalyzerService");
    }
}