# Cavite Smart Transport Terminal: the web app (Next.js, Node runtime) and its workers (Bun) in one image.
# Used by docker-compose.demo.yml; see plan/docker-local.md.
FROM node:22-bookworm-slim

# Bun runs the scripts and workers; Next.js itself runs on Node.
RUN npm install -g bun@1.3 && apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
EXPOSE 3000
CMD ["bun", "run", "start"]
