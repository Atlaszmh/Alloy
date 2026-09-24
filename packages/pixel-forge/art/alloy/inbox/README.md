# Inbox

Drop images made in the Gemini app here, named after the sprite they are for
(`frost_wolf.png`, `frost_wolf-2.png`, ...). The prompts to paste, and the
reference image to attach, are in `../app-prompts.md` and `../reference.png`.

`pnpm -F @alloy/pixel-forge forge import` cleans each image into a candidate
sprite, moves it out of this folder, and writes a review sheet per sprite.
Then `forge pick <id> <n>` and `forge build`. PNG and JPEG only.
