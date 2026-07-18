import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { runAgentLoop } from '@/agent/engine';
import type { SSEEvent } from '@/agent/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/chat
 * Body: { projectId: string, message: string }
 *
 * Saves the user message, runs the multi-agent loop, and streams progress
 * back as Server-Sent Events (event: <name>\ndata: <json>\n\n).
 */
export async function POST(req: NextRequest) {
  let projectId: string;
  let message: string;

  try {
    const body = await req.json();
    projectId = String(body.projectId ?? '');
    message = String(body.message ?? '');
    if (!projectId || !message.trim()) {
      return new Response(
        JSON.stringify({ error: 'projectId and message are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Persist the user turn before starting the loop.
  await db.message.create({
    data: { projectId, role: 'user', content: message },
  });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  let closed = false;
  const emit = async (event: SSEEvent) => {
    if (closed) return;
    try {
      await writer.write(
        encoder.encode(
          `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
        ),
      );
    } catch {
      // Client disconnected; stop writing but let the loop finish so the
      // conversation is still persisted to the database.
      closed = true;
    }
  };

  // Run the agent loop without awaiting so we can return the stream now.
  (async () => {
    try {
      await runAgentLoop(projectId, message, emit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown engine error';
      console.error('[api/chat] engine error:', err);
      await emit({ event: 'error', data: { message: msg } });
      await emit({ event: 'done', data: {} });
    } finally {
      closed = true;
      try {
        await writer.close();
      } catch {
        // Stream already closed by the client.
      }
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
