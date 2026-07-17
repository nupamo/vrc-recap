# VRC Recap

[한국어](README.md) · [Live site](https://nupa.moe/vrc-recap/)

VRC Recap turns a folder of VRChat screenshots into a personal, photo-first recap. It keeps original photos, world names, nicknames, and dates intact while arranging recurring places and people into a timeline.

## Highlights

- Korean, English, and Japanese interfaces
- Infers the owner from the nickname that appears most often in embedded metadata
- Finds a special person from two-person memories repeated across different days
- Counts same-day bursts as one visit or shared day
- Uses browser-local MediaPipe models when metadata is incomplete
- Produces a desktop-first recap and a downloadable 16:9 summary card with four photos

## Privacy

Photos are selected and processed inside your browser. The application does not upload the selected folder, original screenshots, extracted metadata, or inference results to a server.

The repository also ignores local screenshot directories, build output, logs, and environment files. Do not commit personal photos when creating issues, benchmarks, or pull requests.

## How the local analysis works

VRC Recap prefers VRChat PNG metadata whenever it is available. The original world name and nickname values are displayed without translation.

When person metadata is missing, local MediaPipe face detection, person detection, and image embeddings provide a best-effort grouping of recurring avatars and scenes. These models were selected for browser compatibility, download size, and local execution—not for perfect VRChat avatar recognition.

Results can therefore be imperfect when avatars change frequently, faces are occluded, images are extremely stylized, or a device cannot run the local models. The recap falls back to available metadata and dates instead of uploading photos elsewhere.

## Development

Requirements:

- Node.js 22.13 or newer
- pnpm 9

```bash
cd web
pnpm install
pnpm run dev
```

Validation:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
```

Pushes to `main` are built as a static export and deployed to GitHub Pages by [the deployment workflow](.github/workflows/deploy.yml).

## Improve the local models with an AI coding agent

If you want more reliable avatar identity, scene clustering, or representative-photo selection, fork this repository and ask Claude Code or Codex to improve it. Keep the privacy boundary: all photo analysis must continue to run locally in the browser.

You can start with this prompt:

```text
You are improving the local visual inference pipeline in the VRC Recap repository.

Goal:
Make recurring VRChat avatar identity, two-person memory detection, scene clustering,
and representative-photo selection more accurate while keeping every selected photo
and inference result entirely inside the user's browser.

Product rules to preserve:
- Embedded VRChat metadata is the source of truth when available. Keep original world
  names and nicknames unchanged in results.
- The nickname appearing most often in metadata represents the user.
- A special person must appear alone with the user across multiple different calendar
  days. Same-day bursts count once, and group photos never count as two-person memories.
- Prefer photos where the user's avatar is alone, large, and near the center for cover,
  timeline, place, peak-period, and summary representatives.
- Keep Korean, English, and Japanese support and keep technical model language out of
  the user-facing recap.
- Do not add uploads, analytics containing photo data, remote inference APIs, or a local
  LLM requirement.
- Preserve GitHub Pages static-export compatibility and the repository's existing tests.

Engineering tasks:
1. Audit app/lib/localVision.ts, app/lib/memory.ts, and app/lib/recapInference.ts.
2. Establish a reproducible benchmark using synthetic or explicitly consented images;
   never commit private screenshots.
3. Measure the current false merge and false split rates for recurring avatars and scenes.
4. Propose a browser-feasible improvement, comparing model size, WASM/WebGPU support,
   memory use, first-load cost, and fallback behavior.
5. Implement the smallest effective change with bounded concurrency and cleanup of all
   image bitmaps, object URLs, model instances, and temporary tensors.
6. Add unit tests for same-day deduplication, exact two-person filtering, changing avatars,
   missing metadata, model failure, and GitHub Pages asset paths.
7. Run lint, typecheck, the full test suite, and a production static export.
8. Document the benchmark, tradeoffs, model licenses, and rollback path.

Acceptance criteria:
- No selected photo or derived embedding leaves the browser.
- Existing metadata-first behavior does not regress.
- The benchmark shows a measurable improvement over the current implementation.
- The app remains usable on computers where the optional visual models fail to load.
- The GitHub Pages build contains index.html and loads all model and WASM assets from
  the repository base path.

Start by reporting the current pipeline and benchmark plan. Then implement and validate
the improvement without changing unrelated product behavior.
```

## License

[MIT](LICENSE)
