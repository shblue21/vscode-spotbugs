package com.spotbugs.vscode.runner;

import java.net.URL;
import java.net.URLClassLoader;
import java.util.ServiceLoader;

public class SpotbugsLoader {
    public IAnalyzerService loadAnalyzerService(URL jarUrl) throws Exception {
        URLClassLoader classLoader = new URLClassLoader(new URL[]{jarUrl}, this.getClass().getClassLoader());
        ServiceLoader<IAnalyzerService> loader = ServiceLoader.load(IAnalyzerService.class, classLoader);
        return loader.iterator().next();
    }
}