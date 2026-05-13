/* eslint-disable @typescript-eslint/naming-convention */
const Module = require('module') as {
  _load: (...args: unknown[]) => unknown;
};

type WorkspaceFolder = {
  name: string;
  uri: MockUri;
};

type Listener<T> = (event: T) => unknown;

class MockEventEmitter<T> {
  private listeners: Listener<T>[] = [];

  readonly event = (listener: Listener<T>) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((candidate) => candidate !== listener);
      },
    };
  };

  fire(event: T): void {
    for (const listener of this.listeners.slice()) {
      listener(event);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

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

class MockThemeIcon {
  constructor(public readonly id: string) {}
}

class MockPosition {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) {}
}

class MockRange {
  constructor(
    public readonly start: MockPosition,
    public readonly end: MockPosition
  ) {}
}

class MockTreeItem {
  public description?: string;
  public tooltip?: string;
  public iconPath?: unknown;
  public contextValue?: string;
  public command?: unknown;

  constructor(
    public readonly label: string,
    public readonly collapsibleState?: number
  ) {}
}

const MockTreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

const MockCodeActionKind = {
  QuickFix: {
    value: 'quickfix',
    contains: (kind: { value?: string } | undefined) => kind?.value === 'quickfix',
  },
};

type VscodeMock = {
  Uri: typeof MockUri;
  EventEmitter: typeof MockEventEmitter;
  TreeItem: typeof MockTreeItem;
  TreeItemCollapsibleState: typeof MockTreeItemCollapsibleState;
  ThemeIcon: typeof MockThemeIcon;
  Position: typeof MockPosition;
  Range: typeof MockRange;
  workspace: {
    workspaceFolders: WorkspaceFolder[];
    getConfiguration: (section?: string) => {
      get: <T>(key: string) => T | undefined;
    };
    getWorkspaceFolder: (uri: MockUri) => WorkspaceFolder | undefined;
    onDidChangeConfiguration: (
      listener: (event: { affectsConfiguration: (section: string) => boolean }) => unknown
    ) => { dispose: () => void };
    fs: {
      stat: (uri: MockUri) => Promise<unknown>;
    };
  };
  window: {
    createOutputChannel: (name: string) => { appendLine: (value: string) => void; show: () => void };
    createTreeView: (
      viewId: string,
      options: unknown
    ) => {
      onDidChangeSelection: (
        listener: (event: { selection: unknown[] }) => unknown
      ) => { dispose: () => void };
      dispose: () => void;
    };
    createWebviewPanel: (
      viewType: string,
      title: string,
      showOptions: unknown,
      options?: unknown
    ) => {
      title: string;
      webview: { html: string };
      reveal: (...args: unknown[]) => void;
      dispose: () => void;
      onDidDispose: (listener: () => unknown) => { dispose: () => void };
    };
    showTextDocument: (uri: MockUri, options?: unknown) => Promise<unknown>;
    showInformationMessage: (message: string) => Promise<string | undefined>;
    showWarningMessage: (message: string) => Promise<string | undefined>;
    showErrorMessage: (message: string) => Promise<string | undefined>;
    showInputBox: (options?: unknown) => Promise<string | undefined>;
    showQuickPick: <T>(
      items: T[] | PromiseLike<T[]>,
      options?: unknown
    ) => Promise<T | undefined>;
    activeTextEditor?: { document: { uri: MockUri } };
    registerWebviewViewProvider: (
      viewId: string,
      provider: unknown,
      options?: unknown
    ) => { dispose: () => void };
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
  env: {
    clipboard: {
      writeText: (value: string) => Promise<void>;
    };
  };
  extensions: {
    getExtension: (id: string) => unknown;
  };
  CodeActionKind: typeof MockCodeActionKind;
  languages: {
    createDiagnosticCollection: (name: string) => {
      clear: () => void;
      delete: (uri: MockUri) => void;
      dispose: () => void;
      set: (uri: MockUri, diagnostics: unknown[]) => void;
    };
    registerCodeActionsProvider: (...args: unknown[]) => { dispose: () => void };
  };
  ProgressLocation: {
    Notification: number;
  };
  ViewColumn: {
    Beside: number;
  };
};

type TelemetryWrapperMock = {
  initializeFromJsonFile: (...args: unknown[]) => Promise<void>;
  instrumentOperation: <TArgs extends unknown[], TResult>(
    operationName: string,
    operation: (operationId: string, ...args: TArgs) => TResult
  ) => (...args: TArgs) => TResult;
  instrumentOperationAsVsCodeCommand: (
    commandId: string,
    callback: (...args: unknown[]) => unknown
  ) => { dispose: () => void };
  dispose: () => Promise<void>;
};

const originalLoad = Module._load;
let installed = false;
let currentMock = createVscodeMock();
let currentTelemetryWrapperMock = createTelemetryWrapperMock();

export function installVscodeMock(overrides: Partial<VscodeMock> = {}): VscodeMock {
  const nextMock = createVscodeMock(overrides);

  if (!installed) {
    currentMock = nextMock;
    Module._load = function patchedLoad(request: unknown, parent: unknown, isMain: unknown) {
      if (request === 'vscode') {
        return currentMock;
      }
      if (request === 'vscode-extension-telemetry-wrapper') {
        return currentTelemetryWrapperMock;
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    installed = true;
  } else {
    updateVscodeMock(currentMock, nextMock);
  }

  return currentMock;
}

export function resetVscodeMock(overrides: Partial<VscodeMock> = {}): VscodeMock {
  updateVscodeMock(currentMock, createVscodeMock(overrides));
  resetTelemetryWrapperMock();
  return currentMock;
}

export function resetTelemetryWrapperMock(
  overrides: Partial<TelemetryWrapperMock> = {}
): TelemetryWrapperMock {
  currentTelemetryWrapperMock = createTelemetryWrapperMock(overrides);
  return currentTelemetryWrapperMock;
}

function createTelemetryWrapperMock(
  overrides: Partial<TelemetryWrapperMock> = {}
): TelemetryWrapperMock {
  return {
    initializeFromJsonFile:
      overrides.initializeFromJsonFile ?? (async () => undefined),
    instrumentOperation:
      overrides.instrumentOperation ??
      (<TArgs extends unknown[], TResult>(
        _operationName: string,
        operation: (operationId: string, ...args: TArgs) => TResult
      ) => (...args: TArgs) => operation('test-operation', ...args)),
    instrumentOperationAsVsCodeCommand:
      overrides.instrumentOperationAsVsCodeCommand ??
      (() => ({ dispose: () => undefined })),
    dispose: overrides.dispose ?? (async () => undefined),
  };
}

function updateVscodeMock(target: VscodeMock, source: VscodeMock): void {
  Object.assign(target.workspace.fs, source.workspace.fs);
  target.workspace.workspaceFolders = source.workspace.workspaceFolders;
  target.workspace.getConfiguration = source.workspace.getConfiguration;
  target.workspace.getWorkspaceFolder = source.workspace.getWorkspaceFolder;
  target.workspace.onDidChangeConfiguration = source.workspace.onDidChangeConfiguration;
  Object.assign(target.window, source.window);
  Object.assign(target.commands, source.commands);
  Object.assign(target.env.clipboard, source.env.clipboard);
  Object.assign(target.extensions, source.extensions);
  target.CodeActionKind = source.CodeActionKind;
  Object.assign(target.languages, source.languages);
  target.ProgressLocation = source.ProgressLocation;
  target.ViewColumn = source.ViewColumn;
}

function createVscodeMock(overrides: Partial<VscodeMock> = {}): VscodeMock {
  const workspaceFolders = overrides.workspace?.workspaceFolders ?? [];
  const workspace = {
    workspaceFolders,
    getConfiguration:
      overrides.workspace?.getConfiguration ??
      (() => ({
        get: () => undefined,
      })),
    getWorkspaceFolder:
      overrides.workspace?.getWorkspaceFolder ??
      ((uri: MockUri) =>
        workspaceFolders.find((folder) => uri.fsPath.startsWith(folder.uri.fsPath))),
    onDidChangeConfiguration:
      overrides.workspace?.onDidChangeConfiguration ??
      (() => ({ dispose: () => undefined })),
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
    createTreeView:
      overrides.window?.createTreeView ??
      (() => ({
        onDidChangeSelection: () => ({ dispose: () => undefined }),
        dispose: () => undefined,
      })),
    createWebviewPanel:
      overrides.window?.createWebviewPanel ??
      (() => ({
        title: '',
        webview: { html: '' },
        reveal: () => undefined,
        dispose: () => undefined,
        onDidDispose: () => ({ dispose: () => undefined }),
      })),
    showInformationMessage:
      overrides.window?.showInformationMessage ?? (async () => undefined),
    showWarningMessage:
      overrides.window?.showWarningMessage ?? (async () => undefined),
    showErrorMessage:
      overrides.window?.showErrorMessage ?? (async () => undefined),
    showInputBox:
      overrides.window?.showInputBox ?? (async () => undefined),
    showQuickPick:
      overrides.window?.showQuickPick ?? (async () => undefined),
    showTextDocument:
      overrides.window?.showTextDocument ?? (async () => undefined),
    activeTextEditor: overrides.window?.activeTextEditor,
    registerWebviewViewProvider:
      overrides.window?.registerWebviewViewProvider ??
      (() => ({ dispose: () => undefined })),
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
    EventEmitter: MockEventEmitter,
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: MockTreeItemCollapsibleState,
    ThemeIcon: MockThemeIcon,
    Position: MockPosition,
    Range: MockRange,
    workspace,
    window,
    commands: {
      executeCommand: overrides.commands?.executeCommand ?? (async () => undefined),
      getCommands: overrides.commands?.getCommands ?? (async () => []),
    },
    env: {
      clipboard: {
        writeText: overrides.env?.clipboard?.writeText ?? (async () => undefined),
      },
    },
    extensions: {
      getExtension: overrides.extensions?.getExtension ?? (() => undefined),
    },
    CodeActionKind: overrides.CodeActionKind ?? MockCodeActionKind,
    languages: {
      createDiagnosticCollection:
        overrides.languages?.createDiagnosticCollection ??
        (() => ({
          clear: () => undefined,
          delete: () => undefined,
          dispose: () => undefined,
          set: () => undefined,
        })),
      registerCodeActionsProvider:
        overrides.languages?.registerCodeActionsProvider ??
        (() => ({ dispose: () => undefined })),
    },
    ProgressLocation: overrides.ProgressLocation ?? {
      Notification: 15,
    },
    ViewColumn: overrides.ViewColumn ?? {
      Beside: 2,
    },
  };
}
