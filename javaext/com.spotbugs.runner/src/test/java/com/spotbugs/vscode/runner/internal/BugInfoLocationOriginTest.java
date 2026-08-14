package com.spotbugs.vscode.runner.internal;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import com.google.gson.Gson;
import com.google.gson.JsonParser;
import com.spotbugs.vscode.runner.api.BugInfo;

import edu.umd.cs.findbugs.BugInstance;
import edu.umd.cs.findbugs.ClassAnnotation;
import edu.umd.cs.findbugs.FieldAnnotation;
import edu.umd.cs.findbugs.MethodAnnotation;
import edu.umd.cs.findbugs.Priorities;
import edu.umd.cs.findbugs.SourceLineAnnotation;

public class BugInfoLocationOriginTest {

    private static final String CLASS_NAME = "com.acme.Example";
    private static final String SOURCE_FILE = "Example.java";

    @Test
    public void classifiesSupportedLocationOrigins() {
        assertEquals(
                "directSourceLine",
                origin(info(bug().addClass(CLASS_NAME).addSourceLine(source(10, 10))))
        );

        MethodAnnotation method = new MethodAnnotation(CLASS_NAME, "run", "()V", false);
        method.setSourceLines(source(20, 24));
        assertEquals("primaryMethod", origin(info(bug().addClass(CLASS_NAME).addMethod(method))));

        FieldAnnotation field = new FieldAnnotation(CLASS_NAME, "value", "I", false);
        field.setSourceLines(source(30, 30));
        assertEquals("primaryField", origin(info(bug().addClass(CLASS_NAME).addField(field))));

        ClassAnnotation clazz = new ClassAnnotation(CLASS_NAME);
        clazz.setSourceLines(source(34, 289));
        BugInfo classInfo = info(bug().add(clazz));
        assertEquals("primaryClass", origin(classInfo));
        assertEquals(34, classInfo.getStartLine());
        assertEquals(289, classInfo.getEndLine());
        assertEquals("\"unknown\"", new Gson().toJson(BugInfo.LocationOrigin.UNKNOWN));
    }

    @Test
    public void sharedUnknownTopLevelSourceKeepsMemberOrigin() {
        SourceLineAnnotation unknown = SourceLineAnnotation.createUnknown(CLASS_NAME, SOURCE_FILE);
        MethodAnnotation method = new MethodAnnotation(CLASS_NAME, "run", "()V", false);
        method.setSourceLines(unknown);
        BugInstance bug = bug().addClass(CLASS_NAME).addSourceLine(unknown).addMethod(method);

        assertEquals("primaryMethod", origin(info(bug)));
    }

    private static String origin(BugInfo info) {
        return JsonParser.parseString(new Gson().toJson(info))
                .getAsJsonObject().get("locationOrigin").getAsString();
    }

    private static BugInfo info(BugInstance bug) {
        return new BugInfo(bug);
    }

    private static BugInstance bug() {
        return new BugInstance("ICAST_BAD_SHIFT_AMOUNT", Priorities.LOW_PRIORITY);
    }

    private static SourceLineAnnotation source(int startLine, int endLine) {
        return new SourceLineAnnotation(CLASS_NAME, SOURCE_FILE, startLine, endLine, 0, 0);
    }
}
