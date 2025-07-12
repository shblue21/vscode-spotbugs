/*
 * Copyright (C) jdneo

 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.

 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.

 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

package com.spotbugs.vscode.runner;

import com.spotbugs.runner.api.ICheckerService;

import java.io.File;
import java.io.FileWriter;
import java.lang.reflect.Constructor;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Paths;
import java.util.ArrayList;

public class CheckstyleLoader {

    static String checkerClass = "com.spotbugs.analyzer.AnalyzerService";

    URLClassLoader analyzerClassLoader = null;

    public IAnalyzerService loadAnalyzerService(String checkstyleJarPath) throws Exception {
        FileWriter fw = new FileWriter("C://test//spotbugs.log", true);
        fw.write("load analyzer service : " + java.time.LocalDateTime.now() + "\n");
        fw.close();

        if (analyzerClassLoader != null) {
            analyzerClassLoader.close();
        }

        try {
            final ArrayList<URL> jarUrls = new ArrayList<>();
            jarUrls.add(Paths.get(getServerDir(), "com.spotbugs.analyzer.jar").toUri().toURL());
            jarUrls.add(Paths.get(checkstyleJarPath).toUri().toURL());
            analyzerClassLoader = new URLClassLoader(jarUrls.toArray(new URL[0]), getClass().getClassLoader());
            final Constructor<?> constructor = analyzerClassLoader.loadClass(checkerClass).getConstructor();
            FileWriter fw3 = new FileWriter("C://test//spotbugs.log", true);
            fw3.write("end load analyzer service : " + java.time.LocalDateTime.now() + "\n");
            fw3.close();
            return (IAnalyzerService) constructor.newInstance();

        } catch (Throwable e) {
            FileWriter fw2 = new FileWriter("C://test//spotbugs.log", true);
            fw2.write("load analyzer service error : " + e.getMessage() + "\n");
            fw2.close();
        }
        return null;
    }

    private String getServerDir() throws Exception {
        final File jarFile = new File(getClass().getProtectionDomain().getCodeSource().getLocation().getFile());
        return jarFile.getParentFile().getCanonicalPath();
    }
}
