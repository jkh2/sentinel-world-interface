// Preload — the ONLY bridge between the sandboxed renderer and the main
// process. Exposes a small, explicit, typed API over contextBridge. No Node
// primitives, no file access, no process handles ever reach the renderer.

import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/events';
import type { AgentOutputEvent } from '../shared/events';
import type { CapabilityReport, CliKind, SessionOptions } from '../shared/types';

const api = {
  startSession: (options: SessionOptions): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.sessionStart, options),

  sendMessage: (message: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.sessionSend, message),

  interrupt: (): Promise<void> => ipcRenderer.invoke(IpcChannels.sessionInterrupt),

  stopSession: (): Promise<void> => ipcRenderer.invoke(IpcChannels.sessionStop),

  detectClis: (): Promise<Record<CliKind, CapabilityReport | null>> =>
    ipcRenderer.invoke(IpcChannels.detectClis),

  pickDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.pickDirectory),

  /** Subscribe to the agent event stream. Returns an unsubscribe fn. */
  onAgentEvent: (callback: (event: AgentOutputEvent) => void): (() => void) => {
    const listener = (_e: unknown, event: AgentOutputEvent) => callback(event);
    ipcRenderer.on(IpcChannels.agentEvent, listener);
    return () => ipcRenderer.removeListener(IpcChannels.agentEvent, listener);
  },
};

export type SidlfApi = typeof api;

contextBridge.exposeInMainWorld('sidlf', api);
