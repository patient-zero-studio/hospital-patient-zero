# Hospital — Patient Zero : image for an always-on host (Railway, Fly.io, Render, a VPS…)
FROM node:22-slim

WORKDIR /app

# Dependencies first (cached between deploys)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Game sources, then the production build of the client
COPY . .
RUN npx vite build

# Accounts, coins and the leaderboard live here: mount a persistent volume on /data
ENV PZ_DATA_DIR=/data
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npx", "tsx", "server/index.ts", "--prod"]
