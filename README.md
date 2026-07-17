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

## Optional: use Claude or GPT in a private local fork

The public VRC Recap is made for VRChat users who do not want their screenshots sent to this project's server, so the hosted version deliberately uses browser-local models only.

If you want more accurate analysis of your own photo library, you can fork this repository and ask Claude Code or Codex to build a private version that runs only on your computer and optionally uses a Claude or GPT vision model. That optional mode may send the photos you select to the AI provider you configure, so use it only with your own photos, review that provider's data policy, and keep the fork private. Please do not deploy it as a service that uploads, stores, or collects other people's photos.

You can start with this prompt:

```text
You are adapting the VRC Recap repository for my private, local-only use.

Context:
The public project intentionally uses browser-local MediaPipe models so it never sends
VRChat users' screenshots to the project's server. I want an optional, more accurate
analysis mode for my own photos using a Claude or GPT multimodal model.

Goal:
Improve recurring-avatar identity, exact two-person memory detection, scene clustering,
and representative-photo selection by using the AI provider that I explicitly configure.
Keep the existing browser-local analysis as the default and fallback.

Privacy and safety requirements:
- This fork is a private tool that runs only on my computer. Do not turn it into a hosted
  website, public API, upload service, photo collector, or multi-user application.
- Process only photos that I select and own or have permission to use. Never collect,
  crawl, retain, or transmit another person's photo library.
- Do not add telemetry, analytics containing photo data, cloud storage, remote logging,
  training-data collection, or background uploads.
- Before sending any photo to Claude or GPT, clearly disclose which provider will receive
  it and require an explicit opt-in. Send only what is needed for the requested analysis.
- Do not persist photos, derived embeddings, model responses, or metadata after the local
  analysis session. Never commit personal screenshots, API keys, or analysis output.
- Keep provider credentials in a gitignored local environment file. If a local helper
  server is required, bind it to 127.0.0.1 and do not expose it to the network.

Product rules to preserve:
- Embedded VRChat metadata is the source of truth when available. Keep original world
  names and nicknames unchanged in results.
- The nickname appearing most often in metadata represents the user.
- A special person must appear alone with the user across multiple different calendar
  days. Same-day bursts count once, and group photos never count as two-person memories.
- Prefer photos where the user's avatar is alone, large, and near the center for cover,
  timeline, place, peak-period, and summary representatives.
- Keep Korean, English, and Japanese support, and keep implementation details out of the
  user-facing recap.

Start by explaining what data would leave the computer in the proposed design and how
explicit consent, local-only access, temporary processing, and cleanup will be enforced.
Then implement the smallest private-use change and validate it without changing unrelated
product behavior.
```

## License

[MIT](LICENSE)
