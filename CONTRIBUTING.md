# Contributing

Thanks for your interest in improving SpotBugs for VS Code.

## Before You Start

- Search existing issues before opening a new one.
- For bugs, include VS Code version, extension version, Java version, OS, project
  type, and clear reproduction steps.
- For feature requests, describe the workflow you want to improve and why.
- Do not include private source code, credentials, or sensitive logs in public
  issues.

## Development Setup

Requirements:

- Node.js 24 or later
- Java 17 for building the Java runner
- VS Code

Install dependencies:

```sh
npm ci
```

Build the Java runner:

```sh
npm run build-server
```

Compile the extension:

```sh
npm run compile
```

## Checks

Run these before opening a pull request:

```sh
npm run lint
npm run format:check
npm test
```

For Java runner-only changes, also run:

```sh
cd javaext
./mvnw -B -ntp clean package
```

## Pull Requests

- Keep changes focused.
- Update documentation when behavior, settings, commands, or requirements
  change.
- Add or update tests for behavior changes when practical.
- Explain user-visible impact and any known limitations in the PR description.
