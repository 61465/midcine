# Multi-stage Dockerfile for Next.js 15 standalone build
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm

# ─── deps stage ─────────────────────────────────────────────
FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/worklist/package.json ./apps/worklist/
RUN pnpm install --frozen-lockfile --filter=@midcine/worklist...

# ─── builder stage ──────────────────────────────────────────
FROM base AS builder
WORKDIR /repo
COPY --from=deps /repo ./
COPY apps/worklist ./apps/worklist
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @midcine/worklist build

# ─── runtime stage ──────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /repo/apps/worklist/.next/standalone ./
COPY --from=builder /repo/apps/worklist/.next/static ./apps/worklist/.next/static
COPY --from=builder /repo/apps/worklist/public ./apps/worklist/public

USER nextjs
EXPOSE 3001
ENV PORT=3001 HOSTNAME=0.0.0.0
CMD ["node", "apps/worklist/server.js"]
