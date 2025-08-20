# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Testing
- `npm run compile` - Compile TypeScript source to JavaScript
- `npm run watch` - Watch mode compilation for development
- `npm run build-server` - Build the Java backend extension (runs Maven build and copies JARs)
- `npm run lint` - Run ESLint on TypeScript source files
- `npm run test` - Run tests (requires compilation first via pretest)
- `npm run clean` - Clean build artifacts

### Java Backend Build
The Java backend is built using Maven with Tycho plugin for Eclipse plugin development:
- `./mvnw clean package` (from `javaext/` directory) - Build Java extension modules
- The build creates both regular JARs and a shaded "all-in-one" JAR with dependencies

## Architecture Overview

This is a VS Code extension for SpotBugs static analysis with a **dual-architecture design**:

### Frontend (TypeScript - VS Code Extension)
- **Entry Point**: `src/extension.ts` - Initializes Config, Logger, and registers commands
- **Configuration**: `src/config.ts` - Manages `spotbugs.*` settings from VS Code configuration
- **Logging**: `src/logger.ts` - Client-side logging to "Spotbugs" output channel with `[Client]` prefix
- **Analysis Commands**: `src/commands/analysis.ts` - Implements `checkCode` and `runWorkspaceAnalysis` functions
- **Data Interface**: `src/bugInfo.ts` - TypeScript interface for bug data exchanged with Java backend

### Backend (Java - Eclipse Plugin Extension)
- **Command Handler**: `DelegateCommandHandler.java` - Receives commands from TypeScript via `java.execute.workspaceCommand`
- **Analysis Service**: `AnalyzerService.java` - Configures and executes SpotBugs analysis using FindBugs2 engine
- **Executor**: `SimpleFindbugsExecutor.java` - Wraps FindBugs2 engine for direct execution
- **Data Transfer Objects**: `api/Config.java` and `api/BugInfo.java` - Java DTOs for JSON communication

### Communication Pattern
1. TypeScript creates `Config` object from VS Code settings
2. Analysis commands (`java.spotbugs.run`) pass file path and `JSON.stringify(config)` to Java
3. Java `DelegateCommandHandler` uses Gson to parse config JSON into `Config.java` DTO
4. Java performs analysis and returns JSON array of `BugInfo` objects
5. TypeScript parses results and enriches with full file paths using `java.project.getClasspaths`

### Logging Strategy
- **Client (TypeScript)**: Logs to "Spotbugs" output channel with `[Client]` prefix
- **Server (Java)**: Uses `System.out.println` with prefixes like `[Spotbugs-Runner]`, `[Spotbugs-Service]` - appears in "Language Support for Java" output channel

### Key Dependencies
- **Frontend**: Depends on `redhat.java` extension for Java Language Server integration
- **Backend**: SpotBugs 4.8.3, Gson 2.10.1, built as Eclipse plugin with Tycho Maven plugin
- **Integration**: Uses `javaExtensions` in package.json to load Java backend JARs

### Current Data Flow Enhancement
The `BugInfo` interface includes `realSourcePath` and optional `fullPath` fields. The `enrichBugsWithFullPaths` function in `analysis.ts` resolves relative source paths to absolute paths using Java Language Server's classpath information.

### Extension Configuration
Three main settings configurable via VS Code settings:
- `spotbugs.effort`: Analysis effort level (min/default/max)
- `spotbugs.java.home`: Optional Java home override
- `spotbugs.plugins.file`: Optional SpotBugs plugins file path