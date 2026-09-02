# syntax=docker/dockerfile:1.7
#
# ABACUS IN A CONTAINER
# =====================
#
# Three stages, so that the image that runs holds only what running needs:
#
#   deps     every dependency, for the build
#   build    the SvelteKit build — `node build` output plus the migrations
#   runtime  production dependencies, the build, a non-root user
#
# The origin is a BUILD argument, not a runtime variable: SvelteKit bakes
# `paths.origin` into the server (see `vite.config.ts`), and the passkey
# relying-party id is derived from it. Build one image per origin.
#
#   docker build --build-arg PUBLIC_ORIGIN=https://abacus.example.com -t abacus .
#   docker run -e SESSION_SECRET=… -e DATABASE_URL=file:/data/abacus.db \
#              -v abacus-data:/data -p 3000:3000 abacus

ARG NODE_VERSION=24.20.0

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app

# pnpm through corepack, pinned by `packageManager` in package.json.
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# The lockfile is the contract: `--frozen-lockfile` fails the build if it
# disagrees with package.json instead of silently resolving something newer.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
FROM deps AS build
ARG PUBLIC_ORIGIN
ENV PUBLIC_ORIGIN=${PUBLIC_ORIGIN}
# The build needs *a* value for every variable in `src/env.ts`; these two are
# never read at build time and never make it into the image.
ENV DATABASE_URL=file:build-time-unused.db
ENV SESSION_SECRET=build-time-only-value-that-is-never-used-at-runtime

COPY . .
RUN test -n "$PUBLIC_ORIGIN" || (echo "PUBLIC_ORIGIN build argument is required" && exit 1)
RUN pnpm run build

# Production dependencies only, for the runtime stage. `--prod` drops
# everything under devDependencies: the compiler, the test runners, drizzle-kit.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm prune --prod

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# The `node` user ships with the base image. Nothing here needs root, so
# nothing here runs as root.
RUN mkdir -p /data && chown node:node /data
USER node

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/scripts/migrate.ts ./scripts/migrate.ts

# adapter-node reads these. `HOST=0.0.0.0` so the container's port is
# reachable; a graceful shutdown that outlasts the orchestrator's grace period
# is a SIGKILL anyway, so it is shorter than the default of thirty seconds.
ENV HOST=0.0.0.0
ENV PORT=3000
ENV SHUTDOWN_TIMEOUT=10
ENV BODY_SIZE_LIMIT=8M
ENV DATABASE_URL=file:/data/abacus.db

VOLUME ["/data"]
EXPOSE 3000

# The same question a load balancer asks, so `docker ps` shows the truth.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# SIGTERM is what adapter-node listens for; it stops accepting connections,
# lets in-flight requests finish, and exits. `node` is PID 1 so it receives
# the signal directly — no shell in between to swallow it.
STOPSIGNAL SIGTERM

# Migrate, then serve, in one process: `--import` runs the migration module to
# completion before the server's entry point starts listening.
CMD ["node", "--import", "./scripts/migrate.ts", "build"]
