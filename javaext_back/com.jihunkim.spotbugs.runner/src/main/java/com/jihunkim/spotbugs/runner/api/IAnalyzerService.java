package com.spotbugs.runner.api;

import java.io.File;
import java.util.List;

public interface IAnalyzerService {

    public List<AnalyzerResult> analyze(List<File> fileToCheck) throws Exception;

}
