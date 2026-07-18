import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSandbox } from '@/lib/docker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/projects
 * Body: { name?: string }
 * Creates a Project row and spins up its Docker sandbox container.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name =
      typeof body?.name === 'string' && body.name.trim()
        ? body.name.trim()
        : 'Untitled Project';

    const project = await db.project.create({ data: { name } });

    try {
      const { containerId, hostPort } = await createSandbox(project.id);
      return NextResponse.json({
        id: project.id,
        name: project.name,
        containerId,
        hostPort,
      });
    } catch (err) {
      // Sandbox creation failed (Docker down, image pull failed, ...).
      // Remove the orphaned project row and surface the error.
      await db.project.delete({ where: { id: project.id } }).catch(() => {});
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[api/projects] failed:', err);
    return NextResponse.json(
      { error: `Failed to create project: ${message}` },
      { status: 500 },
    );
  }
}

/**
 * GET /api/projects — list recent projects (for the landing page).
 */
export async function GET() {
  const projects = await db.project.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, name: true, hostPort: true, createdAt: true },
  });
  return NextResponse.json(projects);
}
