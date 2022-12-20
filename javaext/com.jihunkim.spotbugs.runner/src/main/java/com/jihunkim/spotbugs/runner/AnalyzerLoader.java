package com.jihunkim.spotbugs.runner;

import java.io.File;
import java.lang.reflect.Constructor;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

public class AnalyzerLoader {
    
    static String analyzerClass = "com.jihunkim.spotbugs.analyzer.AnalyzerService";

    URLClassLoader analyzerClassLoader = null;

    public ICheckerService loadAnalyzerService(String checkstyleJarPath, List<String> modulejarPaths) throws Exception {
        if (analyzerClassLoader != null) {
            analyzerClassLoader.close();
        }
        final ArrayList<URL> jarUrls = new ArrayList<>();
        jarUrls.add(Paths.get(getServerDir(), "com.jihunkim.spotbugs.analyzer.jar").toUri().toURL());
        jarUrls.add(Paths.get(checkstyleJarPath).toUri().toURL());
        for (final String module: modulejarPaths) {
            jarUrls.add(Paths.get(module).toUri().toURL());
        }
        analyzerClassLoader = new URLClassLoader(jarUrls.toArray(new URL[0]), getClass().getClassLoader());
        final Constructor<?> constructor = analyzerClassLoader.loadClass(analyzerClass).getConstructor();
        return (ICheckerService) constructor.newInstance();
    }

    private String getServerDir() throws Exception {
        final File jarFile = new File(getClass().getProtectionDomain().getCodeSource().getLocation().getFile());
        return jarFile.getParentFile().getCanonicalPath();
    }
}
