# syntax=docker/dockerfile:1

# ---- Stage 1: build ---------------------------------------------------------
# Astro 7 requires Node >= 22.12. Build needs devDependencies (astro, vite,
# typescript), so the build runs in its own stage and only the built output
# plus production dependencies are copied forward.
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Drop devDependencies from node_modules so the runtime stage can reuse it.
RUN npm prune --omit=dev

# ---- Stage 2: runtime ------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

# curl is used by the container HEALTHCHECK below.
RUN apk add --no-cache curl

# Run as a non-root user. node:alpine already ships uid/gid 1000 as `node`.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/package*.json ./

RUN mkdir -p /app/server/data /app/logs && \
    chown -R node:node /app/server/data /app/logs

USER node

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080
ENV FRONTEND_PORT=8080
ENV BACKEND_PORT=3001

# Use /health, NOT /api/health/live.
#
# Everything under /api/health except the index goes through
# requireHealthAccess, which returns 404 in production unless
# ENABLE_DETAILED_HEALTH=true. /api/health/live therefore fails here and, more
# importantly, would fail an ALB target-group health check on ECS -- every task
# would be marked unhealthy and the service would never stabilise.
#
# /health is served directly by server/index.js, is ungated, does no database
# work, and always returns 200.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run node directly rather than through scripts/start.sh.
#
# start.sh is a shell process-supervisor: it backgrounds node, restarts it up
# to MAX_RESTARTS times, and polls /health itself. Under an orchestrator all of
# that is redundant and actively harmful -- ECS restarts unhealthy tasks and
# the ALB does the health checking, while the supervisor keeps the container
# "running" through a crash loop so ECS never replaces it, and leaves the shell
# as PID 1 instead of node.
#
# Everything start.sh set up is covered: NODE_ENV/PORT/FRONTEND_PORT/
# BACKEND_PORT are ENV above, the data and log directories are created above,
# and its SQLite init branch is dead in production, which uses DynamoDB.
#
# server/index.js:153-154 traps SIGTERM and SIGINT for graceful shutdown, so
# node is safe as PID 1 and ECS task draining works.
CMD ["node", "server/index.js"]
