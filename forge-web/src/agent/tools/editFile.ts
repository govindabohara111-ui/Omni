import { randomBytes } from 'crypto';
import { execCommand } from '@/lib/docker';
import type { ForgeTool } from '../types';
import { shellQuote } from './readFile';

export const editFileTool: ForgeTool = {
  definition: {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Edit an existing file by replacing an exact string with a new string. The old_string must appear exactly once in the file (include surrounding lines for uniqueness). For new files or full rewrites use write_file instead.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path of the file to edit, e.g. /app/src/App.tsx',
          },
          old_string: {
            type: 'string',
            description: 'The exact text to replace. Must match exactly once.',
          },
          new_string: {
            type: 'string',
            description: 'The text to insert in place of old_string.',
          },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },

  async execute(args, ctx) {
    const filePath = String(args.path ?? '');
    const oldString = String(args.old_string ?? '');
    const newString = String(args.new_string ?? '');

    if (!filePath || !oldString) {
      return {
        output: 'Error: "path" and "old_string" arguments are required.',
        isError: true,
      };
    }

    // Read the current content, apply the replacement in Node (far more
    // reliable than escaping arbitrary strings for sed), then write back
    // through a quoted heredoc.
    const read = await execCommand(ctx.containerId, `cat ${shellQuote(filePath)}`);
    if (read.exitCode !== 0) {
      return {
        output: `Error: could not read ${filePath}: ${read.stderr || read.stdout}`,
        isError: true,
      };
    }

    const original = read.stdout;
    const occurrences = original.split(oldString).length - 1;
    if (occurrences === 0) {
      return {
        output: `Error: old_string not found in ${filePath}. Read the file and retry with the exact current text.`,
        isError: true,
      };
    }
    if (occurrences > 1) {
      return {
        output: `Error: old_string appears ${occurrences} times in ${filePath}. Provide more surrounding context so it matches exactly once.`,
        isError: true,
      };
    }

    const updated = original.replace(oldString, newString);
    const eof = `FORGE_EOF_${randomBytes(6).toString('hex')}`;
    const quoted = shellQuote(filePath);
    const write = await execCommand(
      ctx.containerId,
      `cat > ${quoted} << '${eof}'\n${updated}\n${eof}`,
    );

    if (write.exitCode !== 0) {
      return {
        output: `Error writing ${filePath} (exit ${write.exitCode}): ${write.stderr}`,
        isError: true,
      };
    }

    return { output: `Edited ${filePath}: replaced 1 occurrence.` };
  },
};
