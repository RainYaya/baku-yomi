# Contributing to baku-yomi

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/baku-yomi.git
cd baku-yomi
pnpm install
pnpm dev
```

This starts both the Vite dev server (port 5174) and the Hono API server (port 3003).

## Project Structure

```
src/
  components/     # React components (reader, bookshelf, settings, layout)
  hooks/          # Custom React hooks
  lib/            # Core logic (AI client, EPUB parsing, TTS)
  stores/         # Zustand state stores
  theme/          # Theme system (provider, overlays, canvas effects)
  types/          # TypeScript type definitions
server/
  index.ts        # Hono server entry point
  routes/         # API routes
  tts/            # TTS provider abstraction (Microsoft, VOICEVOX)
docs/             # Documentation
```

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): add new feature
fix(scope): fix a bug
chore: maintenance tasks
docs: documentation changes
style: formatting, no logic change
refactor: code restructuring
```

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes with clear commit messages
3. Ensure `pnpm build` passes without errors
4. Open a PR with a description of what changed and why

## Code Style

- TypeScript strict mode
- Functional React components with hooks
- Zustand for state management
- CSS custom properties for theming (no CSS-in-JS)
- Prefer CSS classes in `index.css` over inline styles for reusable patterns

## Reporting Issues

Please include:
- Steps to reproduce
- Expected vs actual behavior
- Browser and OS version
- Console errors (if any)
