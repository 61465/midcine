FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable pnpm

FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/patient/package.json ./apps/patient/
RUN pnpm install --frozen-lockfile --filter=@midcine/patient...

FROM base AS builder
WORKDIR /repo
COPY --from=deps /repo ./
COPY apps/patient ./apps/patient
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @midcine/patient build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 nextjs
COPY --from=builder /repo/apps/patient/.next/standalone ./
COPY --from=builder /repo/apps/patient/.next/static ./apps/patient/.next/static
USER nextjs
EXPOSE 3003
ENV PORT=3003 HOSTNAME=0.0.0.0
CMD ["node", "apps/patient/server.js"]
