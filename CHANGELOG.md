# Changelog
## [0.6.2](https://github.com/shblue21/vscode-spotbugs/compare/v0.6.1...v0.6.2) (2026-05-27)


### Bug Fixes

* publish folder analysis diagnostics for child files ([#54](https://github.com/shblue21/vscode-spotbugs/issues/54)) ([8872af8](https://github.com/shblue21/vscode-spotbugs/commit/8872af8c453810c0794e83ddf0751c3fd2a04043))
* resolve and validate SpotBugs plugin jar paths ([#56](https://github.com/shblue21/vscode-spotbugs/issues/56)) ([c7ba987](https://github.com/shblue21/vscode-spotbugs/commit/c7ba987761433c4f24f37c511f9a9c436d9a28fa))

## [0.6.1](https://github.com/shblue21/vscode-spotbugs/compare/v0.6.0...v0.6.1) (2026-05-19)


### Bug Fixes

* **inspector:** use source navigation in inspector title toolbar ([#43](https://github.com/shblue21/vscode-spotbugs/issues/43)) ([9c4d696](https://github.com/shblue21/vscode-spotbugs/commit/9c4d6964fee0202824bf55cea458a05cb26094c2))

## [0.6.0](https://github.com/shblue21/vscode-spotbugs/compare/v0.5.2...v0.6.0) (2026-05-14)


### Features

* reveal source on finding selection ([#39](https://github.com/shblue21/vscode-spotbugs/issues/39)) ([68c6256](https://github.com/shblue21/vscode-spotbugs/commit/68c6256c180cb1e279f94f6220ea4a8088b06c05))
* add search, group, and sort controls to results view ([#42](https://github.com/shblue21/vscode-spotbugs/issues/42)) ([5a1b3da](https://github.com/shblue21/vscode-spotbugs/commit/5a1b3da65a6e2201816cd6a52d241f4a771f0730))

## [0.5.2](https://github.com/shblue21/vscode-spotbugs/compare/v0.5.1...v0.5.2) (2026-05-08)


### Bug Fixes

* surface SpotBugs analysis failures ([#34](https://github.com/shblue21/vscode-spotbugs/issues/34)) ([72da785](https://github.com/shblue21/vscode-spotbugs/commit/72da785b1bfe820decae57cc1faeaacc5bb0e3cf))

## [0.5.1](https://github.com/shblue21/vscode-spotbugs/compare/v0.5.0...v0.5.1) (2026-04-30)


### Bug Fixes

* **manifest:** align VS Code workspace capabilities and settings ([a5eb9b2](https://github.com/shblue21/vscode-spotbugs/commit/a5eb9b26c6ec041b613d7173c73897ec73e750c7))

## [0.5.0](https://github.com/shblue21/vscode-spotbugs/compare/v0.4.1...v0.5.0) (2026-04-27)


### Features

* add SpotBugs inspector layout ([#29](https://github.com/shblue21/vscode-spotbugs/issues/29)) ([3623769](https://github.com/shblue21/vscode-spotbugs/commit/3623769dc89d0ba4f861dd3c1a97e2bbe498dd68))

## [0.4.1](https://github.com/shblue21/vscode-spotbugs/compare/v0.4.0...v0.4.1) (2026-04-07)


### Bug Fixes

* **runner:** Apply engine analysis settings ([#26](https://github.com/shblue21/vscode-spotbugs/issues/26)) ([6bebb80](https://github.com/shblue21/vscode-spotbugs/commit/6bebb807187715ce422902e49a3db28f6314d84f))

## [0.4.0](https://github.com/shblue21/vscode-spotbugs/compare/v0.3.0...v0.4.0) (2026-04-06)


### Features

* **classpath:** split analysis classpath roles and add extra aux support ([#21](https://github.com/shblue21/vscode-spotbugs/issues/21)) ([3bec0bb](https://github.com/shblue21/vscode-spotbugs/commit/3bec0bb66826a1c3a12c77683d4a21337054b4b9))


### Bug Fixes

* suppress degraded-success notices for terminal workspace failures ([#25](https://github.com/shblue21/vscode-spotbugs/issues/25)) ([51092aa](https://github.com/shblue21/vscode-spotbugs/commit/51092aadfcb86f7271859f2c69bc8992dfe88e5e))

## [0.3.0](https://github.com/shblue21/vscode-spotbugs/compare/v0.2.0...v0.3.0) (2026-03-18)


### Features

* add local SpotBugs HTML detail panel for findings ([1a57807](https://github.com/shblue21/vscode-spotbugs/commit/1a57807445f36b3710b5be36ddd718036ddf4ad1))
* add query-based filtering for cached SpotBugs tree results ([07f222b](https://github.com/shblue21/vscode-spotbugs/commit/07f222bf962c1850271f1fb4ccea0f434b3b61c2))
* add query-based filtering for cached SpotBugs tree results ([8957da1](https://github.com/shblue21/vscode-spotbugs/commit/8957da17eaa83323b4e18ec1de4b8451b94fe747))
* **filters:** match full SpotBugs type & preserve Windows paths ([a206c21](https://github.com/shblue21/vscode-spotbugs/commit/a206c215f227265a62c678aad24b7cd29d7138a5))


### Bug Fixes

* **codeql:** replace ad-hoc HTML sanitizer with allowlist sanitizer ([5cd2139](https://github.com/shblue21/vscode-spotbugs/commit/5cd2139156d823759315b2e63544d86444dfaeb0))

## [0.2.0](https://github.com/shblue21/vscode-spotbugs/compare/v0.1.0...v0.2.0) (2026-03-13)


### Features

* add client-side filters to the SpotBugs tree view ([d582003](https://github.com/shblue21/vscode-spotbugs/commit/d58200360bb1d960ae1209afb1ddf1ea28da7fe9))
* add client-side filters to the SpotBugs tree view ([67e818f](https://github.com/shblue21/vscode-spotbugs/commit/67e818f8f34a83a28867823fb4289195d3ef6a2e))
* Add SpotBugs rule docs quick fix for diagnostics ([0ce8061](https://github.com/shblue21/vscode-spotbugs/commit/0ce8061d0cf19905ee742a6abbf4252ab03ce7d0))
* Add SpotBugs rule docs quick fix for diagnostics ([1ff3d46](https://github.com/shblue21/vscode-spotbugs/commit/1ff3d460bfca011b364fb1156e44071d137c1598))
* align SARIF export with native SpotBugs metadata ([3b79f27](https://github.com/shblue21/vscode-spotbugs/commit/3b79f27efa1f5c8af80f460f1d1afdbd0c1a2776))
* align SARIF export with native SpotBugs metadata ([5c9b8a6](https://github.com/shblue21/vscode-spotbugs/commit/5c9b8a6798c66993352caff0e6f4b750c6f02dcd))

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
