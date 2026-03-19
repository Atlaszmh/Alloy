import type { Response } from 'express';

const connections = new Map<string, Set<Response>>();

export function addSSEClient(runId: string, res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  if (!connections.has(runId)) connections.set(runId, new Set());
  connections.get(runId)!.add(res);
  res.on('close', () => {
    const clients = connections.get(runId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) connections.delete(runId);
    }
  });
}

export function sendProgress(runId: string, data: {
  progress: number;
  completed: number;
  total: number;
  status: string;
}): void {
  const clients = connections.get(runId);
  if (clients) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      res.write(msg);
    }
  }
}

export function closeSSE(runId: string): void {
  const clients = connections.get(runId);
  if (clients) {
    for (const res of clients) res.end();
    connections.delete(runId);
  }
}
