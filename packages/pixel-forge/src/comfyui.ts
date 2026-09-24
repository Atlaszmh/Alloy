import { decodeImage, type Image } from './image';
import type { Workflow } from './workflow';

/** Image generation through a local ComfyUI server (see docs/.../local-pixel-art-generation.md). */

export const DEFAULT_COMFY_URL = 'http://127.0.0.1:8188';

export interface ComfyOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
}

async function request(path: string, init: RequestInit, opts: ComfyOptions): Promise<Response> {
  const url = opts.url ?? DEFAULT_COMFY_URL;
  try {
    return await (opts.fetchImpl ?? fetch)(url + path, init);
  } catch (err) {
    throw new Error(
      `Can't reach ComfyUI at ${url} (${(err as Error).message}). Start it with run_nvidia_gpu.bat in the ComfyUI folder.`,
    );
  }
}

/** Readable summary of ComfyUI's validation errors, or '' if there are none. */
function describeErrors(json: any): string {
  const nodes = Object.entries(json?.node_errors ?? {}).flatMap(([id, e]: [string, any]) =>
    (e.errors ?? []).map((x: any) => `${e.class_type} (node ${id}): ${x.details || x.message}`),
  );
  if (nodes.length) return nodes.join('; ');
  const e = json?.error;
  return e ? [e.message, e.details].filter(Boolean).join(': ') : '';
}

/** Upload a PNG to ComfyUI's input folder; returns the name to put in a LoadImage node. */
export async function uploadImage(png: Buffer, name: string, opts: ComfyOptions): Promise<string> {
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), name);
  form.append('overwrite', 'true');
  const res = await request('/upload/image', { method: 'POST', body: form }, opts);
  if (!res.ok) throw new Error(`ComfyUI rejected the upload (${res.status}): ${await res.text()}`);
  const j = (await res.json()) as { name: string; subfolder?: string };
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

/** Queue a filled workflow, wait for it to finish, and return every image it output. */
export async function runWorkflow(wf: Workflow, opts: ComfyOptions): Promise<Image[]> {
  const res = await request(
    '/prompt',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: wf }),
    },
    opts,
  );
  const queued = (await res.json().catch(() => null)) as any;
  // ComfyUI still queues the valid parts of a workflow with errors, so any error fails the run.
  const problems = describeErrors(queued);
  if (!res.ok || problems) {
    throw new Error(`ComfyUI rejected the workflow: ${problems || `HTTP ${res.status}`}`);
  }
  const id: string = queued.prompt_id;
  const deadline = Date.now() + (opts.timeoutMs ?? 300_000);
  for (;;) {
    // A prompt appears in the history once it has finished, one way or the other.
    const entry = ((await (await request(`/history/${id}`, {}, opts)).json()) as any)[id];
    if (entry) {
      if (entry.status?.status_str === 'error') {
        const failure = entry.status.messages?.find((m: any[]) => m[0] === 'execution_error')?.[1];
        throw new Error(
          `ComfyUI failed in ${failure?.node_type ?? 'the workflow'}: ${failure?.exception_message ?? 'unknown error'}`,
        );
      }
      const files = Object.values(entry.outputs ?? {}).flatMap((o: any) => o.images ?? []);
      const images: Image[] = [];
      for (const f of files) {
        const q = new URLSearchParams({
          filename: f.filename,
          subfolder: f.subfolder,
          type: f.type,
        });
        const img = await request(`/view?${q}`, {}, opts);
        images.push(decodeImage(Buffer.from(await img.arrayBuffer())));
      }
      if (!images.length) throw new Error('The workflow finished without outputting an image.');
      return images;
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ComfyUI (prompt ${id}).`);
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 500));
  }
}
