# -- build stage --
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# -- runtime stage --
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/tsconfig*.json ./
RUN pnpm install --frozen-lockfile --prod
EXPOSE 3003
CMD ["pnpm", "start"]
