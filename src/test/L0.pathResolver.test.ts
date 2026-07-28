import * as assert from 'assert';
import type { Uri } from 'vscode';
import type { Finding } from '../model/finding';
import type { PathResolverDeps } from '../workspace/pathResolver';
import { installVscodeMock, resetVscodeMock } from './helpers/mockVscode';

installVscodeMock();

describe('pathResolver', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('uses the provided sourcepath snapshot in order without another classpath lookup', async () => {
    const { createPathResolver } = await import('../workspace/pathResolver');
    const sourcepaths = ['/workspace/source-a', '/workspace/source-b'];
    const statCalls: string[] = [];
    let classpathCalls = 0;
    const resolver = createPathResolver(
      makeDeps({
        getClasspaths: async () => {
          classpathCalls += 1;
          return classpathResult(['/unexpected']);
        },
        statPath: async (candidatePath) => {
          statCalls.push(candidatePath);
          if (candidatePath === '/workspace/source-b/com/acme/Foo.java') {
            return {};
          }
          throw new Error('not found');
        },
      })
    );

    const resolution = resolver.addFullPaths(
      [makeFinding('com/acme/Foo.java')],
      undefined,
      sourcepaths
    );
    sourcepaths[0] = '/workspace/mutated';
    const [result] = await resolution;

    assert.strictEqual(
      result.location.fullPath,
      '/workspace/source-b/com/acme/Foo.java'
    );
    assert.deepStrictEqual(statCalls, [
      '/workspace/source-a/com/acme/Foo.java',
      '/workspace/source-b/com/acme/Foo.java',
    ]);
    assert.strictEqual(classpathCalls, 0);
  });

  it('treats an empty sourcepath snapshot as authoritative', async () => {
    const { createPathResolver } = await import('../workspace/pathResolver');
    const statCalls: string[] = [];
    let classpathCalls = 0;
    const resolver = createPathResolver(
      makeDeps({
        getClasspaths: async () => {
          classpathCalls += 1;
          return classpathResult(['/unexpected']);
        },
        getProjectRootPaths: async () => ['/workspace/project'],
        statPath: async (candidatePath) => {
          statCalls.push(candidatePath);
          if (
            candidatePath ===
            '/workspace/project/src/test/java/com/acme/Foo.java'
          ) {
            return {};
          }
          throw new Error('not found');
        },
      })
    );

    const [result] = await resolver.addFullPaths(
      [makeFinding('com/acme/Foo.java')],
      undefined,
      []
    );

    assert.strictEqual(
      result.location.fullPath,
      '/workspace/project/src/test/java/com/acme/Foo.java'
    );
    assert.deepStrictEqual(statCalls, [
      '/workspace/project/src/main/java/com/acme/Foo.java',
      '/workspace/project/src/test/java/com/acme/Foo.java',
    ]);
    assert.strictEqual(classpathCalls, 0);
  });

  it('looks up unavailable sourcepaths once per finding batch', async () => {
    const vscode = installVscodeMock();
    const { createPathResolver } = await import('../workspace/pathResolver');
    const preferredProject = vscode.Uri.file('/workspace/project-a') as unknown as Uri;
    const requestedProjects: Array<Uri | string | undefined> = [];
    const resolver = createPathResolver(
      makeDeps({
        getClasspaths: async (project) => {
          requestedProjects.push(project);
          return classpathResult(['/workspace/project-a/source']);
        },
        statPath: async (candidatePath) => {
          if (candidatePath.startsWith('/workspace/project-a/source/')) {
            return {};
          }
          throw new Error('not found');
        },
      })
    );

    const results = await resolver.addFullPaths(
      [
        makeFinding('com/acme/Foo.java'),
        makeFinding('com/acme/Bar.java'),
      ],
      preferredProject
    );

    assert.deepStrictEqual(
      results.map((finding) => finding.location.fullPath),
      [
        '/workspace/project-a/source/com/acme/Foo.java',
        '/workspace/project-a/source/com/acme/Bar.java',
      ]
    );
    assert.deepStrictEqual(requestedProjects, [preferredProject]);
  });

  it('keeps sequential project batches isolated', async () => {
    const vscode = installVscodeMock();
    const { createPathResolver } = await import('../workspace/pathResolver');
    const projectA = vscode.Uri.file('/workspace/project-a') as unknown as Uri;
    const projectB = vscode.Uri.file('/workspace/project-b') as unknown as Uri;
    const requestedProjects: string[] = [];
    const resolver = createPathResolver(
      makeDeps({
        getClasspaths: async (project) => {
          const projectPath =
            typeof project === 'string' ? project : project?.fsPath ?? '';
          requestedProjects.push(projectPath);
          return classpathResult([`${projectPath}/source`]);
        },
        statPath: async () => ({}),
      })
    );

    const [findingA] = await resolver.addFullPaths(
      [makeFinding('com/acme/Foo.java')],
      projectA
    );
    const [findingB] = await resolver.addFullPaths(
      [makeFinding('com/acme/Foo.java')],
      projectB
    );

    assert.strictEqual(
      findingA.location.fullPath,
      '/workspace/project-a/source/com/acme/Foo.java'
    );
    assert.strictEqual(
      findingB.location.fullPath,
      '/workspace/project-b/source/com/acme/Foo.java'
    );
    assert.deepStrictEqual(requestedProjects, [
      '/workspace/project-a',
      '/workspace/project-b',
    ]);
  });
});

function makeDeps(
  overrides: Partial<PathResolverDeps> = {}
): PathResolverDeps {
  return {
    getClasspaths: async () => undefined,
    getProjectRootPaths: async () => [],
    getPrimaryWorkspaceFolder: () => undefined,
    statPath: async () => {
      throw new Error('not found');
    },
    logger: { log: () => undefined },
    ...overrides,
  };
}

function classpathResult(sourcepaths: string[]) {
  return {
    runtimeClasspaths: [],
    targetResolutionRoots: [],
    sourcepaths,
  };
}

function makeFinding(realSourcePath: string): Finding {
  return {
    patternId: 'NP',
    type: 'NP_ALWAYS_NULL',
    message: 'Null pointer',
    location: { realSourcePath },
  };
}
