# Changelog
## [0.1.0](https://github.com/shblue21/vscode-spotbugs/compare/v0.0.14...v0.1.0) (2026-03-05)


### Features

* add SpotBugs filter settings and structured filter-file errors ([99b7bef](https://github.com/shblue21/vscode-spotbugs/commit/99b7bef150b99ac7a3723aa2bfeccf7b33b4a41d))
* **command:** Add invocation context ([a79c1df](https://github.com/shblue21/vscode-spotbugs/commit/a79c1df64230b25b2752d67d8f605a9a198b6d54))
* **core:** Introduce new SpotBugs filter path settings in protocol and schema ([9213336](https://github.com/shblue21/vscode-spotbugs/commit/92133363283c86cf0ab493fd9cbfca029b7b0713))
* **filters:** validate filter files ([8f40a09](https://github.com/shblue21/vscode-spotbugs/commit/8f40a097341a894dc99e277082f972bca68d2910))

## [v0.0.14] - 2026-02-10

- Split analysis pipeline layers (orchestration/workspace/lsp) and unify Bug model
- Introduce Finding domain model and centralize JDT LS gateway
- Normalize Finding domain and analysis/LSP plumbing
- Bump version

## [v0.0.13] - 2026-01-12

- Skip analysis when no compiled classes are available
- Bump version
- Update ES target and dev dependencies
- Bump version

## [v0.0.11] - 2026-01-04

- Updates settings documentation
- Standardize analysis response and resolve fullPath in backend BREAKING
-   fix: enable folder analysis and improve empty-result guidance
- Add extension and Java check workflows
- Merge pull request #4 from shblue21/dependabot/npm_and_yarn/npm_and_yarn-bdc76aff73
- Bump version

## [v0.0.10] - 2025-10-30

- Adds SARIF export and diagnostics
- Introduce CommandAction interface and AbstractCommandAction base
- Implement RunAnalysisAction for SpotBugs analysis command
- Update DelegateCommandHandler to use CommandAction system and remove CommandFacade
- Makes config optional
- Renames argument access methods
- Bump version

## [v0.0.9] - 2025-10-10

- Adds diagnostic support
- Removes copy finding as SARIF feature
- Updates GitHub Actions versions
- Removes hover provider
- Adds reset results command
- Bump version to 0.0.9 (release)

## [v0.0.8] - 2025-10-08

- Adds bug report template
- Centralizes analysis logic
- Improves workspace analysis flow
- Adds SARIF export feature
- Bump version to 0.0.8 (release)

## [v0.0.7] - 2025-09-21

- Remove svg badge
- Bump version to 0.0.7 (release)

## [v0.0.6] - 2025-09-21

- Add version and commit badage (readme)
- Improves builder encapsulation
- Update to Executor naming convention
- Adds SpotBugs analysis enhancements,  (analysis)
- Remove logger.show call
- Bump version to 0.0.6 (release)

## [v0.0.5] - 2025-09-12

- Reduce notificion popup message during workspace analysis
- Update vscode extension category and package
- Remove unused config class
- Update actions/checkout v5
- Bump version to 0.0.5 (release)

## [v0.0.4] - 2025-09-03

- Lower VS Code engine requirement to 1.85.0
- Bump version to 0.0.4 (release)

## [v0.0.3] - 2025-09-03

- Separate vscode language server command
- Bump version to 0.0.3 (release)

## [v0.0.2] - 2025-09-03

- Remove unused azure devops pipeline
- Adds SpotBugs demo image
- Removes explanation of plugin workings
- Bump version to 0.0.2 (release)

## [v0.0.1] - 2025-09-01

- Initial commit
- VSCode Spotbugs initializing, and change to repository public
- Adds initial README
- Configures release workflows
