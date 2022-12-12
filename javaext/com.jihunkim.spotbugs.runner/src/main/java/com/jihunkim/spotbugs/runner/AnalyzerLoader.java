package com.jihunkim.spotbugs.runner;

import java.net.URL;
import java.net.URLClassLoader;
import java.util.ArrayList;
import java.util.List;

public class AnalyzerLoader {
    
    static String checkerClass = "com.shengchen.checkstyle.checker.CheckerService";

    URLClassLoader checkerClassLoader = null;

    public ICheckerService loadCheckerService(String checkstyleJarPath, List<String> modulejarPaths) throws Exception {
        if (checkerClassLoader != null) {
            checkerClassLoader.close();
        }
        final ArrayList<URL> jarUrls = new ArrayList<>();
        jarUrls.add(Paths.get(getServerDir(), "com.shengchen.checkstyle.checker.jar").toUri().toURL());
        jarUrls.add(Paths.get(checkstyleJarPath).toUri().toURL());
        for (final String module: modulejarPaths) {
            jarUrls.add(Paths.get(module).toUri().toURL());
        }
        checkerClassLoader = new URLClassLoader(jarUrls.toArray(new URL[0]), getClass().getClassLoader());
        final Constructor<?> constructor = checkerClassLoader.loadClass(checkerClass).getConstructor();
        return (ICheckerService) constructor.newInstance();
    }

    public IQuickFixService loadQuickFixService() {
        return new QuickFixService();
    }

    private String getServerDir() throws Exception {
        final File jarFile = new File(getClass().getProtectionDomain().getCodeSource().getLocation().getFile());
        return jarFile.getParentFile().getCanonicalPath();
    }
}
