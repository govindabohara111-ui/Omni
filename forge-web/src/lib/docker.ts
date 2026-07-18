import Docker from 'dockerode';
import path from 'path';
import fs from 'fs';
import { Writable } from 'stream';
import { db } from './db';

const SANDBOX_IMAGE = 'node:20-alpine';
const EXEC_TIMEOUT_MS = 60_000;
const PORT_RANGE_START = 3000;
const PORT_RANGE_END = 4000;

let dockerSingleton: Docker | null = null;

export function getDocker(): Docker {
  if (!dockerSingleton) {
    dockerSingleton = new Docker({
      socketPath: process.env.DOCKER_SOCKET ?? '/var/run/docker.sock',
    });
  }
  return dockerSingleton;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Pull the sandbox image if it is not already present locally.
 */
async function ensureImage(docker: Docker): Promise<void> {
  try {
    await docker.getImage(SANDBOX_IMAGE).inspect();
    return; // Image already exists locally.
  } catch {
    // Not present — fall through to pull.
  }

  const pullStream = await docker.pull(SANDBOX_IMAGE);
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(pullStream, (err: Error | null) =>
      err ? reject(err) : resolve(),
    );
  });
}

function randomPort(): number {
  return (
    PORT_RANGE_START +
    Math.floor(Math.random() * (PORT_RANGE_END - PORT_RANGE_START + 1))
  );
}

/**
 * Create and start an isolated sandbox container for a project.
 *
 * - node:20-alpine, 512MB memory cap, 50% of one CPU (CpuQuota 50000/100000)
 * - ./volumes/<projectId> on the host is bind-mounted to /app
 * - Container port 3000 is published on a random host port (3000-4000)
 *
 * The Project row is updated with { containerId, hostPort }.
 */
export async function createSandbox(
  projectId: string,
): Promise<{ containerId: string; hostPort: number }> {
  const docker = getDocker();
  await ensureImage(docker);

  const volumePath = path.resolve(process.cwd(), 'volumes', projectId);
  fs.mkdirSync(volumePath, { recursive: true });

  // Port collisions are possible with random selection, so retry a few times.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const hostPort = randomPort();
    try {
      const container = await docker.createContainer({
        Image: SANDBOX_IMAGE,
        name: `forge-${projectId}`,
        // Keep the container alive indefinitely; agents exec into it.
        Cmd: ['sh', '-c', 'tail -f /dev/null'],
        WorkingDir: '/app',
        Tty: false,
        ExposedPorts: { '3000/tcp': {} },
        Env: ['HOST=0.0.0.0', 'PORT=3000'],
        HostConfig: {
          Memory: 512 * 1024 * 1024, // 512mb
          CpuQuota: 50000, // 50% of one CPU with the default 100000 period
          CpuPeriod: 100000,
          Binds: [`${volumePath}:/app`],
          PortBindings: {
            '3000/tcp': [{ HostPort: String(hostPort) }],
          },
        },
      });

      await container.start();

      await db.project.update({
        where: { id: projectId },
        data: { containerId: container.id, hostPort },
      });

      return { containerId: container.id, hostPort };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      // Retry only on port conflicts or name conflicts; rethrow anything else.
      if (!/port is already allocated|address already in use/i.test(message)) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error('Failed to allocate a sandbox container');
}

/**
 * Run a shell command inside the container via `sh -c`.
 *
 * stdout/stderr are demultiplexed and collected. A hard 60 second timeout
 * tears the exec stream down and returns exit code 124 if the command hangs.
 * An optional onChunk callback receives output incrementally (used to stream
 * terminal output to the UI).
 */
export async function execCommand(
  containerId: string,
  command: string,
  options?: { onChunk?: (stream: 'stdout' | 'stderr', data: string) => void },
): Promise<ExecResult> {
  const docker = getDocker();
  const container = docker.getContainer(containerId);

  const exec = await container.exec({
    Cmd: ['sh', '-c', command],
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: '/app',
  });

  const stream = await exec.start({ hijack: true, stdin: false });

  return new Promise<ExecResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = async (timedOut: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      let exitCode = timedOut ? 124 : 0;
      if (!timedOut) {
        try {
          const info = await exec.inspect();
          exitCode = info.ExitCode ?? 0;
        } catch {
          exitCode = -1;
        }
      }

      if (timedOut) {
        stderr += `\n[forge] Command timed out after ${EXEC_TIMEOUT_MS / 1000}s and was killed.`;
      }

      resolve({ stdout, stderr, exitCode });
    };

    // CRITICAL: hard timeout so hung commands (dev servers, watch modes,
    // interactive prompts) cannot stall the agent loop forever.
    const timer = setTimeout(() => {
      try {
        stream.destroy();
      } catch {
        // Stream may already be closed.
      }
      void settle(true);
    }, EXEC_TIMEOUT_MS);

    // Docker multiplexes stdout/stderr over one stream; demux into collectors.
    const stdoutCollector = new Writable({
      write(chunk: Buffer, _enc, cb) {
        const text = chunk.toString('utf-8');
        stdout += text;
        options?.onChunk?.('stdout', text);
        cb();
      },
    });
    const stderrCollector = new Writable({
      write(chunk: Buffer, _enc, cb) {
        const text = chunk.toString('utf-8');
        stderr += text;
        options?.onChunk?.('stderr', text);
        cb();
      },
    });

    docker.modem.demuxStream(stream, stdoutCollector, stderrCollector);

    stream.on('end', () => void settle(false));
    stream.on('close', () => void settle(false));
    stream.on('error', () => void settle(false));
  });
}

/**
 * Kill and remove a sandbox container. Errors are swallowed so cleanup is
 * idempotent (the container may already be gone).
 */
export async function destroySandbox(containerId: string): Promise<void> {
  const docker = getDocker();
  const container = docker.getContainer(containerId);

  try {
    await container.kill();
  } catch {
    // Already stopped or missing.
  }
  try {
    await container.remove({ force: true });
  } catch {
    // Already removed.
  }
}
