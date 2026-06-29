FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable pnpm

FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/connect/package.json ./apps/connect/
RUN pnpm install --frozen-lockfile --filter=@midcine/connect...

FROM base AS builder
WORKDIR /repo
COPY --from=deps /repo ./
COPY apps/connect ./apps/connect
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @midcine/connect build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 nextjs
COPY --from=builder /repo/apps/connect/.next/standalone ./
COPY --from=builder /repo/apps/connect/.next/static ./apps/connect/.next/static
USER nextjs
EXPOSE 3005
ENV PORT=3005 HOSTNAME=0.0.0.0
CMD ["node", "apps/connect/server.js"]
