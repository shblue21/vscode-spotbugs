package com.spotbugs.runner;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.Map;

import com.spotbugs.runner.api.CheckResult;

public interface IAnalyzerService {

    public void initialize() throws Exception;

    public void dispose() throws Exception;

    public void setConfiguration(Map<String, Object> config) throws Exception;

    public String getVersion() throws Exception;

    public void analyze() throws IOException, InterruptedException;

}
