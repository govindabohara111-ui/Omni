import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { IDELayout } from '@/components/IDELayout';
import type { UIMessage, UIToolCall } from '@/store/useStore';
import type { PersistedToolCall } from '@/agent/types';

export const dynamic = 'force-dynamic';

/**
 * The main IDE page. Loads the project and its message history on the server
 * and hands everything to the client-side IDE layout.
 */
export default async function ProjectPage({
  params,
}: {
  params: { id: string };
}) {
  const project = await db.project.findUnique({
    where: { id: params.id },
    include: {
      messages: {
        where: { role: { in: ['user', 'assistant'] } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!project) notFound();

  const initialMessages: UIMessage[] = project.messages
    .map((m): UIMessage => {
      let toolCalls: UIToolCall[] = [];
      if (m.toolCalls) {
        try {
          const parsed = m.toolCalls as unknown as PersistedToolCall[];
          if (Array.isArray(parsed)) {
            toolCalls = parsed.map((tc) => ({ ...tc, status: 'done' as const }));
          }
        } catch {
          // Ignore malformed persisted tool calls.
        }
      }
      return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        agentName: m.agentName ?? undefined,
        toolCalls,
      };
    })
    .filter((m) => m.content.trim().length > 0 || m.toolCalls.length > 0);

  return (
    <IDELayout
      project={{
        id: project.id,
        name: project.name,
        hostPort: project.hostPort,
      }}
      initialMessages={initialMessages}
    />
  );
}
