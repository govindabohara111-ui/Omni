import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { execCommand } from '@/lib/docker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * GET /api/files?projectId=xxx           → { files: string[] }
 * GET /api/files?projectId=xxx&path=xxx  → { path, content }
 *
 * Reads directly from the project's Docker container.
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  const filePath = req.nextUrl.searchParams.get('path');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project?.containerId) {
    return NextResponse.json(
      { error: 'Project or sandbox not found' },
      { status: 404 },
    );
  }

  try {
    if (filePath) {
      // Guard against path traversal outside the sandbox workspace.
      if (!filePath.startsWith('/app')) {
        return NextResponse.json(
          { error: 'path must be inside /app' },
          { status: 400 },
        );
      }
      const { stdout, stderr, exitCode } = await execCommand(
        project.containerId,
        `cat ${shellQuote(filePath)}`,
      );
      if (exitCode !== 0) {
        return NextResponse.json(
          { error: stderr || `Failed to read ${filePath}` },
          { status: 404 },
        );
      }
      return NextResponse.json({ path: filePath, content: stdout });
    }

    const { stdout, exitCode } = await execCommand(
      project.containerId,
      `find /app -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/.next/*' | sort`,
    );
    if (exitCode !== 0) {
      return NextResponse.json({ files: [] });
    }

    const files = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    return NextResponse.json({ files });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
