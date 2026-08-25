# Multi-stage build — runs `next build` inside a slim node image
# and copies only the standalone bundle to a minimal runtime.

# ---- Builder ----
FROM node:20-alpine AS builder
WORKDIR /repo

# Copy the workspace so pnpm/yarn workspaces resolve
COPY package.json pnpm-workspace.yaml* pnpm-lock.yaml* yarn.lock* package-lock.json* ./
COPY tsconfig.base.json turbo.json ./
COPY apps ./apps
COPY packages ./packages

# Install
RUN corepack enable && \
    (pnpm --version && pnpm install --frozen-lockfile) || \
    (yarn --version && yarn install --frozen-lockfile) || \
    npm install

# Build only the web app
RUN cd apps/web && \
    (pnpm run build || yarn build || npm run build)

# ---- Runtime ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy the standalone Next.js output (needs `output: 'standalone'` in next.config)
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
