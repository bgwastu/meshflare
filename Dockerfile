# meshflare — portable Bun app with SQLite persistence

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json vite.config.ts index.html ./
COPY client ./client
COPY public ./public
COPY worker ./worker
COPY server ./server
RUN bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json bun.lock tsconfig.json ./
COPY worker ./worker
COPY server ./server
COPY drizzle ./drizzle

EXPOSE 3000
VOLUME ["/data"]
CMD ["bun", "run", "server/selfhost.ts"]
