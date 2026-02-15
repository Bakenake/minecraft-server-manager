# ─── Stage 1: Build ───────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root
COPY package.json package-lock.json* ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

# Install all deps
RUN npm ci

# Copy source
COPY backend/ backend/
COPY frontend/ frontend/

# Build backend
RUN cd backend && npx tsc --project tsconfig.json

# Build frontend
RUN cd frontend && npx vite build

# ─── Stage 2: Production ─────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache tini

WORKDIR /app

# Copy backend build + deps
COPY --from=builder /app/backend/package.json ./
COPY --from=builder /app/backend/dist/ ./dist/

# Install production dependencies only
RUN npm install --production --ignore-scripts && npm cache clean --force

# Copy frontend static assets
COPY --from=builder /app/frontend/dist/ ./public/

# Copy env example
COPY .env.example .env.example

# Create data directories
RUN mkdir -p data logs servers backups

# Environment
ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data
ENV SERVERS_DIR=/app/servers
ENV BACKUPS_DIR=/app/backups
ENV LOGS_DIR=/app/logs
ENV STATIC_DIR=/app/public

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
