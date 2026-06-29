FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm

FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/reader/package.json ./apps/reader/
RUN pnpm install --frozen-lockfile --filter=@midcine/reader...

FROM base AS builder
WORKDIR /repo
COPY --from=deps /repo ./
COPY apps/reader ./apps/reader
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @midcine/reader build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /repo/apps/reader/.next/standalone ./
COPY --from=builder /repo/apps/reader/.next/static ./apps/reader/.next/static
COPY --from=builder /repo/apps/reader/public ./apps/reader/public
USER nextjs
EXPOSE 3002
ENV PORT=3002 HOSTNAME=0.0.0.0
CMD ["node", "apps/reader/server.js"]
