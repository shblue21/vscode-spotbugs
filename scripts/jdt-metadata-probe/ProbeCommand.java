package com.spotbugs.probe;

import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.Gson;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.core.*;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;
import org.eclipse.jdt.ls.core.internal.JDTUtils;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.jdt.ls.core.internal.commands.ProjectCommand;

/** Read-only probe loaded only by run.py into its isolated JDT LS workspace. */
public final class ProbeCommand implements IDelegateCommandHandler {
    @Override
    public Object executeCommand(String command, List<Object> args, IProgressMonitor monitor) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("constants", Map.of("sourceEntryKind", IClasspathEntry.CPE_SOURCE, "libraryEntryKind", IClasspathEntry.CPE_LIBRARY));
        List<Object> projects = new ArrayList<>();
        for (IJavaProject project : ProjectUtils.getJavaProjects()) {
            if (monitor.isCanceled()) throw new java.util.concurrent.CancellationException();
            projects.add(describe(project, monitor));
        }
        result.put("projects", projects);
        List<Object> ownership = new ArrayList<>();
        for (Object arg : args) {
            String uri = String.valueOf(arg);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("uri", uri);
            try {
                item.put("commandOwner", ProjectCommand.getJavaProjectFromUri(uri).getProject().getLocationURI());
            } catch (Exception e) {
                item.put("commandOwnerError", e.getMessage());
            }
            ICompilationUnit unit = JDTUtils.resolveCompilationUnit(uri);
            if (unit != null) {
                item.put("compilationUnitOwner", unit.getJavaProject().getProject().getLocationURI());
                item.put("onClasspath", unit.getJavaProject().isOnClasspath(unit));
            }
            List<String> resourceOwners = new ArrayList<>();
            for (IResource file : ResourcesPlugin.getWorkspace().getRoot().findFilesForLocationURI(URI.create(uri))) {
                resourceOwners.add(file.getProject().getLocationURI().toString());
            }
            for (IResource folder : ResourcesPlugin.getWorkspace().getRoot().findContainersForLocationURI(URI.create(uri))) {
                resourceOwners.add(folder.getProject().getLocationURI().toString());
            }
            item.put("resourceOwners", resourceOwners);
            ownership.add(item);
        }
        result.put("ownership", ownership);
        return new Gson().toJson(result);
    }

    private Map<String, Object> describe(IJavaProject project, IProgressMonitor monitor) throws Exception {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("name", project.getElementName());
        item.put("uri", project.getProject().getLocationURI());
        item.put("natures", project.getProject().getDescription().getNatureIds());
        item.put("defaultOutput", location(project.getOutputLocation()));
        List<Object> entries = new ArrayList<>();
        for (IClasspathEntry entry : project.getRawClasspath()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("kind", entry.getEntryKind());
            row.put("workspacePath", entry.getPath().toPortableString());
            row.put("path", entry.getEntryKind() == IClasspathEntry.CPE_SOURCE ? location(entry.getPath()) : entry.getPath().toOSString());
            row.put("isTest", entry.isTest());
            row.put("includes", Arrays.stream(entry.getInclusionPatterns()).map(IPath::toPortableString).toArray());
            row.put("excludes", Arrays.stream(entry.getExclusionPatterns()).map(IPath::toPortableString).toArray());
            Map<String, String> attributes = new LinkedHashMap<>();
            for (IClasspathAttribute attribute : entry.getExtraAttributes()) attributes.put(attribute.getName(), attribute.getValue());
            row.put("attributes", attributes);
            if (entry.getEntryKind() == IClasspathEntry.CPE_SOURCE) {
                row.put("declaredOutput", entry.getOutputLocation() == null ? null : location(entry.getOutputLocation()));
                row.put("effectiveOutput", location(entry.getOutputLocation() == null ? project.getOutputLocation() : entry.getOutputLocation()));
            }
            entries.add(row);
        }
        item.put("rawEntries", entries);
        List<Object> resolved = new ArrayList<>();
        for (IClasspathEntry entry : project.getResolvedClasspath(true)) {
            Map<String, String> attributes = new LinkedHashMap<>();
            for (IClasspathAttribute attribute : entry.getExtraAttributes()) attributes.put(attribute.getName(), attribute.getValue());
            resolved.add(Map.of("kind", entry.getEntryKind(), "path", entry.getPath().toOSString(), "attributes", attributes));
        }
        item.put("resolvedEntries", resolved);
        List<Object> roots = new ArrayList<>();
        for (IPackageFragmentRoot root : project.getPackageFragmentRoots()) {
            if (root.getKind() != IPackageFragmentRoot.K_SOURCE) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("path", location(root.getPath()));
            List<String> units = new ArrayList<>();
            for (IJavaElement child : root.getChildren()) {
                for (ICompilationUnit unit : ((IPackageFragment) child).getCompilationUnits()) {
                    units.add(unit.getResource().getLocationURI().toString());
                }
            }
            row.put("units", units);
            roots.add(row);
        }
        item.put("sourceRoots", roots);
        Map<String, Object> environments = new LinkedHashMap<>();
        for (String scope : List.of("runtime", "test", "integrationTest")) {
            try {
                ProjectCommand.ClasspathOptions options = new ProjectCommand.ClasspathOptions();
                options.scope = scope;
                environments.put(scope, ProjectCommand.getClasspaths(project.getProject().getLocationURI().toString(), options));
            } catch (Exception e) {
                environments.put(scope, Map.of("error", String.valueOf(e.getMessage())));
            }
        }
        item.put("environments", environments);
        try {
            item.put("settingsCommand", ProjectCommand.getProjectSettings(project.getProject().getLocationURI().toString(),
                    List.of(ProjectCommand.SOURCE_PATHS, ProjectCommand.OUTPUT_PATH, "org.eclipse.jdt.ls.core.classpathEntries")));
        } catch (Exception e) {
            item.put("settingsError", e.getMessage());
        }
        return item;
    }

    private String location(IPath path) {
        IResource resource = ResourcesPlugin.getWorkspace().getRoot().findMember(path);
        if (resource == null && path.segmentCount() > 1) {
            resource = ResourcesPlugin.getWorkspace().getRoot().getFolder(path);
        }
        return resource == null || resource.getLocation() == null ? null : resource.getLocation().toOSString();
    }
}
