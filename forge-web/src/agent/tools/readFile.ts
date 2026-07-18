import { execCommand } from '@/lib/docker';
import type { ForgeTool } from '../types';

const MAX_OUTPUT_CHARS = 24_000;

export const readFileTool: ForgeTool = {
  definition: {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read the contents of a file inside the sandbox container. Paths must be absolute (e.g. /app/src/App.tsx).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path of the file to read, e.g. /app/package.json',
          },
        },
        required: ['path'],
      },
    },
  },

  async execute(args, ctx) {
    const filePath = String(args.path ?? '');
    if (!filePath) {
      return { output: 'Error: "path" argument is required.', isError: true };
    }

    const { stdout, stderr, exitCode } = await execCommand(
      ctx.containerId,
      `cat ${shellQuote(filePath)}`,
    );

    if (exitCode !== 0) {
      return {
        output: `Error reading ${filePath} (exit ${exitCode}): ${stderr || stdout}`,
        isError: true,
      };
    }

    const content =
      stdout.length > MAX_OUTPUT_CHARS
        ? `${stdout.slice(0, MAX_OUTPUT_CHARS)}\n... [truncated, file is ${stdout.length} chars]`
        : stdout;

    return { output: content };
  },
};

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
