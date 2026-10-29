# Contributing

Thanks for your interest in improving SpotBugs for VS Code.

## Before you start

- Search existing issues and pull requests before opening a new one.
- For bugs, include VS Code version, extension version, Java version, OS, project
  type, and a minimal example or clear reproduction steps.
- For feature requests, describe the workflow you want to improve and why.
- Do not include private source code, credentials, or sensitive logs in public
  issues.

## Development setup

Requirements:

- Node.js 24 or later
- Java 17 for building the Java runner
- VS Code

Install dependencies and build the extension:

```sh
npm ci
npm run build-server
npm run compile
```

After Java changes, rerun `npm run build-server` from the repository root to
update the JARs in `server/` before trying the extension in VS Code.

## Checks

Run the checks relevant to your change. For extension code:

```sh
npm run format:check
npm test
```

`npm test` compiles, lints, and runs unit and extension-host tests. The host tests
use a Java extension stub; they do not verify live Java LS analysis. In headless
Linux environments, run `xvfb-run -a npm test`.

For Java runner changes, also run:

```sh
cd javaext
./mvnw -B -ntp clean package
```

## Pull requests

- Keep changes focused.
- Update documentation when behavior, settings, commands, or requirements
  change.
- Add or update tests for behavior changes. For bug fixes, add a test that fails
  without the fix when practical.
- Describe the change, checks run, and any compatibility impact or limitations.
- Use a Conventional Commit title, such as `fix: ...` or `feat: ...`, so Release
  Please can categorize the change. Release Please manages versions and `CHANGELOG.md`.
