package com.jihunkim.spotbugs.analyzer;

import java.io.File;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

public class AnalyzerServiceTest {

    AnalyzerService analyzerService;

    @BeforeClass
    public void setup() {
        analyzerService = new AnalyzerService();
    }

    @Test
    public void testAnalyzerService() throws Exception {
        Path path = Paths.get("C:\\sourcecode\\vscode-spotbugs\\javaext\\com.jihunkim.spotbugs.analyzer\\src\\test\\resource\\PepperBoxKafkaSampler.class");
        List<File> filesToCheck = new ArrayList<>();
        filesToCheck.add(path.toFile());
        analyzerService.analyze(filesToCheck);
        System.out.println("testAnalyzerService");
    }
}