import { describe, it, expect } from 'vitest';
import { runWorkflow, uploadImage } from '../src/comfyui';
import { createImage, encodePng } from '../src/image';
import type { Workflow } from '../src/workflow';

const URL_ = 'http://comfy.test';
const PNG = encodePng(createImage(3, 2));
const WF: Workflow = { '9': { class_type: 'PreviewImage', inputs: {} } };

type Route = (req: Request) => Response | Promise<Response>;

/** A fake ComfyUI: routes by method + path, records every request. */
function fakeComfy(routes: Record<string, Route>) {
  const calls: Request[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push(req);
    const path = new URL(req.url).pathname;
    const route = routes[`${req.method} ${path}`];
    return route ? route(req) : new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('runWorkflow', () => {
  it('queues the workflow, waits for it, and returns its images', async () => {
    let polls = 0;
    const { fetchImpl, calls } = fakeComfy({
      'POST /prompt': () => json({ prompt_id: 'p1', number: 1, node_errors: {} }),
      'GET /history/p1': () =>
        ++polls < 2
          ? json({})
          : json({
              p1: {
                status: { status_str: 'success', completed: true, messages: [] },
                outputs: { '9': { images: [{ filename: 'a.png', subfolder: '', type: 'temp' }] } },
              },
            }),
      'GET /view': () => new Response(PNG),
    });
    const images = await runWorkflow(WF, { url: URL_, fetchImpl, pollMs: 1 });
    expect(images).toHaveLength(1);
    expect(images[0].width).toBe(3);
    const sent = (await calls[0].json()) as { prompt: Workflow };
    expect(sent.prompt).toEqual(WF);
    const view = new URL(calls.at(-1)!.url);
    expect(view.searchParams.get('filename')).toBe('a.png');
    expect(view.searchParams.get('type')).toBe('temp');
  });

  it('explains node errors such as a missing model file, even on a 200', async () => {
    const { fetchImpl } = fakeComfy({
      'POST /prompt': () =>
        json({
          prompt_id: 'p2',
          node_errors: {
            '1': {
              class_type: 'UNETLoader',
              errors: [
                {
                  message: 'Value not in list',
                  details: "unet_name: 'nope.safetensors' not in ['a.safetensors']",
                },
              ],
            },
          },
        }),
    });
    await expect(runWorkflow(WF, { url: URL_, fetchImpl })).rejects.toThrow(
      /UNETLoader.*nope\.safetensors/,
    );
  });

  it('explains whole-workflow errors', async () => {
    const { fetchImpl } = fakeComfy({
      'POST /prompt': () =>
        json({ error: { message: 'Prompt has no outputs', details: '' }, node_errors: {} }, 400),
    });
    await expect(runWorkflow(WF, { url: URL_, fetchImpl })).rejects.toThrow(/no outputs/);
  });

  it('reports a failure while running', async () => {
    const { fetchImpl } = fakeComfy({
      'POST /prompt': () => json({ prompt_id: 'p3', node_errors: {} }),
      'GET /history/p3': () =>
        json({
          p3: {
            status: {
              status_str: 'error',
              completed: false,
              messages: [
                [
                  'execution_error',
                  { node_type: 'KSampler', exception_message: 'CUDA out of memory' },
                ],
              ],
            },
            outputs: {},
          },
        }),
    });
    await expect(runWorkflow(WF, { url: URL_, fetchImpl, pollMs: 1 })).rejects.toThrow(
      /KSampler.*out of memory/,
    );
  });

  it('says how to start ComfyUI when it is not running', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(runWorkflow(WF, { url: URL_, fetchImpl })).rejects.toThrow(
      /Can't reach ComfyUI at http:\/\/comfy\.test.*run_nvidia_gpu\.bat/,
    );
  });
});

describe('uploadImage', () => {
  it('uploads a PNG and returns the name to put in a LoadImage node', async () => {
    const { fetchImpl, calls } = fakeComfy({
      'POST /upload/image': () => json({ name: 'ref.png', subfolder: 'forge', type: 'input' }),
    });
    expect(await uploadImage(PNG, 'ref.png', { url: URL_, fetchImpl })).toBe('forge/ref.png');
    const form = await calls[0].formData();
    expect((form.get('image') as File).name).toBe('ref.png');
    expect(form.get('overwrite')).toBe('true');
  });
});
