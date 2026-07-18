import { execCommand } from '@/lib/docker';
import type { ForgeTool } from '../types';

const MAX_OUTPUT_CHARS = 12_000;

export const bashTool: ForgeTool = {
  definition: {
    type: 'function',
    function: {
      name: 'bash',
      description:
        'Run a shell command inside the sandbox container (cwd: /app). Hard 60s timeout — NEVER run blocking commands in the foreground; start dev servers detached with nohup + & and redirect output to a log file.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description:
              'The shell command to execute, e.g. "npm install" or "nohup npm run dev -- --host 0.0.0.0 --port 3000 > /app/dev.log 2>&1 &"',
          },
        },
        required: ['command'],
      },
    },
  },

  async execute(args, ctx) {
    const command = String(args.command ?? '');
    if (!command) {
      return { output: 'Error: "command" argument is required.', isError: true };
    }

    // Stream chunks to the terminal panel in real time while the command runs.
    const { stdout, stderr, exitCode } = await execCommand(
      ctx.containerId,
      command,
      {
        onChunk: (stream, text) => {
          void ctx.emit({ event: 'terminal', data: { stream, text } });
        },
      },
    );

    const clip = (s: string) =>
      s.length > MAX_OUTPUT_CHARS
        ? `${s.slice(0, MAX_OUTPUT_CHARS)}\n... [truncated, ${s.length} chars total]`
        : s;

    const parts = [
      `exit code: ${exitCode}`,
      stdout.trim() ? `stdout:\n${clip(stdout)}` : 'stdout: (empty)',
      stderr.trim() ? `stderr:\n${clip(stderr)}` : '',
    ].filter(Boolean);

    return { output: parts.join('\n'), isError: exitCode !== 0 };
  },
};
