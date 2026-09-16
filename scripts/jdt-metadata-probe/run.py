#!/usr/bin/env python3
"""Run a read-only probe in a fresh JDT LS workspace; never attach to an editor."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import time
import zipfile


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def fixtures(base):
    first, second = base / "root-one", base / "root-two"
    app = first / "eclipse-app"
    write(app / ".project", '''<projectDescription><name>probe-eclipse</name><comment/>
<projects/><buildSpec><buildCommand><name>org.eclipse.jdt.core.javabuilder</name><arguments/></buildCommand></buildSpec>
<natures><nature>org.eclipse.jdt.core.javanature</nature></natures></projectDescription>''')
    write(app / ".classpath", '''<classpath>
<classpathentry kind="src" path="src/main/java" including="demo/**" excluding="demo/excluded/**|nested/"/>
<classpathentry kind="src" path="src/main/java/nested" output="custom/nested"/>
<classpathentry kind="src" path="src/test/java" output="custom/test"><attributes><attribute name="test" value="true"/></attributes></classpathentry>
<classpathentry kind="src" path="generated/java" output="custom/generated"/>
<classpathentry kind="con" path="org.eclipse.jdt.launching.JRE_CONTAINER"/>
<classpathentry kind="output" path="custom/main"/></classpath>''')
    for source, name in [("src/main/java", "Main"), ("src/test/java", "Test"), ("generated/java", "Generated"), ("src/main/java/nested", "Nested")]:
        write(app / source / f"demo/{name}.java", f"package demo; public class {name} {{}}")
    write(app / "src/main/java/demo/excluded/Excluded.java", "package demo.excluded; public class Excluded {}")
    write(app / "src/main/java/other/NotIncluded.java", "package other; public class NotIncluded {}")

    maven = first / "maven-parent"
    write(maven / "pom.xml", '''<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>
<groupId>probe</groupId><artifactId>parent</artifactId><version>1</version><packaging>pom</packaging>
<modules><module>app</module></modules><properties><maven.compiler.release>17</maven.compiler.release></properties></project>''')
    write(maven / "app/pom.xml", '''<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>
<parent><groupId>probe</groupId><artifactId>parent</artifactId><version>1</version></parent><artifactId>app</artifactId>
<build><outputDirectory>${project.basedir}/custom/main</outputDirectory><testOutputDirectory>${project.basedir}/custom/test</testOutputDirectory></build></project>''')
    write(maven / "app/src/main/java/demo/Main.java", "package demo; public class Main {}")
    write(maven / "app/src/test/java/demo/Test.java", "package demo; public class Test {}")

    modular = second / "modular"
    write(modular / ".project", '''<projectDescription><name>probe-modular</name><comment/><projects/>
<buildSpec><buildCommand><name>org.eclipse.jdt.core.javabuilder</name><arguments/></buildCommand></buildSpec>
<natures><nature>org.eclipse.jdt.core.javanature</nature></natures></projectDescription>''')
    write(modular / ".classpath", '''<classpath><classpathentry kind="src" path="src"/>
<classpathentry kind="con" path="org.eclipse.jdt.launching.JRE_CONTAINER"><attributes><attribute name="module" value="true"/></attributes></classpathentry>
<classpathentry kind="output" path="bin"/></classpath>''')
    write(modular / ".settings/org.eclipse.jdt.core.prefs", "eclipse.preferences.version=1\norg.eclipse.jdt.core.compiler.compliance=17\norg.eclipse.jdt.core.compiler.source=17\norg.eclipse.jdt.core.compiler.codegen.targetPlatform=17\n")
    write(modular / "src/module-info.java", "module probe.modular { requires java.logging; }")
    write(modular / "src/demo/ModuleClass.java", "package demo; public class ModuleClass {}")

    gradle = second / "gradle-parent"
    write(gradle / "settings.gradle", "rootProject.name = 'probe-gradle-parent'\ninclude 'app', 'library', 'util'\n")
    write(gradle / "library/build.gradle", "plugins { id 'java-library' }\njava { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }\ndependencies { implementation project(':util') }\n")
    write(gradle / "library/src/main/java/library/Library.java", "package library; public class Library {}")
    write(gradle / "util/build.gradle", "plugins { id 'java-library' }\njava { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }\n")
    write(gradle / "util/src/main/java/util/Utility.java", "package util; public class Utility {}")
    write(gradle / "app/build.gradle", '''plugins { id 'java' }
java { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
sourceSets {
    main { java.srcDir 'generated/java' }
    integrationTest { java.srcDir 'src/integrationTest/java'; compileClasspath += sourceSets.main.output; runtimeClasspath += sourceSets.main.output }
}
dependencies {
    implementation files('libs/main-only.jar')
    implementation project(':library')
    compileOnly files('libs/compile-only.jar')
    runtimeOnly files('libs/runtime-only.jar')
    testImplementation files('libs/test-only.jar')
    integrationTestImplementation files('libs/integration-only.jar')
}
''')
    for name in ("main-only", "test-only", "integration-only", "compile-only", "runtime-only"):
        jar = gradle / "app/libs" / f"{name}.jar"
        jar.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(jar, "w") as output:
            output.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\n\n")
    for source, name in [("src/main/java", "Main"), ("src/test/java", "Test"), ("generated/java", "Generated"), ("src/integrationTest/java", "Integration")]:
        write(gradle / "app" / source / f"demo/{name}.java", f"package demo; public class {name} {{}}")
    return [first, second], [app / "src/main/java/demo/Main.java", app / "src/main/java/demo/excluded/Excluded.java", maven / "app", maven / "app/src/main/java/demo/Main.java", gradle / "app/src/integrationTest/java/demo/Integration.java", app / "custom/main/demo/Main.class", first]


def verify(result):
    """Check actual model observations, including the expected limitations of this runtime."""
    checks = []

    def check(name, condition):
        checks.append({"name": name, "passed": bool(condition)})

    def project(suffix):
        return next(p for p in result["projects"] if p["uri"].rstrip("/").endswith(suffix))

    def source(p, suffix):
        return next(e for e in p["rawEntries"] if e["kind"] == 3 and e["path"].endswith(suffix))

    def paths(p, scope):
        env = p["environments"][scope]
        return env.get("classpaths", []) + env.get("modulepaths", [])

    eclipse, maven, gradle, modular = [project(p) for p in ("/eclipse-app", "/maven-parent/app", "/gradle-parent/app", "/modular")]
    check("raw source entry kind is 3, not prototype's 1", result["constants"] == {"sourceEntryKind": 3, "libraryEntryKind": 1})
    main = source(eclipse, "/src/main/java")
    check("default output applies only when source-specific output absent", main.get("declaredOutput") is None and main["effectiveOutput"].endswith("/custom/main"))
    check("test-specific output and test attribute", source(eclipse, "/src/test/java")["isTest"] and source(eclipse, "/src/test/java")["effectiveOutput"].endswith("/custom/test"))
    check("generated custom output preserved", source(eclipse, "/generated/java")["effectiveOutput"].endswith("/custom/generated"))
    check("nested source uses its own output", source(eclipse, "/src/main/java/nested")["effectiveOutput"].endswith("/custom/nested"))
    check("JDT includes and excludes preserved", main["includes"] == ["demo/**"] and set(main["excludes"]) == {"demo/excluded/**", "nested/"})
    eclipse_units = [uri for root in eclipse["sourceRoots"] for uri in root["units"]]
    check("JDT enumeration excludes non-included and excluded Java sources",
          len(eclipse_units) == 5
          and sum(u.endswith("/EntryPointBug.java") for u in eclipse_units) == 1
          and not any("Excluded.java" in u or "NotIncluded.java" in u for u in eclipse_units))
    check("JDT enumeration does not duplicate nested source", len(eclipse_units) == len(set(eclipse_units)) and sum(u.endswith("/Nested.java") for u in eclipse_units) == 1)
    wire = eclipse["settingsCommand"]["org.eclipse.jdt.ls.core.classpathEntries"]
    check("wire source kinds are also 3", len(wire) == 4 and all(e["kind"] == 3 for e in wire))
    check("settings command does not expose inclusion/exclusion patterns", all("includes" not in e and "excludes" not in e for e in wire))
    check("Maven custom main and test outputs differ", source(maven, "/src/main/java")["effectiveOutput"].endswith("/custom/main") and source(maven, "/src/test/java")["effectiveOutput"].endswith("/custom/test"))
    check("Maven generated annotation source mapping available", source(maven, "/target/generated-sources/annotations")["effectiveOutput"].endswith("/custom/main"))
    check("Maven runtime excludes test while test includes both", not any(p.endswith("/custom/test") for p in paths(maven, "runtime")) and any(p.endswith("/custom/test") for p in paths(maven, "test")))
    integration = source(gradle, "/src/integrationTest/java")
    check("Gradle custom source-set identity exposed", integration["attributes"].get("gradle_scope") == "integrationTest" and integration["isTest"])
    check("Gradle generated source shares main output", source(gradle, "/generated/java")["effectiveOutput"] == source(gradle, "/src/main/java")["effectiveOutput"])
    check("Gradle JDT outputs are bin/sourceSet, not guessed build/classes", integration["effectiveOutput"].endswith("/bin/integrationTest"))
    check("Gradle getClasspaths includes test and integration outputs even for runtime", all(any(p.endswith("/bin/" + name) for p in paths(gradle, "runtime")) for name in ("main", "test", "integrationTest")))
    check("Gradle integrationTest scope string behaves as runtime, not custom scope", paths(gradle, "runtime") == paths(gradle, "integrationTest") and not any(p.endswith("/integration-only.jar") for p in paths(gradle, "integrationTest")))
    check("Gradle test scope includes both test and integration dependency markers", all(any(p.endswith("/" + name + ".jar") for p in paths(gradle, "test")) for name in ("main-only", "test-only", "integration-only")))
    libs = [e for e in gradle["resolvedEntries"] if e["path"].endswith("-only.jar")]
    check("Gradle dependency usage scope available in resolved JDT entries", len(libs) == 5 and all("gradle_used_by_scope" in e["attributes"] for e in libs))
    check("modular project uses non-empty modulepaths", bool(modular["environments"]["runtime"].get("modulepaths")))
    check("both workspace roots imported", "/root-one/" in maven["uri"] and "/root-two/" in gradle["uri"])
    for suffix in ("/maven-parent/app", "/maven-parent/app/src/main/java/demo/Main.java", "/gradle-parent/app/src/integrationTest/java/demo/Integration.java"):
        item = next(i for i in result["ownership"] if i["uri"].endswith(suffix))
        expected = maven if "/maven-parent/" in suffix else gradle
        check("nested owning project: " + suffix, item.get("commandOwner") == expected["uri"])
    excluded = next(i for i in result["ownership"] if i["uri"].endswith("/Excluded.java"))
    check("owning project alone does not imply source is on classpath", excluded.get("commandOwner") == eclipse["uri"] and excluded.get("onClasspath") is False)
    aggregate = result["ownership"][-1]
    check("aggregate root is not coerced into one owning project", "commandOwnerError" in aggregate)
    for p in result["projects"]:
        snapshot = p["settingsSnapshot"]
        valid = not snapshot.get("errors") and len(snapshot.get("results", [])) == 1
        check("settings command: " + p["name"], valid)
        if valid:
            value = snapshot["results"][0]
            check("selection facts preserved: " + p["name"], value["settings"] == p["settingsCommand"])
            expected = {e["path"]: e["output"] for e in p["settingsCommand"].get("org.eclipse.jdt.ls.core.classpathEntries", [])
                        if e.get("kind") == 3 and e.get("output")}
            check("declared source outputs: " + p["name"], value["declaredSourceOutputs"] == expected)
    return checks


class Lsp:
    def __init__(self, process, transcript):
        self.process, self.transcript = process, transcript
        self.incoming = queue.Queue()
        self.sequence = 0
        threading.Thread(target=self.read, daemon=True).start()

    def read(self):
        try:
            while True:
                headers = {}
                while True:
                    line = self.process.stdout.readline()
                    if not line:
                        raise EOFError("JDT LS stdout closed")
                    if line == b"\r\n":
                        break
                    name, value = line.decode().split(":", 1)
                    headers[name.lower()] = value.strip()
                length = int(headers["content-length"])
                data = b""
                while len(data) < length:
                    chunk = self.process.stdout.read(length - len(data))
                    if not chunk:
                        raise EOFError("Incomplete LSP message")
                    data += chunk
                self.incoming.put(json.loads(data))
        except Exception as error:
            self.incoming.put(error)

    def send(self, message):
        payload = json.dumps({"jsonrpc": "2.0", **message}).encode()
        self.process.stdin.write(f"Content-Length: {len(payload)}\r\n\r\n".encode() + payload)
        self.process.stdin.flush()

    def request(self, method, params, timeout=180):
        self.sequence += 1
        seq = self.sequence
        self.send({"id": seq, "method": method, "params": params})
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            item = self.incoming.get(timeout=max(0.1, deadline - time.monotonic()))
            if isinstance(item, Exception):
                raise item
            self.transcript.write(json.dumps(item) + "\n")
            self.transcript.flush()
            if "method" in item and "id" in item:
                # Import/build progress requests do not need editor interaction.
                value = [] if item["method"] == "workspace/configuration" else None
                self.send({"id": item["id"], "result": value})
            elif item.get("id") == seq:
                if "error" in item:
                    raise RuntimeError(json.dumps(item["error"]))
                return item.get("result")
        raise TimeoutError(method)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", type=Path, required=True, help="redhat.java/server directory")
    parser.add_argument("--gradle-home", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="New output directory, must not exist")
    parser.add_argument("--bundle", type=Path, required=True, help="Current packaged extension bundle")
    args = parser.parse_args()
    args.server = args.server.resolve()
    args.gradle_home = args.gradle_home.resolve()
    base = args.output.resolve()
    base.mkdir(parents=True, exist_ok=False)
    env = dict(os.environ)
    # Do not echo inherited local JVM options or attach to an existing LSP socket.
    for key in ("JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS", "CLIENT_PORT", "CLIENT_HOST"):
        env.pop(key, None)
    extension_package = args.server.parent / "package.json"
    runtime = {"server": str(args.server), "gradleHome": str(args.gradle_home),
               "java": subprocess.run(["java", "-version"], env=env, capture_output=True, text=True, check=True).stderr.strip(),
               "redhatJava": json.loads(extension_package.read_text())["version"] if extension_package.exists() else None,
               "bundles": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                           for pattern in ("org.eclipse.jdt.ls.core_*.jar", "org.eclipse.jdt.core_*.jar", "org.eclipse.buildship.core_*.jar")
                           for p in (args.server / "plugins").glob(pattern)}}
    write(base / "runtime.json", json.dumps(runtime, indent=2))
    roots, queries = fixtures(base / "fixtures")
    write(roots[0] / "eclipse-app/src/main/java/demo/EntryPointBug.java",
          "package demo; public class EntryPointBug { public int fail() { Object value = null; return value.hashCode(); } }")
    classes = base / "probe-classes"
    classes.mkdir()
    source = Path(__file__).with_name("ProbeCommand.java")
    subprocess.run(["javac", "--release", "11", "-cp", str(args.server / "plugins/*"), "-d", str(classes), str(source)], env=env, check=True)
    bundle = base / "probe.jar"
    with zipfile.ZipFile(bundle, "w") as jar:
        jar.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\nBundle-ManifestVersion: 2\nBundle-SymbolicName: com.spotbugs.metadata.probe;singleton:=true\nBundle-Version: 1.0.0\nBundle-RequiredExecutionEnvironment: JavaSE-11\nRequire-Bundle: org.eclipse.jdt.ls.core,org.eclipse.core.runtime,\n org.eclipse.core.resources,org.eclipse.jdt.core,com.google.gson\n\n")
        jar.writestr("plugin.xml", '<plugin><extension point="org.eclipse.jdt.ls.core.delegateCommandHandler"><delegateCommandHandler class="com.spotbugs.probe.ProbeCommand"><command id="spotbugs.probe.metadata"/></delegateCommandHandler></extension></plugin>')
        for file in classes.rglob("*.class"):
            jar.write(file, file.relative_to(classes).as_posix())
    config = base / "config"
    shutil.copytree(args.server / "config_mac_arm", config)
    launcher = next((args.server / "plugins").glob("org.eclipse.equinox.launcher_*.jar"))
    command = ["java", "-Declipse.application=org.eclipse.jdt.ls.core.id1", "-Dosgi.bundles.defaultStartLevel=4", "-Declipse.product=org.eclipse.jdt.ls.core.product", "-Djava.awt.headless=true", "-Xmx1G", "--add-modules=ALL-SYSTEM", "--add-opens", "java.base/java.util=ALL-UNNAMED", "--add-opens", "java.base/java.lang=ALL-UNNAMED", "-jar", str(launcher), "-configuration", str(config), "-data", str(base / "workspace")]
    production = args.bundle.resolve()
    runtime["productionBundle"] = {"path": str(production), "sha256": hashlib.sha256(production.read_bytes()).hexdigest()}
    write(base / "runtime.json", json.dumps(runtime, indent=2))
    bundles = [str(production), str(bundle)]
    with (base / "stderr.log").open("w") as stderr, (base / "lsp.jsonl").open("w") as transcript:
        process = subprocess.Popen(command, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr)
        rpc = Lsp(process, transcript)
        try:
            print("Starting isolated JDT LS", flush=True)
            initialization = rpc.request("initialize", {
                "processId": os.getpid(), "rootUri": roots[0].as_uri(),
                "workspaceFolders": [{"uri": root.as_uri(), "name": root.name} for root in roots],
                "capabilities": {"workspace": {"workspaceFolders": True}},
                "initializationOptions": {"bundles": bundles, "workspaceFolders": [root.as_uri() for root in roots],
                    "settings": {"java": {"autobuild": {"enabled": True}, "import": {"gradle": {"enabled": True, "home": str(args.gradle_home)}, "maven": {"enabled": True}}, "configuration": {"updateBuildConfiguration": "automatic"}, "errors": {"incompleteClasspath": {"severity": "warning"}}}}}
            })
            write(base / "initialize.json", json.dumps(initialization, indent=2))
            rpc.send({"method": "initialized", "params": {}})
            build = rpc.request("java/buildWorkspace", True, timeout=180)
            write(base / "build.json", json.dumps(build))
            print("Isolated fixture build result:", build, flush=True)
            if build != 1:
                raise RuntimeError("Fixture build did not succeed; inspect build.json and workspace log")
            # Waiting for a command is also a protocol pump for server requests.
            for attempt in range(30):
                data = rpc.request("workspace/executeCommand", {"command": "spotbugs.probe.metadata", "arguments": [path.as_uri() for path in queries]}, timeout=180)
                result = json.loads(data) if isinstance(data, str) else data
                write(base / "metadata.json", json.dumps(result, indent=2))
                names = [p["name"] for p in result["projects"]]
                print("Imported projects:", ", ".join(names), flush=True)
                if all(any(p["uri"].rstrip("/").endswith(suffix) for p in result["projects"]) for suffix in ("/eclipse-app", "/maven-parent/app", "/modular", "/gradle-parent/app")):
                    break
                time.sleep(2)
            else:
                raise RuntimeError("Expected Eclipse, Maven, modular and Gradle Java projects were not all imported")
            for project in result["projects"]:
                response = rpc.request("workspace/executeCommand", {
                    "command": "java.spotbugs.project.settings", "arguments": [project["uri"]]
                }, timeout=60)
                project["settingsSnapshot"] = json.loads(response) if isinstance(response, str) else response
            write(base / "metadata.json", json.dumps(result, indent=2))
            project = roots[0] / "eclipse-app"
            source = project / "src/main/java"
            output = project / "custom/main"
            responses = {}
            for kind in ("source", "artifact"):
                paths = [source / ("demo/" + name + ".java") if kind == "source"
                         else output / ("demo/" + name + ".class") for name in ("EntryPointBug", "Main")]
                payload = {"schemaVersion": 2, "effort": "default", "inputs": [{"kind": kind, "path": str(p)} for p in paths],
                           "sourcepaths": [str(source)], "sourceOutputs": {str(source): str(output)},
                           "targetResolutionRoots": [str(output)], "runtimeClasspaths": [str(output)], "includeBaselineXml": True}
                command_id = (
                    "java.spotbugs.analyzeSources" if kind == "source" else "java.spotbugs.analyzeArtifacts")
                response = rpc.request("workspace/executeCommand", {"command": command_id,
                                       "arguments": [str(paths[0]), json.dumps(payload)]}, timeout=120)
                decoded = json.loads(response) if isinstance(response, str) else response
                if decoded.get("errors") or not decoded.get("results") or decoded.get("stats", {}).get("targetCount") != 2:
                    raise RuntimeError("Expected two analyzed classes and a finding: " + json.dumps(decoded))
                sarif = json.loads(decoded.get("nativeSarif", "{}"))
                if not any(bug.get("ruleId") == "NP_ALWAYS_NULL" for run in sarif.get("runs", []) for bug in run.get("results", [])):
                    raise RuntimeError("Expected the fixture finding in native SARIF")
                if 'type="NP_ALWAYS_NULL"' not in decoded.get("baselineXml", ""):
                    raise RuntimeError("Expected the fixture finding in baseline XML")
                responses[kind] = decoded
                wrong_id = "java.spotbugs.analyzeArtifacts" if kind == "source" else "java.spotbugs.analyzeSources"
                wrong = rpc.request("workspace/executeCommand", {"command": wrong_id,
                                    "arguments": [str(paths[0]), json.dumps(payload)]}, timeout=60)
                wrong = json.loads(wrong) if isinstance(wrong, str) else wrong
                if wrong.get("errors", [{}])[0].get("code") != "INVALID_ARGUMENT" or "stats" in wrong:
                    raise RuntimeError("Mismatched kind reached analysis: " + json.dumps(wrong))
                responses[kind + "RejectedByOtherEndpoint"] = wrong
            try:
                retired = rpc.request("workspace/executeCommand", {"command": "java.spotbugs.run",
                                      "arguments": [str(paths[0]), json.dumps(payload)]}, timeout=60)
            except RuntimeError as error:
                failure = json.loads(str(error))
                if failure.get("code") != -32601 or failure.get("message") != "No delegateCommandHandler for java.spotbugs.run":
                    raise
                responses["oldCommandRejected"] = True
            else:
                raise RuntimeError("Old run command is still registered: " + str(retired))
            write(base / "analysis-entrypoints.json", json.dumps(responses, indent=2))
            print("Metadata saved:", base / "metadata.json", flush=True)
            checks = verify(result)
            write(base / "checks.json", json.dumps(checks, indent=2))
            for check in checks:
                print(("PASS " if check["passed"] else "FAIL ") + check["name"], flush=True)
            if not all(c["passed"] for c in checks):
                raise RuntimeError("Metadata observations changed; inspect checks.json before drawing conclusions")
        finally:
            if process.poll() is None:
                try:
                    rpc.request("shutdown", None, timeout=15)
                    rpc.send({"method": "exit"})
                    process.wait(timeout=15)
                except Exception:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()


if __name__ == "__main__":
    main()
