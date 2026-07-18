'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, SendHorizonal, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageBubble } from '@/components/MessageBubble';
import { refreshFiles } from '@/components/FileTree';
import { useStore } from '@/store/useStore';

/**
 * Parses an SSE byte stream ("event: x\ndata: {...}\n\n") and invokes the
 * callback once per complete event.
 */
async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: Record<string, unknown>) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Events are delimited by a blank line.
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;

      try {
        onEvent(eventName, JSON.parse(dataLines.join('\n')));
      } catch {
        // Ignore malformed frames rather than killing the whole stream.
      }
    }
  }
}

const FILE_MUTATING_TOOLS = new Set(['write_file', 'edit_file', 'bash']);

export function ChatPanel() {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const project = useStore((s) => s.project);
  const messages = useStore((s) => s.messages);
  const isStreaming = useStore((s) => s.isStreaming);
  const currentAgent = useStore((s) => s.currentAgent);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming || !project) return;

    const s = useStore.getState();
    s.addUserMessage(text);
    s.setStreaming(true);
    s.setCurrentAgent('Orchestrator');
    setInput('');

    let filesDirty = false;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, message: text }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Request failed with ${res.status}`);
      }

      await consumeSSE(res.body, (event, data) => {
        const store = useStore.getState();
        switch (event) {
          case 'token':
            store.appendToken(String(data.text ?? ''));
            break;

          case 'tool_start':
            store.startToolCall({
              id: String(data.id),
              toolName: String(data.toolName),
              args: (data.args as Record<string, unknown>) ?? {},
              agentName: data.agentName ? String(data.agentName) : undefined,
            });
            break;

          case 'tool_end': {
            store.endToolCall({
              id: String(data.id),
              output: String(data.output ?? ''),
              isError: Boolean(data.isError),
            });
            const tool = String(data.toolName ?? '');
            if (FILE_MUTATING_TOOLS.has(tool)) {
              filesDirty = true;
              // Refresh eagerly so the tree fills in while the agent works.
              void refreshFiles(project.id);
            }
            if (tool === 'write_file' || tool === 'edit_file') {
              store.refreshPreview();
            }
            break;
          }

          case 'terminal':
            store.addTerminalLine({
              stream: data.stream === 'stderr' ? 'stderr' : 'stdout',
              text: String(data.text ?? ''),
            });
            break;

          case 'agent_change':
            store.addHandoff(
              String(data.from ?? ''),
              String(data.to ?? ''),
              String(data.taskSummary ?? ''),
            );
            break;

          case 'message_complete':
            store.completeAssistantMessage(
              data.agentName ? String(data.agentName) : undefined,
            );
            break;

          case 'error':
            toast.error(String(data.message ?? 'Agent error'));
            store.addTerminalLine({
              stream: 'system',
              text: `[error] ${String(data.message ?? '')}\n`,
            });
            break;

          case 'done':
          default:
            break;
        }
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Chat request failed');
    } finally {
      const store = useStore.getState();
      store.completeAssistantMessage();
      store.setStreaming(false);
      if (filesDirty) {
        void refreshFiles(project.id);
        store.refreshPreview();
      }
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="forge-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Sparkles className="h-8 w-8 text-primary" />
            <div>
              <p className="font-medium text-foreground">
                What should we build?
              </p>
              <p className="mt-1 max-w-sm text-sm">
                Describe an app — e.g. &quot;a kanban board with drag and
                drop&quot; — and the agent team will scaffold, code and run it
                in the sandbox.
              </p>
            </div>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isStreaming
              ? `${currentAgent} is working…`
              : 'Describe the app you want to build…'
          }
          disabled={isStreaming}
          autoFocus
        />
        <Button type="submit" size="icon" disabled={isStreaming || !input.trim()}>
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizonal className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
