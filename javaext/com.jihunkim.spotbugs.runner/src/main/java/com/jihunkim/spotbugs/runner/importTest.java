package com.jihunkim.spotbugs.runner;

import java.util.HashMap;
import java.util.Map;

import org.osgi.framework.BundleActivator;
import org.osgi.framework.BundleContext;

public class importTest implements BundleActivator {

    public static final String PLUGIN_ID = "com.jihunkim.spotbugs.runner";
    public static BundleContext context = null;

    @Override
    public void start(BundleContext context) throws Exception {
        SpotBugsPlugin.context = context;
    }

    @Override
    public void stop(BundleContext context) throws Exception {
        // set new Map
        Map<String, String> test = new HashMap<String,String>();

        // add new element
        test.put("test", "test");
    }

}
