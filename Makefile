# N-W-I-S. `make demo` sets up, builds the demo pack if needed, and runs the app.

.PHONY: setup data demo dev test lint typecheck build check film shots

setup:
	pnpm install
	uv sync --all-packages

# Generator -> DDR PDFs -> parser. Deterministic from seed 26121.
data:
	pnpm synth
	uv run python -m wells_ddr.render
	uv run python -m wells_extract.run

demo: setup
	@test -d data/demo/ddr/KN-101 || $(MAKE) data
	pnpm dev

dev:
	pnpm dev

test:
	pnpm test

lint:
	pnpm lint

typecheck:
	pnpm typecheck
	uv run mypy

build:
	pnpm build

check: typecheck lint test build

# With `make dev` running in another terminal.
film:
	pnpm film

shots:
	pnpm shots
