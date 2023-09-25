package com.jihunkim.spotbugs.analyzer;

import java.io.FileWriter;
import java.io.IOException;
import java.util.Map;

import com.jihunkim.spotbugs.runner.IAnalyzerService;

import edu.umd.cs.findbugs.Project;
import edu.umd.cs.findbugs.config.UserPreferences;

public class AnalyzerService implements IAnalyzerService {

    private UserPreferences userPreferences;
    private SimpleFindbugsExecutor simpleFindbugsExecutor;

    public void setConfiguration(Map<String, Object> config) throws IOException {
        this.userPreferences = UserPreferences.createDefaultUserPreferences();
        this.userPreferences.setEffort("default");

    }

    public void analyze() throws IOException, InterruptedException {
        FileWriter fw = new FileWriter("C://test//spotbugs.log", true);
        fw.write("analyze : " + java.time.LocalDateTime.now() + "\n");
        fw.close();

        try {
            FileWriter fw4 = new FileWriter("C://test//spotbugs.log", true);
            fw4.write("analyze start : " + java.time.LocalDateTime.now() + "\n");
            fw4.close();
            Project project = new Project();
            project.addFile(
                    "C:\\sourcecode\\vscode-spotbugs\\javaext_back\\com.jihunkim.spotbugs.analyzer\\src\\test\\resource\\PepperBoxKafkaSampler.class");
            FileWriter fw5 = new FileWriter("C://test//spotbugs.log", true);
            fw5.write("project add file : " + java.time.LocalDateTime.now() + "\n");
            fw5.close();
            simpleFindbugsExecutor = new SimpleFindbugsExecutor(userPreferences, project);
            simpleFindbugsExecutor.execute();
        } catch (Exception e) {
            FileWriter fw3 = new FileWriter("C://test//spotbugs.log", true);
            fw3.write("analyze error : " + java.time.LocalDateTime.now() + "\n");
            fw3.close();
            FileWriter fw4 = new FileWriter("C://test//spotbugs.log", true);
            fw4.write("error : " + e.getMessage() + "\n");
            fw4.close();

        }
        FileWriter fw2 = new FileWriter("C://test//spotbugs.log", true);
        fw2.write("analyze end : " + java.time.LocalDateTime.now() + "\n");
        fw2.close();

    }

    @Override
    public void initialize() throws Exception {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'initialize'");
    }

    @Override
    public void dispose() throws Exception {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'dispose'");
    }

    @Override
    public String getVersion() throws Exception {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'getVersion'");
    }

}
