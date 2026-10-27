# syntax=docker/dockerfile:1.7
# Multi-stage build for the 8 гар game server. Built ON the x86_64 host by deploy.sh;
# do not build from the arm64 Mac (QEMU emulation and a registry round-trip for nothing).

FROM node:24-bookworm-slim AS builder
WORKDIR /app
# Install every workspace's dependencies (dev included) for the TypeScript build.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY sites/eight-gar/package.json sites/eight-gar/
RUN npm ci --workspaces --include-workspace-root
# Sources: engine (root), server, and the static client.
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY server ./server
COPY sites/eight-gar ./sites/eight-gar
RUN npm run build:all

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY sites/eight-gar/package.json sites/eight-gar/
# Production dependencies only; the workspace symlink server -> root engine is recreated here.
RUN npm ci --omit=dev --workspaces --include-workspace-root && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/sites/eight-gar/dist ./sites/eight-gar/dist
# Reported by /healthz so a deploy can be matched to a commit.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
ENV PORT=4000
USER node
EXPOSE 4000
CMD ["node", "server/dist/main.js"]
