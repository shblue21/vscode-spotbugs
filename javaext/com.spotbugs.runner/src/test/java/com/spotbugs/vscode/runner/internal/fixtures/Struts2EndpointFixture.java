package com.spotbugs.vscode.runner.internal.fixtures;

public class Struts2EndpointFixture {

    public String before() {
        return "before";
    }

    public String execute() {
        return "success";
    }

    public String after() {
        return "after";
    }
}
