# Sheaf

A local-first macOS Markdown editor for focused writing — split live preview, AI paragraph rewrite, and export to PDF & social.

Website: [sheaf.reaidea.com](https://sheaf.reaidea.com/) · Download: [Releases](https://github.com/ginuim/Sheaf/releases)

## Features

- **Split live preview** — Monospace editor and serif preview scroll together; split, edit-only, or preview-only views
- **Outline panel** — Auto-generated heading hierarchy with click-to-jump navigation
- **AI paragraph rewrite** — Describe edits in plain language, review the diff, apply in one click; version snapshots before each apply
- **Export** — PDF, WeChat article HTML, social share cards, and long images
- **Typography** — KaTeX math, Mermaid diagrams, syntax highlighting; automatic CJK spacing
- **Local first** — Documents and settings stay on your disk; no account, no cloud sync

## Tech Stack

| Layer | Stack |
|---|---|
| Desktop | [Tauri](https://tauri.app/) v2 |
| Frontend | Vue 3, TypeScript, Vite |
| Editor | CodeMirror 6 |
| Rendering | markdown-it, KaTeX, Mermaid |

## Requirements

- [Node.js](https://nodejs.org/) (LTS recommended)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/) (for desktop builds)

## Quick Start

```bash
pnpm install
```

### Desktop development

```bash
pnpm tauri dev
```

### Website development

```bash
pnpm dev:website
```

### Build

```bash
# Frontend (index.html + website.html)
pnpm build

# macOS installers
pnpm build:mac          # current architecture
pnpm build:mac:arm64    # Apple Silicon
pnpm build:mac:x64      # Intel
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Vite dev server for the desktop app (port 1420) |
| `pnpm dev:website` | Vite dev server for the landing page |
| `pnpm build` | Typecheck and build frontend |
| `pnpm preview` | Preview desktop build |
| `pnpm preview:website` | Preview website build |
| `pnpm tauri` | Tauri CLI (`dev` / `build`, etc.) |

## Project Layout

```
├── index.html          # Desktop app entry
├── website.html        # Landing page entry
├── src/
│   ├── main.ts         # Desktop app
│   └── website/        # Landing page, docs, changelog
├── src-tauri/          # Tauri Rust backend
├── scripts/
│   ├── collect-dmg.sh
│   ├── deploy-website.sh
│   └── nginx-sheaf.reaidea.com.conf.example
└── markra/             # Reference project (read-only)
```

## Release

Push a version tag to trigger the release workflow:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Or run **Release** manually from GitHub Actions with `tag_name=v0.1.0`.

The workflow builds and notarizes both `Sheaf-macos-arm64.dmg` and `Sheaf-macos-x64.dmg`, then publishes them to [GitHub Releases](https://github.com/ginuim/Sheaf/releases).

Required repository secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PRIVATE_KEY`.

## Website Deployment

```bash
bash scripts/deploy-website.sh
```

Nginx example: `scripts/nginx-sheaf.reaidea.com.conf.example`.

## Development Notes

- Use `pnpm` for package management
- Prefer `@lucide/vue` for icons
- `markra/` is a read-only reference project; implement changes in `src/` and `src-tauri/`
