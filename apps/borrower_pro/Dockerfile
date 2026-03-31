# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

# Prisma needs OpenSSL in Alpine images.
RUN apk add --no-cache openssl

FROM base AS deps

ARG BORROWER_APP=Demo_Client

# Copy workspace manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY apps/admin/package.json ./apps/admin/
COPY apps/backend/package.json ./apps/backend/
COPY apps/admin_pro/package.json ./apps/admin_pro/
COPY apps/borrower_pro/${BORROWER_APP}/package.json ./apps/borrower_pro/${BORROWER_APP}/
COPY apps/backend_pro/package.json ./apps/backend_pro/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

FROM base AS builder

ARG BORROWER_APP=Demo_Client

COPY --from=deps /app/node_modules ./node_modules
COPY . .

WORKDIR /app/apps/borrower_pro/${BORROWER_APP}

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_APP_URL=http://localhost:3006
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:4001
ARG BACKEND_URL=http://localhost:4001
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL}
ENV BACKEND_URL=${BACKEND_URL}

# Prisma client: generated via package.json prebuild before next build.
RUN npm run build

FROM base AS runner
WORKDIR /app

ARG BORROWER_APP=Demo_Client
ENV BORROWER_APP=${BORROWER_APP}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

COPY --from=builder --chown=nodejs:nodejs /app/apps/borrower_pro/${BORROWER_APP}/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/apps/borrower_pro/${BORROWER_APP}/.next/static ./apps/borrower_pro/${BORROWER_APP}/.next/static
COPY --from=builder --chown=nodejs:nodejs /app/apps/borrower_pro/${BORROWER_APP}/public ./apps/borrower_pro/${BORROWER_APP}/public

USER nodejs

EXPOSE 3000

CMD ["sh", "-c", "node apps/borrower_pro/${BORROWER_APP}/server.js"]
