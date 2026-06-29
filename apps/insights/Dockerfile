FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable pnpm

FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/insights/package.json ./apps/insights/
RUN pnpm install --frozen-lockfile --filter=@midcine/insights...

FROM base AS builder
WORKDIR /repo
COPY --from=deps /repo ./
COPY apps/insights ./apps/insights
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @midcine/insights build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 nextjs
COPY --from=builder /repo/apps/insights/.next/standalone ./
COPY --from=builder /repo/apps/insights/.next/static ./apps/insights/.next/static
USER nextjs
EXPOSE 3004
ENV PORT=3004 HOSTNAME=0.0.0.0
CMD ["node", "apps/insights/server.js"]
