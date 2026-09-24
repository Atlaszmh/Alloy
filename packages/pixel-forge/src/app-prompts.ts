import { buildPrompt, REFERENCE_NOTE } from './gemini';
import type { AssetSpec, StyleGuide } from './style';

/**
 * A Markdown sheet of ready-to-paste prompts for making sprites by hand in the
 * Gemini app, which the Gemini subscription covers (no API key or billing).
 * The images come back through `forge import`.
 */
export function appPromptsDoc(
  style: StyleGuide,
  assets: readonly AssetSpec[],
  referenceFile: string,
): string {
  const example = assets[0]?.id ?? 'frost_wolf';
  const lines = [
    '# Gemini app prompts',
    '',
    'For making sprites in the Gemini app with your subscription instead of the API.',
    'Written by `forge prompts`; run it again after changing `style.json` or `manifest.json`.',
    '',
    `1. Start a new chat for each sprite and attach \`${referenceFile}\` (next to this file) so it matches the existing art.`,
    '2. Paste the prompt. Regenerate until you have two or three you like.',
    `3. Download each image as PNG and name it after the sprite: \`${example}.png\`, \`${example}-2.png\`, and so on.`,
    '4. Put them in `inbox/` next to this file (on GitHub: open the folder, then Add file → Upload files) and run `forge import`.',
    '',
  ];
  for (const asset of assets) {
    lines.push(
      `## ${asset.id} (${asset.size}×${asset.size})`,
      '',
      '```text',
      `${buildPrompt(style, asset)} ${REFERENCE_NOTE}`,
      '```',
      '',
    );
  }
  return lines.join('\n');
}
