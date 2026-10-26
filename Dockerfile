# One Dockerfile, two targets: `api` (FastAPI, Tesseract) and `web` (Next.js production build).
# docker-compose.yml builds both. The committed demo pack in data/ is baked into each image.

FROM python:3.12-slim AS api
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/app/.venv
COPY pyproject.toml uv.lock ./
COPY apps/api apps/api
COPY packages/extract packages/extract
COPY packages/synth/ddr packages/synth/ddr
RUN uv sync --frozen --all-packages --no-dev
COPY data data
ENV WELLS_DATA_DIR=/app/data/demo PATH=/app/.venv/bin:$PATH
EXPOSE 8121
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8121/health')"
CMD ["uvicorn", "wells_api.main:app", "--host", "0.0.0.0", "--port", "8121"]

FROM node:22-slim AS web
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# NEXT_PUBLIC_* values are inlined into the browser bundle, so they are build arguments.
ARG NEXT_PUBLIC_API_URL=http://localhost:8121
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
ENV NODE_ENV=production WELLS_DATA_DIR=/app/data/demo WEB_PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "scripts/serve-web.mjs"]
