# VRC Recap

[Live site](https://nupa.moe/vrc-recap/)

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

## License

[MIT](LICENSE)
