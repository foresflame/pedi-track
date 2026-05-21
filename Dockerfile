# ── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# better-sqlite3 requires build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY public/ ./public/

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
      libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built app from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server       ./server
COPY --from=builder /app/public       ./public
COPY package.json ./

# SQLite volume mount point — fly.io will attach a persistent volume here
RUN mkdir -p /data/db

# Default env (overridden by fly.io secrets)
ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/db/peditrack.sqlite

EXPOSE 8080

CMD ["node", "server/index.js"]
