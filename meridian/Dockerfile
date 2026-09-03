# syntax=docker/dockerfile:1.7
#
# MERIDIAN IN A CONTAINER
# =======================
#
# Three stages, so that the image that runs holds only what running needs:
#
#   deps     every dependency of both workspace packages, for the build
#   build    the library, the messages, the element, the SvelteKit build
#   runtime  production dependencies, the build, the migrations, a non-root user
#
# The origin is a BUILD argument, not a runtime variable: SvelteKit bakes
# `paths.origin` into the server (see `vite.config.ts`), and Better Auth's
# base URL comes from the same value. Build one image per origin.
#
#   docker build --build-arg PUBLIC_ORIGIN=https://meridian.example.com -t meridian .
#   docker run -e BETTER_AUTH_SECRET=… -e DATABASE_URL=file:/data/meridian.db \
#              -v meridian-data:/data -p 3000:3000 meridian

ARG NODE_VERSION=24.20.0

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app

# pnpm through corepack, pinned by `packageManager` in package.json.
RUN corepack enable

# A workspace install needs every package.json the lockfile mentions, so the
# library's manifest is copied beside the root's before `pnpm install`.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/waypoint/package.json packages/waypoint/
# The lockfile is the contract: `--frozen-lockfile` fails the build if it
# disagrees with package.json instead of silently resolving something newer.
# `--ignore-scripts` skips the root `prepare`, which would try to build the
# library before its source is here; the build stage runs those steps itself.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
FROM deps AS build
ARG PUBLIC_ORIGIN
ENV PUBLIC_ORIGIN=${PUBLIC_ORIGIN}
# The build needs *a* value for every variable in `src/env.ts`; these two are
# never read at build time and never make it into the image.
ENV DATABASE_URL=file:build-time-unused.db
ENV BETTER_AUTH_SECRET=build-time-only-value-that-is-never-used-at-runtime

COPY . .
RUN test -n "$PUBLIC_ORIGIN" || (echo "PUBLIC_ORIGIN build argument is required" && exit 1)

# What `prepare` does on a developer's machine, spelled out: the library,
# the messages, the generated types. Then the element and the app.
RUN pnpm run package && pnpm run i18n && pnpm exec svelte-kit sync && pnpm run build

# Production dependencies only, for the runtime stage. `--prod` drops
# everything under devDependencies: the compilers, the test runners, drizzle-kit.
# `CI=true` because pnpm 11 asks before it purges a modules directory and, with
# no terminal to ask on, aborts instead — the first CI run of this file found that.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    CI=true pnpm prune --prod --ignore-scripts

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
ENV DATABASE_URL=file:/data/meridian.db

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
