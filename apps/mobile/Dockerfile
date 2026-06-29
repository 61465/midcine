FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable pnpm

FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/mobile/package.json ./apps/mobile/
RUN pnpm install --frozen-lockfile --filter=@midcine/mobile...

FROM base AS builder
WORKDIR /repo
COPY --from=deps /repo ./
COPY apps/mobile ./apps/mobile
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @midcine/mobile build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 nextjs
COPY --from=builder /repo/apps/mobile/.next/standalone ./
COPY --from=builder /repo/apps/mobile/.next/static ./apps/mobile/.next/static
COPY --from=builder /repo/apps/mobile/public ./apps/mobile/public
USER nextjs
EXPOSE 3007
ENV PORT=3007 HOSTNAME=0.0.0.0
CMD ["node", "apps/mobile/server.js"]
