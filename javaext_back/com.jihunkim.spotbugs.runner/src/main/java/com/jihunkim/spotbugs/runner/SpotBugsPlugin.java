package com.jihunkim.spotbugs.runner;

import java.util.HashMap;
import java.util.Map;

import org.osgi.framework.BundleActivator;
import org.osgi.framework.BundleContext;

public class SpotBugsPlugin implements BundleActivator {

    public static final String PLUGIN_ID = "com.jihunkim.spotbugs.runner";
    public static BundleContext context = null;

    @Override
    public void start(BundleContext context) throws Exception {
        SpotBugsPlugin.context = context;
    }

    @Override
    public void stop(BundleContext context) throws Exception {
        SpotBugsPlugin.context = null;
    }

}
