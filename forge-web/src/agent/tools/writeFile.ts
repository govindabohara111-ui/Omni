import { randomBytes } from 'crypto';
import { execCommand } from '@/lib/docker';
import type { ForgeTool } from '../types';
import { shellQuote } from './readFile';

export const writeFileTool: ForgeTool = {
  definition: {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Create or overwrite a file inside the sandbox container with the given content. Parent directories are created automatically. Always provide the COMPLETE file content.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path of the file to write, e.g. /app/src/App.tsx',
          },
          content: {
            type: 'string',
            description: 'The complete content of the file.',
          },
        },
        required: ['path', 'content'],
      },
    },
  },

  async execute(args, ctx) {
    const filePath = String(args.path ?? '');
    const content = String(args.content ?? '');
    if (!filePath) {
      return { output: 'Error: "path" argument is required.', isError: true };
    }

    // Quoted heredoc delimiter prevents variable expansion inside content.
    // A random suffix guarantees the delimiter never collides with a line of
    // the file content itself.
    const eof = `FORGE_EOF_${randomBytes(6).toString('hex')}`;
    const quoted = shellQuote(filePath);
    const command = `mkdir -p "$(dirname ${quoted})" && cat > ${quoted} << '${eof}'\n${content}\n${eof}`;

    const { stderr, exitCode } = await execCommand(ctx.containerId, command);

    if (exitCode !== 0) {
      return {
        output: `Error writing ${filePath} (exit ${exitCode}): ${stderr}`,
        isError: true,
      };
    }

    const lines = content.split('\n').length;
    return { output: `Wrote ${filePath} (${lines} lines, ${content.length} bytes).` };
  },
};
