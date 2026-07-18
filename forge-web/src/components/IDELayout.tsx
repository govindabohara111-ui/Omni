'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Hammer, MessageSquare, Code2, Trash2, TerminalSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChatPanel } from '@/components/ChatPanel';
import { CodeViewer } from '@/components/CodeViewer';
import { FileTree } from '@/components/FileTree';
import { LivePreview } from '@/components/LivePreview';
import { useStore, type UIMessage } from '@/store/useStore';
import { cn } from '@/lib/utils';

export interface InitialProject {
  id: string;
  name: string;
  hostPort: number | null;
}

interface IDELayoutProps {
  project: InitialProject;
  initialMessages: UIMessage[];
}

function TerminalPanel() {
  const terminalLines = useStore((s) => s.terminalLines);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
  }, [terminalLines]);

  return (
    <div className="col-span-3 flex min-h-0 flex-col border-t border-border bg-black/60">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <TerminalSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Terminal
        </span>
      </div>
      <div className="forge-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed">
        {terminalLines.length === 0 ? (
          <span className="text-muted-foreground">
            Output from agent `bash` commands will stream here.
          </span>
        ) : (
          terminalLines.map((line, i) => (
            <span
              key={i}
              className={cn(
                'whitespace-pre-wrap',
                line.stream === 'stderr' && 'text-amber-400',
                line.stream === 'system' && 'text-destructive',
                line.stream === 'stdout' && 'text-emerald-200/90',
              )}
            >
              {line.text}
            </span>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

export function IDELayout({ project, initialMessages }: IDELayoutProps) {
  const router = useRouter();
  const setProject = useStore((s) => s.setProject);
  const setMessages = useStore((s) => s.setMessages);
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const isStreaming = useStore((s) => s.isStreaming);
  const currentAgent = useStore((s) => s.currentAgent);

  // Hydrate the client store from the server-rendered project data once.
  useEffect(() => {
    setProject(project);
    setMessages(initialMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function handleDestroy() {
    if (!confirm('Destroy the sandbox container? Generated files are kept in ./volumes.')) {
      return;
    }
    try {
      const res = await fetch('/api/destroy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });
      if (!res.ok) throw new Error('Destroy failed');
      toast.success('Sandbox destroyed');
      router.push('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Destroy failed');
    }
  }

  return (
    <div className="grid h-screen grid-cols-[250px_1fr_300px] grid-rows-[1fr_200px] overflow-hidden">
      {/* Top-left: file tree */}
      <FileTree />

      {/* Top-center: chat / code tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'chat' | 'code')}
        className="flex min-h-0 flex-col"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Hammer className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold">{project.name}</span>
            <Badge
              variant={isStreaming ? 'default' : 'secondary'}
              className="shrink-0 text-[10px]"
            >
              {isStreaming ? `${currentAgent} — working` : 'idle'}
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <TabsList className="h-7">
              <TabsTrigger value="chat" className="h-5 px-2 text-xs">
                <MessageSquare className="h-3 w-3" /> Chat
              </TabsTrigger>
              <TabsTrigger value="code" className="h-5 px-2 text-xs">
                <Code2 className="h-3 w-3" /> Code
              </TabsTrigger>
            </TabsList>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={handleDestroy}
              title="Destroy sandbox"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <TabsContent value="chat" className="mt-0 min-h-0 flex-1">
          <ChatPanel />
        </TabsContent>
        <TabsContent value="code" className="mt-0 min-h-0 flex-1">
          <CodeViewer />
        </TabsContent>
      </Tabs>

      {/* Top-right: live preview */}
      <LivePreview />

      {/* Bottom: terminal spanning all columns */}
      <TerminalPanel />
    </div>
  );
}
