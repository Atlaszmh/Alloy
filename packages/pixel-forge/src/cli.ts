import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createImage,
  encodePng,
  fill,
  readImage,
  readPng,
  upscale,
  blit,
  writePng,
  type Image,
  type RGB,
} from './image';
import { bob, renderSprite, type CodeSprite } from './draw';
import { cleanSprite, type CleanOptions } from './clean';
import { packAtlas } from './atlas';
import { contactSheet } from './review';
import { buildPrompt, generateImages, REFERENCE_NOTE } from './gemini';
import { appPromptsDoc } from './app-prompts';
import { addCandidate, matchAssetId, writeCandidateReview } from './candidates';
import { loadProject, type AssetSpec, type Project } from './style';

/**
 * pixel-forge: pixel art pipeline.
 *
 *   list                       asset status (drawn in code, AI pick, missing)
 *   build                      draw code sprites + AI picks → game sprite sheet + review.png
 *   generate <id…> [--count N] [--model M] [--missing]
 *                              ask Gemini for candidates, clean them, write a review sheet
 *   prompts [id…]              write app-prompts.md + reference.png for making sprites
 *                              by hand in the Gemini app (default: every missing AI sprite)
 *   import [id] [file…]        clean images saved from the Gemini app into candidates
 *                              (default: everything in inbox/, matched by file name)
 *   pick <id> <n>              promote candidate n to the sprite used by `build`
 *   clean <in.png> <out.png> [--size N] [--no-outline] [--max-colors N]
 *                              clean any image into a sprite
 *
 * Options: --manifest <path> (default art/alloy/manifest.json).
 * `generate` needs GEMINI_API_KEY (a Google AI Studio key with billing enabled);
 * `prompts` + `import` use the Gemini app instead, which the subscription covers.
 */

type Flags = Record<string, string | boolean>;

function parse(argv: string[]): { cmd: string; args: string[]; flags: Flags } {
  const [cmd = 'help', ...rest] = argv;
  const args: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else args.push(a);
  }
  return { cmd, args, flags };
}

const aiPath = (p: Project, id: string) => join(p.dir, 'ai', `${id}.png`);
const candidateDir = (p: Project, id: string) => join(p.dir, 'candidates', id);
const inboxDir = (p: Project) => join(p.dir, 'inbox');
const IMAGE_FILE = /\.(png|jpe?g|webp)$/i;

function assetById(p: Project, id: string): AssetSpec {
  const a = p.manifest.assets.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown asset "${id}". Run "list" to see ids.`);
  return a;
}

/** AI assets that have no picked sprite yet. */
const missingAi = (p: Project) =>
  p.manifest.assets.filter((a) => a.source === 'ai' && !existsSync(aiPath(p, a.id)));

function cleanOptions(p: Project, asset: AssetSpec, background: RGB | 'auto'): CleanOptions {
  return {
    size: asset.size,
    palette: p.palette,
    background,
    outline: p.outline,
    maxColors: p.style.maxColors,
  };
}

async function codeFrames(p: Project, asset: AssetSpec): Promise<Image[]> {
  const mod = (await import(pathToFileURL(resolve(p.dir, asset.file!)).href)) as {
    default: CodeSprite;
  };
  return renderSprite(mod.default);
}

/** Frames for an asset, or null if it has no art yet. */
async function framesFor(p: Project, asset: AssetSpec): Promise<Image[] | null> {
  if (asset.source === 'code' && asset.file) return codeFrames(p, asset);
  const file = aiPath(p, asset.id);
  if (!existsSync(file)) return null;
  const img = readPng(file);
  return [img, bob(img)];
}

async function cmdList(p: Project): Promise<void> {
  for (const a of p.manifest.assets) {
    const status =
      a.source === 'code'
        ? 'drawn in code'
        : existsSync(aiPath(p, a.id))
          ? 'AI sprite picked'
          : 'missing: generate or import';
    console.log(`${a.id.padEnd(18)} ${String(a.size).padStart(3)}px  ${status}`);
  }
}

async function cmdBuild(p: Project): Promise<void> {
  const entries: { id: string; frames: Image[] }[] = [];
  const missing: string[] = [];
  for (const a of p.manifest.assets) {
    const frames = await framesFor(p, a);
    if (frames) entries.push({ id: a.id, frames });
    else missing.push(a.id);
  }
  const { image, json } = packAtlas(entries);
  const png = resolve(p.dir, p.manifest.atlas.png);
  const jsonPath = resolve(p.dir, p.manifest.atlas.json);
  writePng(png, image);
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(json, null, 2) + '\n');
  writePng(
    resolve(p.dir, p.manifest.review),
    contactSheet(entries.map((e) => ({ label: e.id, frames: e.frames }))),
  );
  console.log(`Packed ${entries.length} sprites (${image.width}×${image.height}) → ${png}`);
  if (missing.length) console.log(`Not yet drawn: ${missing.join(', ')}`);
}

/** Existing sprites, big and chunky on the key color, so the model can match the style. */
async function referenceSheet(p: Project, exclude?: string): Promise<Buffer | null> {
  const refs: Image[] = [];
  for (const a of p.manifest.assets) {
    if (a.id === exclude || refs.length >= 4) continue;
    const frames = await framesFor(p, a);
    if (frames) refs.push(frames[0]);
  }
  if (!refs.length) return null;
  const k = 12;
  const cell = Math.max(...refs.map((r) => r.width)) * k;
  const sheet = createImage(refs.length * (cell + k * 2), cell + k * 2);
  fill(sheet, p.background);
  refs.forEach((r, i) =>
    blit(sheet, upscale(r, k), k + i * (cell + k * 2), k + cell - r.height * k),
  );
  return encodePng(sheet);
}

async function cmdGenerate(p: Project, ids: string[], flags: Flags): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
  const count = Number(flags.count ?? 3);
  const model = typeof flags.model === 'string' ? flags.model : p.style.model;
  const targets = flags.missing ? missingAi(p) : ids.map((id) => assetById(p, id));
  if (!targets.length) {
    console.log('Nothing to generate.');
    return;
  }
  for (const asset of targets) {
    const ref = await referenceSheet(p, asset.id);
    const prompt = buildPrompt(p.style, asset) + (ref ? ` ${REFERENCE_NOTE}` : '');
    const dir = candidateDir(p, asset.id);
    console.log(`${asset.id}: asking ${model} for ${count} candidate(s)…`);
    for (let i = 0; i < count; i++) {
      const [raw] = await generateImages(
        { prompt, references: ref ? [ref] : [], model },
        { apiKey },
      );
      const { n, snapped } = addCandidate(dir, raw, cleanOptions(p, asset, p.background));
      console.log(
        `  candidate ${n}: ${snapped ? 'snapped to its pixel grid' : 'resampled to fit'}`,
      );
    }
    const review = writeCandidateReview(dir, asset.id);
    console.log(`  review: ${review}\n  keep one with: pick ${asset.id} <n>`);
  }
}

async function cmdPrompts(p: Project, ids: string[]): Promise<void> {
  const targets = ids.length ? ids.map((id) => assetById(p, id)) : missingAi(p);
  if (!targets.length) {
    console.log('Every AI sprite has been picked.');
    return;
  }
  const ref = await referenceSheet(p);
  if (ref) writeFileSync(join(p.dir, 'reference.png'), ref);
  const doc = join(p.dir, 'app-prompts.md');
  writeFileSync(doc, appPromptsDoc(p.style, targets, 'reference.png'));
  mkdirSync(inboxDir(p), { recursive: true });
  console.log(`Wrote prompts for ${targets.length} sprite(s) → ${doc}`);
  if (ref) console.log(`Attach ${join(p.dir, 'reference.png')} in each chat.`);
}

function cmdImport(p: Project, args: string[]): void {
  const ids = p.manifest.assets.filter((a) => a.source === 'ai').map((a) => a.id);
  // `import <id> <file…>` takes files for one asset whatever they are called.
  const forced = args[0] !== undefined && ids.includes(args[0]) ? args[0] : null;
  const inbox = inboxDir(p);
  const files = forced
    ? args.slice(1)
    : args.length
      ? args
      : existsSync(inbox)
        ? readdirSync(inbox)
            .filter((f) => IMAGE_FILE.test(f))
            .sort()
            .map((f) => join(inbox, f))
        : [];
  if (forced && !files.length) throw new Error(`Give the image files for ${forced}.`);
  if (!files.length) {
    console.log(`Nothing to import. Put images named after a sprite id in ${inbox}.`);
    return;
  }
  const touched = new Set<string>();
  const unnamed: string[] = [];
  for (const file of files) {
    const id = forced ?? matchAssetId(file, ids);
    if (!id) {
      unnamed.push(file);
      continue;
    }
    let raw: Image;
    try {
      raw = readImage(file);
    } catch (err) {
      console.log(`${basename(file)}: ${(err as Error).message}`);
      continue;
    }
    const { n, snapped } = addCandidate(
      candidateDir(p, id),
      raw,
      cleanOptions(p, assetById(p, id), 'auto'),
    );
    // The raw image now lives with the candidates; clear it out of the inbox.
    if (resolve(dirname(file)) === resolve(inbox)) unlinkSync(file);
    console.log(
      `${id}: ${basename(file)} → candidate ${n} (${snapped ? 'snapped to its pixel grid' : 'resampled to fit'})`,
    );
    touched.add(id);
  }
  for (const id of touched) {
    console.log(`  review: ${writeCandidateReview(candidateDir(p, id), id)}  (pick ${id} <n>)`);
  }
  if (unnamed.length) {
    console.log(
      `Not named after a sprite id, so skipped (rename to e.g. ${ids[0]}-2.png, or run "import <id> <file…>"):`,
    );
    for (const f of unnamed) console.log(`  ${f}`);
  }
}

function cmdPick(p: Project, id: string, n: string): void {
  const from = join(candidateDir(p, id), `${n}.png`);
  if (!existsSync(from)) {
    const have = existsSync(candidateDir(p, id))
      ? readdirSync(candidateDir(p, id)).join(', ')
      : 'none';
    throw new Error(`No candidate ${n} for ${id} (have: ${have}).`);
  }
  mkdirSync(join(p.dir, 'ai'), { recursive: true });
  copyFileSync(from, aiPath(p, id));
  console.log(`${id}: using candidate ${n}. Run "build" to update the game's sprite sheet.`);
}

function cmdClean(p: Project, input: string, output: string, flags: Flags): void {
  const { image, snapped, cell } = cleanSprite(readImage(input), {
    size: Number(flags.size ?? 16),
    palette: p.palette,
    outline: flags['no-outline'] ? null : p.outline,
    maxColors: flags['max-colors'] ? Number(flags['max-colors']) : p.style.maxColors,
  });
  writePng(output, image);
  console.log(`${output}: ${snapped ? `snapped (${cell}px blocks)` : 'resampled to fit'}`);
}

async function main(): Promise<void> {
  const { cmd, args, flags } = parse(process.argv.slice(2));
  const manifest = typeof flags.manifest === 'string' ? flags.manifest : 'art/alloy/manifest.json';
  if (cmd === 'help' || cmd === '--help') {
    console.log(
      'pixel-forge <list|build|generate|prompts|import|pick|clean> [options]. See src/cli.ts for details.',
    );
    return;
  }
  const p = loadProject(manifest);
  switch (cmd) {
    case 'list':
      return cmdList(p);
    case 'build':
      return cmdBuild(p);
    case 'generate':
      return cmdGenerate(p, args, flags);
    case 'prompts':
      return cmdPrompts(p, args);
    case 'import':
      return cmdImport(p, args);
    case 'pick':
      return cmdPick(p, args[0], args[1]);
    case 'clean':
      return cmdClean(p, args[0], args[1], flags);
    default:
      throw new Error(`Unknown command "${cmd}".`);
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exitCode = 1;
});
