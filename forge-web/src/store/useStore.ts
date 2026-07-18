import { create } from 'zustand';
import type { PersistedToolCall } from '@/agent/types';

export interface UIToolCall extends PersistedToolCall {
  status: 'pending' | 'done';
}

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'handoff';
  content: string;
  agentName?: string;
  toolCalls: UIToolCall[];
  /** Only meaningful for role === 'handoff'. */
  handoff?: { from: string; to: string; taskSummary: string };
}

export interface TerminalLine {
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
}

interface ProjectInfo {
  id: string;
  name: string;
  hostPort: number | null;
}

interface ForgeState {
  project: ProjectInfo | null;
  messages: UIMessage[];
  isStreaming: boolean;
  currentAgent: string;
  terminalLines: TerminalLine[];
  files: string[];
  selectedFile: string | null;
  selectedFileContent: string | null;
  activeTab: 'chat' | 'code';
  previewNonce: number;

  setProject: (project: ProjectInfo) => void;
  setMessages: (messages: UIMessage[]) => void;
  addUserMessage: (content: string) => void;
  appendToken: (text: string) => void;
  startToolCall: (call: { id: string; toolName: string; args: Record<string, unknown>; agentName?: string }) => void;
  endToolCall: (call: { id: string; output: string; isError?: boolean }) => void;
  completeAssistantMessage: (agentName?: string) => void;
  addHandoff: (from: string, to: string, taskSummary: string) => void;
  setStreaming: (streaming: boolean) => void;
  setCurrentAgent: (agent: string) => void;
  addTerminalLine: (line: TerminalLine) => void;
  clearTerminal: () => void;
  setFiles: (files: string[]) => void;
  setSelectedFile: (path: string | null, content: string | null) => void;
  setActiveTab: (tab: 'chat' | 'code') => void;
  refreshPreview: () => void;
}

let uid = 0;
const nextId = () => `ui-${Date.now()}-${uid++}`;

/**
 * Returns messages with the trailing in-progress assistant bubble, creating
 * one if the last message is not an open assistant message.
 */
function withOpenAssistant(
  messages: UIMessage[],
  agentName: string,
): { list: UIMessage[]; last: UIMessage } {
  const last = messages[messages.length - 1];
  if (last && last.role === 'assistant' && last.id.startsWith('open-')) {
    return { list: messages, last };
  }
  const fresh: UIMessage = {
    id: `open-${nextId()}`,
    role: 'assistant',
    content: '',
    agentName,
    toolCalls: [],
  };
  return { list: [...messages, fresh], last: fresh };
}

export const useStore = create<ForgeState>((set) => ({
  project: null,
  messages: [],
  isStreaming: false,
  currentAgent: 'Orchestrator',
  terminalLines: [],
  files: [],
  selectedFile: null,
  selectedFileContent: null,
  activeTab: 'chat',
  previewNonce: 0,

  setProject: (project) => set({ project }),

  setMessages: (messages) => set({ messages }),

  addUserMessage: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: nextId(), role: 'user', content, toolCalls: [] },
      ],
    })),

  appendToken: (text) =>
    set((s) => {
      const { list, last } = withOpenAssistant(s.messages, s.currentAgent);
      const updated = { ...last, content: last.content + text };
      return { messages: [...list.slice(0, -1), updated] };
    }),

  startToolCall: ({ id, toolName, args, agentName }) =>
    set((s) => {
      const { list, last } = withOpenAssistant(
        s.messages,
        agentName ?? s.currentAgent,
      );
      const updated: UIMessage = {
        ...last,
        toolCalls: [
          ...last.toolCalls,
          { id, toolName, args, status: 'pending' },
        ],
      };
      return { messages: [...list.slice(0, -1), updated] };
    }),

  endToolCall: ({ id, output, isError }) =>
    set((s) => ({
      messages: s.messages.map((m) => ({
        ...m,
        toolCalls: m.toolCalls.map((tc) =>
          tc.id === id
            ? { ...tc, output, isError, status: 'done' as const }
            : tc,
        ),
      })),
    })),

  completeAssistantMessage: (agentName) =>
    set((s) => {
      const last = s.messages[s.messages.length - 1];
      if (!last || last.role !== 'assistant' || !last.id.startsWith('open-')) {
        return {};
      }
      // Drop empty bubbles (e.g. a turn that was only a handoff signal).
      if (!last.content.trim() && last.toolCalls.length === 0) {
        return { messages: s.messages.slice(0, -1) };
      }
      const sealed = {
        ...last,
        id: nextId(),
        agentName: agentName ?? last.agentName,
      };
      return { messages: [...s.messages.slice(0, -1), sealed] };
    }),

  addHandoff: (from, to, taskSummary) =>
    set((s) => ({
      currentAgent: to,
      messages: [
        ...s.messages,
        {
          id: nextId(),
          role: 'handoff',
          content: taskSummary,
          toolCalls: [],
          handoff: { from, to, taskSummary },
        },
      ],
    })),

  setStreaming: (isStreaming) => set({ isStreaming }),
  setCurrentAgent: (currentAgent) => set({ currentAgent }),

  addTerminalLine: (line) =>
    set((s) => ({
      // Cap the terminal buffer so long sessions don't leak memory.
      terminalLines: [...s.terminalLines.slice(-999), line],
    })),

  clearTerminal: () => set({ terminalLines: [] }),

  setFiles: (files) => set({ files }),

  setSelectedFile: (selectedFile, selectedFileContent) =>
    set({ selectedFile, selectedFileContent }),

  setActiveTab: (activeTab) => set({ activeTab }),

  refreshPreview: () => set((s) => ({ previewNonce: s.previewNonce + 1 })),
}));
