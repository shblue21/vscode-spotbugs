package com.jihunkim.spotbugs.analyzer;

import java.util.ArrayList;
import java.util.List;

import org.testng.annotations.Test;

import com.jihunkim.spotbugs.runner.DelegateCommandHandler;

public class DelegateCommnadTest {
    
    DelegateCommandHandler handler;

    @Test
    public void testDelegateCommand() throws Exception {
        handler = new DelegateCommandHandler();
        List<String> filesToCheck = new ArrayList<>();
        filesToCheck.add("C:\\sourcecode\\vscode-spotbugs\\javaext\\com.jihunkim.spotbugs.analyzer\\src\\test\\resource\\PepperBoxKafkaSampler.class");
        handler.analyze(filesToCheck);
    }
}
