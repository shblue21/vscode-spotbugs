> ⚠️ This extension is under active development. Frequent changes and updates are expected.

<div align="center">

# SpotBugs for VS Code

Analyze Java code with SpotBugs directly in VS Code. View findings in a dedicated tree view and jump to offending lines with one click.

![SpotBugs demo](images/spotbugs-demo.gif)

</div>

## Features

- Analyze a single file or an entire workspace (Maven/Gradle projects)
- Group findings by category and pattern with severity icons
- Navigate to bug locations in source files

## Requirements

- Java 11 or later (JDK)
- VS Code extension: “Language Support for Java by Red Hat” (redhat.java)

## Getting Started

1) Open a Java project folder in VS Code
2) Run a command:
   - “SpotBugs: Analyze this workspace” (`java.spotbugs.runWorkspace`)
   - “SpotBugs: Analyze File/Folder” (context menu, `java.spotbugs.run`)
3) Review results in the “SpotBugs” view (Activity Bar)

## Commands

- `SpotBugs: Analyze File/Folder` — Analyze selected file or folder
- `SpotBugs: Analyze this workspace` — Build then analyze all projects in the workspace

## Settings

- `spotbugs.effort`: SpotBugs effort level (`min`, `default`, `max`). Default: `default`.

## How It Works

The TypeScript client triggers analysis and renders results. A bundled Java plugin (loaded by jdt.ls) runs SpotBugs, returning findings as JSON. Classpaths and builds are resolved via the Java Language Server.

## Troubleshooting

- Ensure the Red Hat Java extension is installed and the workspace builds without errors
- If analysis returns no results, try “Analyze this workspace” to trigger a full build
- Check the “SpotBugs” output channel for diagnostics

## Contributing

Issues and PRs are welcome. Before submitting, run: `npm run compile`, `npm run lint`, `npm test`. For backend changes, run `npm run build-server`.
