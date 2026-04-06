/* eslint-disable @typescript-eslint/naming-convention */
const Module = require('module') as {
  _load: (...args: unknown[]) => unknown;
};

type WorkspaceFolder = {
  name: string;
  uri: MockUri;
};

class MockUri {
  public readonly scheme: string;
  public readonly fsPath: string;
  private readonly value: string;

  private constructor(value: string, scheme: string, fsPath: string) {
    this.value = value;
    this.scheme = scheme;
    this.fsPath = fsPath;
  }

  static parse(value: string): MockUri {
    const schemeMatch = /^([a-z0-9+.-]+):/i.exec(value);
    const scheme = schemeMatch?.[1]?.toLowerCase() ?? 'file';

    if (scheme === 'file') {
      const rawPath = decodeURIComponent(value.replace(/^file:\/\/\/?/, '/'));
      return new MockUri(value, scheme, rawPath);
    }

    return new MockUri(value, scheme, value);
  }

  static file(fsPath: string): MockUri {
    const portablePath = fsPath.replace(/\\/g, '/');
    const encodedPath = encodeURI(portablePath.startsWith('/') ? portablePath : `/${portablePath}`);
    return new MockUri(`file://${encodedPath}`, 'file', fsPath);
  }

  toString(): string {
    return this.value;
  }
}

type VscodeMock = {
  Uri: typeof MockUri;
  workspace: {
    workspaceFolders: WorkspaceFolder[];
    getWorkspaceFolder: (uri: MockUri) => WorkspaceFolder | undefined;
    fs: {
      stat: (uri: MockUri) => Promise<unknown>;
    };
  };
  window: {
    createOutputChannel: (name: string) => { appendLine: (value: string) => void; show: () => void };
    activeTextEditor?: { document: { uri: MockUri } };
    withProgress: <T>(
      options: unknown,
      task: (
        progress: { report: (value: unknown) => void },
        token: { isCancellationRequested: boolean }
      ) => Promise<T>
    ) => Promise<T>;
  };
  commands: {
    executeCommand: (...args: unknown[]) => Promise<unknown>;
    getCommands: (filterInternal?: boolean) => Promise<string[]>;
  };
  extensions: {
    getExtension: (id: string) => unknown;
  };
  ProgressLocation: {
    Notification: number;
  };
};

const originalLoad = Module._load;
let installed = false;
let currentMock = createVscodeMock();

export function installVscodeMock(overrides: Partial<VscodeMock> = {}): VscodeMock {
  currentMock = createVscodeMock(overrides);

  if (!installed) {
    Module._load = function patchedLoad(request: unknown, parent: unknown, isMain: unknown) {
      if (request === 'vscode') {
        return currentMock;
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    installed = true;
  }

  return currentMock;
}

export function resetVscodeMock(overrides: Partial<VscodeMock> = {}): VscodeMock {
  currentMock = createVscodeMock(overrides);
  return currentMock;
}

function createVscodeMock(overrides: Partial<VscodeMock> = {}): VscodeMock {
  const workspaceFolders = overrides.workspace?.workspaceFolders ?? [];
  const workspace = {
    workspaceFolders,
    getWorkspaceFolder:
      overrides.workspace?.getWorkspaceFolder ??
      ((uri: MockUri) =>
        workspaceFolders.find((folder) => uri.fsPath.startsWith(folder.uri.fsPath))),
    fs: {
      stat: overrides.workspace?.fs?.stat ?? (async () => ({})),
    },
  };

  const window = {
    createOutputChannel:
      overrides.window?.createOutputChannel ??
      (() => ({
        appendLine: () => undefined,
        show: () => undefined,
      })),
    activeTextEditor: overrides.window?.activeTextEditor,
    withProgress:
      overrides.window?.withProgress ??
      (async (_options, task) =>
        task(
          {
            report: () => undefined,
          },
          {
            isCancellationRequested: false,
          }
        )),
  };

  return {
    Uri: MockUri,
    workspace,
    window,
    commands: {
      executeCommand: overrides.commands?.executeCommand ?? (async () => undefined),
      getCommands: overrides.commands?.getCommands ?? (async () => []),
    },
    extensions: {
      getExtension: overrides.extensions?.getExtension ?? (() => undefined),
    },
    ProgressLocation: overrides.ProgressLocation ?? {
      Notification: 15,
    },
  };
}
