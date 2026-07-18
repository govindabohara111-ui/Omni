import { AGENTS, listAgentNames } from '@/lib/prompts';
import type { ForgeTool } from '../types';

export const handoffTool: ForgeTool = {
  definition: {
    type: 'function',
    function: {
      name: 'request_handoff',
      description: `Hand control of the conversation to another agent. Available agents:\n${Object.values(
        AGENTS,
      )
        .map((a) => `- "${a.name}": ${a.description}`)
        .join(
          '\n',
        )}\nThe target agent does NOT see your conversation history — the task_summary must be fully self-contained (framework in use, file paths, requirements, acceptance criteria).`,
      parameters: {
        type: 'object',
        properties: {
          target_agent: {
            type: 'string',
            enum: listAgentNames(),
            description: 'Name of the agent to hand control to.',
          },
          task_summary: {
            type: 'string',
            description:
              'A complete, self-contained description of the task for the target agent, including all context it needs.',
          },
        },
        required: ['target_agent', 'task_summary'],
      },
    },
  },

  // Does not touch Docker — only signals the engine to swap the system prompt.
  async execute(args) {
    const targetAgent = String(args.target_agent ?? '');
    const taskSummary = String(args.task_summary ?? '');

    if (!AGENTS[targetAgent]) {
      return {
        output: `Error: unknown agent "${targetAgent}". Valid agents: ${listAgentNames().join(', ')}.`,
        isError: true,
      };
    }

    return {
      output: `Handing off to ${targetAgent}.`,
      handoff: { targetAgent, taskSummary },
    };
  },
};
