import jpeg from 'jpeg-js';
import { decodePng, type Image } from './image';
import type { AssetSpec, StyleGuide } from './style';

/** Image generation through the Gemini API (Google AI Studio key). */

export const DEFAULT_MODEL = 'gemini-3.1-flash-image-preview';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

export interface GenerateRequest {
  prompt: string;
  /** PNG images shown to the model as style references. */
  references?: Buffer[];
  model?: string;
  aspectRatio?: string;
}

export interface GenerateOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Retries on 429 / 5xx. */
  retries?: number;
  retryDelayMs?: number;
}

export function buildPrompt(style: StyleGuide, asset: AssetSpec): string {
  return style.prompt
    .join(' ')
    .replaceAll('{size}', String(asset.size))
    .replaceAll('{subject}', asset.subject)
    .replaceAll('{maxColors}', String(style.maxColors));
}

function explain(status: number, message: string): GeminiError {
  if (/API key not valid|API_KEY_INVALID/i.test(message)) {
    return new GeminiError(
      `The API key was rejected. Check the GEMINI_API_KEY environment variable. (${message})`,
      status,
    );
  }
  if (status === 429 || /quota|free_tier|billing/i.test(message)) {
    return new GeminiError(
      `Quota or billing problem. Image models have no free tier: enable billing on the key's Google Cloud project and apply your AI Pro credits. (${message})`,
      status,
    );
  }
  if (status === 403) {
    return new GeminiError(
      `Permission denied. Make sure the Generative Language API is enabled for the key's project. (${message})`,
      status,
    );
  }
  if (status === 404)
    return new GeminiError(
      `Model not found. Check the model id in style.json or --model. (${message})`,
      status,
    );
  return new GeminiError(`Gemini request failed (${status}): ${message}`, status);
}

function decodeImage(mime: string, data: string): Image {
  const bytes = Buffer.from(data, 'base64');
  if (mime.includes('png')) return decodePng(bytes);
  if (mime.includes('jpeg') || mime.includes('jpg')) {
    const raw = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    return { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data) };
  }
  throw new GeminiError(`Unsupported image type from the model: ${mime}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function generateImages(
  req: GenerateRequest,
  opts: GenerateOptions,
): Promise<Image[]> {
  if (!opts.apiKey) {
    throw new GeminiError(
      'No API key. Set GEMINI_API_KEY to a Google AI Studio key from a project with billing enabled.',
    );
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const model = req.model ?? DEFAULT_MODEL;
  const parts: object[] = [{ text: req.prompt }];
  for (const ref of req.references ?? [])
    parts.push({ inline_data: { mime_type: 'image/png', data: ref.toString('base64') } });
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: req.aspectRatio ?? '1:1' },
    },
  });
  const retries = opts.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
      body,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      const message = json?.error?.message ?? text.slice(0, 300);
      const transient = res.status === 429 || res.status >= 500;
      const quotaGone = /free_tier|billing/i.test(message);
      if (transient && !quotaGone && attempt < retries) {
        await sleep((opts.retryDelayMs ?? 4000) * 2 ** attempt);
        continue;
      }
      throw explain(res.status, message);
    }
    if (json?.promptFeedback?.blockReason) {
      throw new GeminiError(
        `The prompt was blocked (${json.promptFeedback.blockReason}). Rephrase the subject.`,
      );
    }
    const images: Image[] = [];
    const notes: string[] = [];
    for (const cand of json?.candidates ?? []) {
      for (const part of cand?.content?.parts ?? []) {
        const inline = part.inlineData ?? part.inline_data;
        if (inline?.data)
          images.push(decodeImage(inline.mimeType ?? inline.mime_type ?? 'image/png', inline.data));
        else if (part.text) notes.push(part.text);
      }
    }
    if (images.length === 0) {
      const reason = json?.candidates?.[0]?.finishReason ?? 'no image';
      throw new GeminiError(
        `The model returned no image (${reason}). ${notes.join(' ').slice(0, 200)}`,
      );
    }
    return images;
  }
}
