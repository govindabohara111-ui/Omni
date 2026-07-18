import type OpenAI from 'openai';
import type { ForgeTool } from '../types';
import { readFileTool } from './readFile';
import { writeFileTool } from './writeFile';
import { editFileTool } from './editFile';
import { bashTool } from './bash';
import { handoffTool } from './handoff';

/** Central tool registry, keyed by the OpenAI function name. */
export const TOOL_REGISTRY: Record<string, ForgeTool> = {
  read_file: readFileTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  bash: bashTool,
  request_handoff: handoffTool,
};

/** Every agent currently gets the full toolset; the prompts shape behavior. */
export function getToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return Object.values(TOOL_REGISTRY).map((t) => t.definition);
}

export function getTool(name: string): ForgeTool | undefined {
  return TOOL_REGISTRY[name];
}
