import OpenAI from 'openai';
import { db } from '@/lib/db';
import { DEFAULT_AGENT, getAgent } from '@/lib/prompts';
import { getTool, getToolDefinitions } from './tools';
import type {
  ChatMessage,
  EmitFn,
  PersistedToolCall,
  ToolContext,
} from './types';

const MODEL = 'gpt-4o';
const MAX_ITERATIONS = 40;

interface AssembledToolCall {
  id: string;
  name: string;
  argsJson: string;
}

/**
 * The core agentic while-loop.
 *
 * Streams an OpenAI completion for the currently active agent, executes any
 * requested tools against the project's Docker sandbox, feeds results back
 * into the message history, and repeats until the agent stops. When
 * `request_handoff` is executed, the active system prompt is swapped and the
 * history is reset to the handoff task summary.
 *
 * All progress is pushed to the client through `emit` as SSE events, and all
 * completed messages are persisted to Prisma so the conversation survives a
 * page reload.
 */
export async function runAgentLoop(
  projectId: string,
  userMessage: string,
  emit: EmitFn,
): Promise<void> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!project.containerId) {
    throw new Error(`Project ${projectId} has no sandbox container`);
  }

  const ctx: ToolContext = {
    projectId,
    containerId: project.containerId,
    emit,
  };

  let currentAgent = getAgent(DEFAULT_AGENT);

  // Rebuild lightweight conversational context from the DB: prior user and
  // assistant text turns. Tool call/result pairs are not replayed (OpenAI
  // requires them to be perfectly paired, and the outputs are stale anyway).
  const priorMessages = await db.message.findMany({
    where: { projectId, role: { in: ['user', 'assistant'] } },
    orderBy: { createdAt: 'asc' },
    take: 30,
  });

  let messages: ChatMessage[] = [
    { role: 'system', content: currentAgent.systemPrompt },
    ...priorMessages
      .filter((m) => m.content.trim().length > 0)
      .map(
        (m): ChatMessage => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }),
      ),
    { role: 'user', content: userMessage },
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const stream = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: getToolDefinitions(),
      stream: true,
    });

    let assistantText = '';
    const toolCalls: AssembledToolCall[] = [];
    let finishReason: string | null = null;

    // ---- Parse the streamed completion -------------------------------
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta?.content) {
        assistantText += delta.content;
        await emit({ event: 'token', data: { text: delta.content } });
      }

      // Tool call arguments arrive as indexed fragments; assemble them.
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCalls[idx]) {
            toolCalls[idx] = { id: '', name: '', argsJson: '' };
          }
          if (tc.id) toolCalls[idx].id = tc.id;
          if (tc.function?.name) toolCalls[idx].name += tc.function.name;
          if (tc.function?.arguments) {
            toolCalls[idx].argsJson += tc.function.arguments;
          }
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    // ---- Finish reason: plain stop → agent is done --------------------
    if (finishReason !== 'tool_calls' || toolCalls.length === 0) {
      await emit({
        event: 'message_complete',
        data: { agentName: currentAgent.name },
      });
      if (assistantText.trim()) {
        await db.message.create({
          data: {
            projectId,
            role: 'assistant',
            content: assistantText,
            agentName: currentAgent.name,
          },
        });
      }
      await emit({ event: 'done', data: {} });
      return;
    }

    // ---- Finish reason: tool_calls ------------------------------------
    // Append the assistant turn (text + tool calls) to the API history.
    messages.push({
      role: 'assistant',
      content: assistantText || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.argsJson },
      })),
    });

    const persistedCalls: PersistedToolCall[] = [];
    let pendingHandoff: { targetAgent: string; taskSummary: string } | null =
      null;

    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      let output: string;
      let isError = false;

      try {
        args = tc.argsJson ? JSON.parse(tc.argsJson) : {};
      } catch {
        output = `Error: could not parse tool arguments as JSON: ${tc.argsJson.slice(0, 500)}`;
        isError = true;
        await emit({
          event: 'tool_start',
          data: { id: tc.id, toolName: tc.name, args: {}, agentName: currentAgent.name },
        });
        await emit({
          event: 'tool_end',
          data: { id: tc.id, toolName: tc.name, output, isError },
        });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: output });
        persistedCalls.push({ id: tc.id, toolName: tc.name, args: {}, output, isError });
        continue;
      }

      await emit({
        event: 'tool_start',
        data: { id: tc.id, toolName: tc.name, args, agentName: currentAgent.name },
      });

      const tool = getTool(tc.name);
      if (!tool) {
        output = `Error: unknown tool "${tc.name}".`;
        isError = true;
      } else {
        try {
          const outcome = await tool.execute(args, ctx);
          output = outcome.output;
          isError = outcome.isError ?? false;
          if (outcome.handoff) pendingHandoff = outcome.handoff;
        } catch (err) {
          output = `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`;
          isError = true;
        }
      }

      await emit({
        event: 'tool_end',
        data: { id: tc.id, toolName: tc.name, output, isError },
      });

      messages.push({ role: 'tool', tool_call_id: tc.id, content: output });
      persistedCalls.push({ id: tc.id, toolName: tc.name, args, output, isError });
    }

    // Persist the assistant turn with its tool calls for UI reconstruction.
    await db.message.create({
      data: {
        projectId,
        role: 'assistant',
        content: assistantText,
        agentName: currentAgent.name,
        toolCalls: JSON.parse(JSON.stringify(persistedCalls)),
      },
    });
    await emit({
      event: 'message_complete',
      data: { agentName: currentAgent.name },
    });

    // ---- Handoff: swap the system prompt and reset the history --------
    if (pendingHandoff) {
      const fromAgent = currentAgent.name;
      currentAgent = getAgent(pendingHandoff.targetAgent);

      await emit({
        event: 'agent_change',
        data: {
          from: fromAgent,
          to: currentAgent.name,
          taskSummary: pendingHandoff.taskSummary,
        },
      });

      // Clear non-system history; the new agent starts from the summary.
      messages = [
        { role: 'system', content: currentAgent.systemPrompt },
        {
          role: 'user',
          content: `You have been handed control by the "${fromAgent}" agent. Complete the following task, then hand control back to the Orchestrator with a summary of what you did.\n\n## Task\n${pendingHandoff.taskSummary}\n\n## Original user request (for context)\n${userMessage}`,
        },
      ];
    }
  }

  await emit({
    event: 'error',
    data: {
      message: `Agent loop exceeded ${MAX_ITERATIONS} iterations and was stopped.`,
    },
  });
  await emit({ event: 'done', data: {} });
}
