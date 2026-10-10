# Repository Guidelines

## Project Structure & Module Organization

- `app/page.tsx` contains the calendar and dialogs; `app/layout.tsx` defines metadata, and `app/globals.css` defines styles.
- `app/api/bookings/route.ts` handles reads, creation, cancellation, validation, and throttling.
- `app/lib/booking-rules.ts` holds shared date, name, and cancellation-code rules; `app/lib/sqlite.ts` manages persistence.
- `tests/` contains rule tests and local API checks. `vendor/` contains vendored CSS; `deploy/` contains Linux release scripts, systemd, and Nginx configuration.
- `data/bookings.sqlite` and `.next/` hold runtime data and build output; both are Git-ignored.

## Build, Test, and Development Commands

Use Node.js **22.13.0 or newer**.

- `npm ci`: install locked dependencies.
- `npm run dev`: start development at `http://127.0.0.1:3100`.
- `npm run build`: build production output with Webpack.
- `npm start`: serve production on the same loopback address.
- `npm test`: run rule, administrator-key, and browser-storage tests with Node's test runner and TypeScript stripping.
- `node tests/api-check.mjs http://127.0.0.1:3100`: check a running local API. Start it with `TRUST_PROXY=1` to exercise throttling; in PowerShell, use `$env:TRUST_PROXY='1'; npm start`.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, semicolons, and double quotes in application code. Preserve single quotes in tests. Use camelCase for functions and variables, PascalCase for types and components, and kebab-case utility filenames. Follow App Router filenames such as `page.tsx` and `route.ts`. No lint or formatter command is configured. Keep shell scripts in LF format per `.gitattributes`.

## Testing Guidelines

Use `node:test` and `node:assert/strict`; name rule tests `*.test.mjs` with behavior-focused descriptions. Add regression cases for changed validation, Shanghai time boundaries, and cancellation behavior. API checks cover conflicts, secret privacy, rebooking, origin validation, and throttling. Run them against a disposable local database: they create and delete bookings. No coverage threshold is configured. For code changes, run relevant tests and the production build; manually check affected dialogs and mobile layouts.

## Commit & Pull Request Guidelines

Git history uses imperative subjects, such as `Keep Linux deployment scripts in LF format`. Follow that style. PRs should explain behavior changes, link issues, list validation results, and include screenshots for UI changes. Document configuration or deployment changes in `README.md`.

## Security & Configuration

Preserve the 13 hourly slots from 08:00–21:00 Shanghai time and uniqueness per date and slot. Store cancellation digests server-side; never expose secrets in public responses or logs. Configure `DATABASE_PATH`, `PUBLIC_ORIGIN`, and `TRUST_PROXY` deliberately. Trust proxy headers only behind a proxy that overwrites them. Keep secrets and databases out of Git, preserve production data during releases, and use SQLite's backup API for WAL databases.
