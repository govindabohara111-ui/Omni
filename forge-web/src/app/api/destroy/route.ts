import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { destroySandbox } from '@/lib/docker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/destroy
 * Body: { projectId: string }
 * Kills and removes the project's Docker container.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.projectId ?? '');
    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 },
      );
    }

    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.containerId) {
      await destroySandbox(project.containerId);
    }

    await db.project.update({
      where: { id: projectId },
      data: { containerId: null, hostPort: null },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[api/destroy] failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
