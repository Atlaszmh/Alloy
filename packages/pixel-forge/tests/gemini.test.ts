import { describe, it, expect, vi } from 'vitest';
import { buildPrompt, generateImages, GeminiError } from '../src/gemini';
import { createImage, encodePng } from '../src/image';
import type { StyleGuide } from '../src/style';

const STYLE: StyleGuide = {
  name: 'test',
  palette: { name: 'p', colors: ['#000000', '#ffffff'] },
  outline: '#000000',
  background: '#ff00ff',
  pixelUnit: 0.1,
  maxColors: 8,
  model: 'gemini-test-image',
  prompt: ['A {size}x{size} sprite of {subject}.', 'At most {maxColors} colors.'],
};

const PNG = encodePng(createImage(4, 4));

function okResponse() {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              { text: 'here you go' },
              { inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } },
            ],
          },
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('buildPrompt', () => {
  it('fills the style template with the asset', () => {
    const p = buildPrompt(STYLE, { id: 'rat', size: 16, subject: 'a grey rat', source: 'ai' });
    expect(p).toBe('A 16x16 sprite of a grey rat. At most 8 colors.');
  });
});

describe('generateImages', () => {
  it('posts the prompt and references to the model and returns the images', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const images = await generateImages(
      { prompt: 'draw', references: [PNG], model: 'gemini-test-image' },
      { apiKey: 'k-123', fetchImpl },
    );
    expect(images).toHaveLength(1);
    expect(images[0].width).toBe(4);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-image:generateContent',
    );
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k-123');
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0]).toEqual({ text: 'draw' });
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe('image/png');
    expect(body.generationConfig.responseModalities).toContain('IMAGE');
  });

  it('explains billing and key problems', async () => {
    const fail = (status: number, message: string) =>
      vi.fn(
        async () => new Response(JSON.stringify({ error: { code: status, message } }), { status }),
      );
    await expect(
      generateImages(
        { prompt: 'x' },
        {
          apiKey: 'k',
          fetchImpl: fail(400, 'API key not valid. Please pass a valid API key.'),
          retries: 0,
        },
      ),
    ).rejects.toThrow(/GEMINI_API_KEY/);
    await expect(
      generateImages(
        { prompt: 'x' },
        { apiKey: 'k', fetchImpl: fail(429, 'Quota exceeded for metric free_tier'), retries: 0 },
      ),
    ).rejects.toThrow(/billing/i);
    await expect(
      generateImages({ prompt: 'x' }, { apiKey: '', fetchImpl: vi.fn() }),
    ).rejects.toBeInstanceOf(GeminiError);
  });

  it('retries once on an overloaded model', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 503, message: 'overloaded' } }), {
          status: 503,
        }),
      )
      .mockResolvedValueOnce(okResponse());
    const images = await generateImages(
      { prompt: 'x' },
      { apiKey: 'k', fetchImpl, retries: 1, retryDelayMs: 1 },
    );
    expect(images).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
