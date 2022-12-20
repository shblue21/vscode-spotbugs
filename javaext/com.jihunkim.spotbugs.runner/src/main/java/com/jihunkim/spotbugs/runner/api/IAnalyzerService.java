package com.jihunkim.spotbugs.runner.api;

import java.util.List;

public interface IAnalyzerService {

    public void initialize() throws Exception;

    public List<AnalyzerResult> analyze(String... files) throws Exception;

}
