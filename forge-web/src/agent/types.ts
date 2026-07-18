import type OpenAI from 'openai';

/**
 * Events emitted by the agent engine onto the SSE stream.
 * The frontend switches on `event` to update the UI.
 */
export type SSEEventName =
  | 'token' // { text } incremental assistant text
  | 'tool_start' // { id, toolName, args, agentName }
  | 'tool_end' // { id, toolName, output, isError }
  | 'terminal' // { stream, text } live bash output for the terminal panel
  | 'agent_change' // { from, to, taskSummary }
  | 'message_complete' // { agentName } current assistant bubble is finished
  | 'error' // { message }
  | 'done'; // {} agent loop finished

export interface SSEEvent {
  event: SSEEventName;
  data: Record<string, unknown>;
}

/** Emit callback handed down from the API route into the engine and tools. */
export type EmitFn = (event: SSEEvent) => Promise<void> | void;

/** Returned by request_handoff to signal an agent swap to the engine. */
export interface HandoffSignal {
  targetAgent: string;
  taskSummary: string;
}

export interface ToolContext {
  projectId: string;
  containerId: string;
  emit: EmitFn;
}

export interface ToolOutcome {
  /** String appended to the message history as the tool result. */
  output: string;
  isError?: boolean;
  /** Present only for request_handoff. */
  handoff?: HandoffSignal;
}

export interface ForgeTool {
  /** OpenAI function-calling schema. */
  definition: OpenAI.Chat.Completions.ChatCompletionTool;
  execute: (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<ToolOutcome>;
}

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** Shape of a tool call as persisted in Message.toolCalls for UI rendering. */
export interface PersistedToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  output?: string;
  isError?: boolean;
}
