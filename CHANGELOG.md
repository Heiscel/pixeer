# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Placeholder for upcoming changes.

## [0.0.2] - 2026-04-25

### Added
- Added transport support for `postMessage`, `BroadcastChannel`, and WebSocket, plus corresponding caller APIs.
- Added optional multi-tab addon package `@pixeer/server` with registry abstractions and WebSocket transport.
- Added monorepo package set for framework adapters:
  - `@pixeer/vercel-ai`
  - `@pixeer/react`
  - `@pixeer/mastra`
  - `@pixeer/langchain`
  - `@pixeer/transformers`
- Added WebMCP bridge support through `createWebMCPBridge()` with graceful capability fallback.
- Added mutation delta pipeline (`dom.getDelta`, `dom.subscribe`) and ref tracking primitives.
- Added demo app package with in-memory transport pair and spotlight-agent UX.

### Changed
- Migrated repository to `pnpm` workspaces and Turborepo task orchestration.
- Moved core package into `packages/pixeer`.
- Switched build tooling from `tsup` to `tsdown` across packages.
- Expanded README with transport quickstarts, adapter usage, and WebMCP docs.

### Fixed
- Strengthened test coverage across agent, bridge, DOM service, transports, analytics, and mutation tracking.
- Improved CI reliability with workspace type-check, test coverage, and build jobs.

## [0.0.1] - 2026-04-25

### Added
- Initial release of `pixeer` core runtime:
  - DOM context extraction and interactive element discovery.
  - Agent actions (`click`, `type`, `scroll`, `pressKey`) and screen capture support.
  - Transport-agnostic bridge architecture and LiveKit integration.
