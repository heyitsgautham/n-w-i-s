# Contributing

## Set up

Install Node 22 or later, pnpm 10, [uv](https://docs.astral.sh/uv/) and Tesseract, then run `make setup`.
`make demo` renders the demo pack and starts the app on :3000 with the API on :8121.

## Before you push

Run `make check`.
It runs the same typecheck, lint, tests and production build as CI.

| Command | What it checks |
|---|---|
| `pnpm typecheck` | `tsc` over correlate, synth, recording and the web app |
| `pnpm lint` | ESLint on the web app, `ruff check` and `ruff format --check` on the Python |
| `pnpm test` | vitest, then pytest with coverage |
| `pnpm test:cov` | vitest with coverage floors set in `vitest.config.ts` |
| `pnpm build` | the Next.js production build |

`uv run ruff format .` fixes Python formatting.

## Where a change goes

| Change | Package | Tests next to it |
|---|---|---|
| Tie, re-tie, time to hazard, recommendation, analogues, briefing text | `packages/correlate` | `src/*.test.ts` |
| The seeded field, drilling histories, daily report content | `packages/synth` | `src/*.test.ts` |
| PDF rendering of the reports | `packages/synth/ddr` | `tests/` |
| Report parsing, OCR, hazard rules, Volve | `packages/extract` | `tests/` |
| HTTP routes, search, briefing PDF export | `apps/api` | `tests/` |
| Screens | `apps/web` | `src/lib/*.test.ts` for the pure logic |

A change to `packages/synth` changes the demo pack.
`packages/synth/src/pack.test.ts` compares the generated pack with the committed `data/demo/field.json` and `reports.json`, so run `make data` and commit the regenerated files with the change.

## Commits

Land each fix or feature in its own commit, with the test that proves it.
Write the subject as `type(scope): what it does`, for example `fix(search): read the longest event phrase first in parse_query`.

## Data

The field and wells are synthetic.
[docs/synthetic-data.md](docs/synthetic-data.md) says what is real and what is not, so keep it true when you change the generator.
Never commit a `.env` file or a Maps key.
