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
    chown -R node:node /app/server/data /app/logs && \
    chmod +x scripts/start.sh

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

CMD ["./scripts/start.sh"]
