package com.jihunkim.spotbugs.runner;

import java.io.File;
import java.lang.reflect.Constructor;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import com.jihunkim.spotbugs.runner.api.IAnalyzerService;

public class AnalyzerLoader {
    
    static String analyzerClass = "com.jihunkim.spotbugs.analyzer.AnalyzerService";

    URLClassLoader analyzerClassLoader = null;

    public IAnalyzerService loadAnalyzerService(String checkstyleJarPath) throws Exception {
        if (analyzerClassLoader != null) {
            analyzerClassLoader.close();
        }
        final ArrayList<URL> jarUrls = new ArrayList<>();
        jarUrls.add(Paths.get(getServerDir(), "com.jihunkim.spotbugs.analyzer.jar").toUri().toURL());
        // jarUrls.add(Paths.get(getServerDir(),"spotbugs-4.7.3.jar").toUri().toURL());

        analyzerClassLoader = new URLClassLoader(jarUrls.toArray(new URL[0]), getClass().getClassLoader());
        final Constructor<?> constructor = analyzerClassLoader.loadClass(analyzerClass).getConstructor();
        return (IAnalyzerService) constructor.newInstance();
    }

    private String getServerDir() throws Exception {
        final File jarFile = new File(getClass().getProtectionDomain().getCodeSource().getLocation().getFile());
        return jarFile.getParentFile().getCanonicalPath();
    }
}
