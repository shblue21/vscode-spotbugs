# Third-Party Notices

The source code for SpotBugs for VS Code is licensed under the MIT License unless
otherwise noted.

This extension uses and may bundle third-party components that remain under
their own licenses. The notices below are provided for the main runtime
components and project assets used by this extension.

## SpotBugs

- Project: SpotBugs
- Website: https://spotbugs.github.io/
- Source: https://github.com/spotbugs/spotbugs
- Maven artifact: `com.github.spotbugs:spotbugs`
- License: GNU Lesser General Public License, version 2.1
- License text: https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html

SpotBugs is used to perform Java static analysis. Packaged VSIX builds may
include SpotBugs in the Java runner artifacts under `server/`.

## Gson

- Project: Gson
- Source: https://github.com/google/gson
- Maven artifact: `com.google.code.gson:gson`
- License: Apache License 2.0
- License text: https://www.apache.org/licenses/LICENSE-2.0

Gson is used by the Java runner for JSON serialization.

## SpotBugs Name and Visual Assets

The SpotBugs name is used to identify compatibility with the SpotBugs project.
SpotBugs project logos and icons are licensed by the SpotBugs project under the
Creative Commons Attribution 4.0 International License.

## Other Dependencies

This project also uses npm and Maven dependencies for building, testing, and
runtime integration. Those dependencies retain their respective licenses.
