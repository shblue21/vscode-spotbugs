package com.spotbugs.vscode.runner;

public interface IAnalyzerService {
    void analyze(String... filePaths) throws Exception;
}