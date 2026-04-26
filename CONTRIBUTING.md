# Contributing to Pixeer

Thanks for your interest in contributing. This guide keeps contributions consistent, reviewable, and release-ready.

## Prerequisites

- Node.js 18+ (Node 22 recommended to match CI)
- `pnpm` 10+

## Setup

```bash
pnpm install
```

## Workspace commands

Run these from the repository root:

```bash
pnpm dev
pnpm build
pnpm type-check
pnpm test
pnpm test:coverage
pnpm clean
```

## Repository structure

- `packages/pixeer`: core runtime and transports
- `packages/server`: optional multi-tab coordination server
- `packages/react`: React hooks
- `packages/vercel-ai`: Vercel AI SDK tools
- `packages/mastra`: Mastra adapter
- `packages/langchain`: LangChain adapter
- `packages/transformers`: local model runner adapter
- `packages/demo`: demo application

## Branches and pull requests

1. Branch from `main`.
2. Keep PRs focused on a single concern.
3. Add or update tests for behavioral changes.
4. Ensure all checks pass locally before opening PR.

Suggested pre-PR check:

```bash
pnpm type-check && pnpm test && pnpm build
```

## Testing guidance

- Prefer unit tests close to changed code.
- For core runtime behavior, extend tests under `packages/pixeer/src/__tests__`.
- For server behavior, extend tests under `packages/server/src/__tests__`.

## Changelog policy

- Update `CHANGELOG.md` for user-facing changes.
- Add new entries under `## [Unreleased]` using one of:
  - Added
  - Changed
  - Fixed
  - Removed

## Commit message guidance

Use short imperative commit messages that describe intent:

- `add websocket caller timeout option`
- `fix postmessage origin validation`
- `update webmcp bridge docs`

## Reporting issues

When opening an issue, include:

- Expected behavior
- Actual behavior
- Minimal reproduction steps
- Environment (OS, browser, Node version, package versions)

## Code of conduct

Be respectful, constructive, and collaborative in all project interactions.
