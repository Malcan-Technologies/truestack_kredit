# syntax=docker/dockerfile:1

# Node 24 ships with npm 11 built-in. Required because package-lock.json is
# generated with npm >=11; older npm (e.g. 10.9.x in node:22-alpine) rejects
# the lockfile with "Missing: <pkg> from lock file" during `npm ci`, and the
# 10 -> 11 self-upgrade is itself broken ("Cannot find module 'promise-retry'").
FROM node:24-alpine AS base
WORKDIR /app

# Prisma engines on Alpine expect OpenSSL (matches borrower_pro image).
RUN apk add --no-cache openssl

FROM base AS deps

# Copy workspace manifests first for better layer caching.
# Include every npm workspace package.json so `npm ci` matches package-lock.json.
COPY package.json package-lock.json ./
COPY apps/admin/package.json ./apps/admin/
COPY apps/admin_pro/package.json ./apps/admin_pro/
COPY apps/backend/package.json ./apps/backend/
COPY apps/backend_pro/package.json ./apps/backend_pro/
COPY apps/signing-gateway/package.json ./apps/signing-gateway/
COPY apps/borrower_pro/Demo_Client/package.json ./apps/borrower_pro/Demo_Client/
COPY apps/borrower_pro/Proficient_Premium/package.json ./apps/borrower_pro/Proficient_Premium/
COPY apps/borrower_pro_mobile/Demo_Client/package.json ./apps/borrower_pro_mobile/Demo_Client/
COPY packages/shared/package.json ./packages/shared/
COPY packages/borrower/package.json ./packages/borrower/

RUN test -s package-lock.json \
  && node -e "const l=require('./package-lock.json'); if (l.lockfileVersion == null) throw new Error('Invalid package-lock.json');"

RUN npm ci

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY . .

WORKDIR /app/apps/admin_pro

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=http://localhost:4001
ARG NEXT_PUBLIC_APP_URL=http://localhost:3005
ARG BACKEND_URL=http://localhost:4001
ARG NEXT_PUBLIC_PRODUCT_MODE=pro
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV BACKEND_URL=${BACKEND_URL}
ENV NEXT_PUBLIC_PRODUCT_MODE=${NEXT_PUBLIC_PRODUCT_MODE}

# Prisma client: generated via package.json prebuild before next build.
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3005
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

COPY --from=builder --chown=nodejs:nodejs /app/packages/shared /app/packages/shared
COPY --from=builder --chown=nodejs:nodejs /app/apps/admin_pro/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/apps/admin_pro/.next/static ./apps/admin_pro/.next/static
COPY --from=builder --chown=nodejs:nodejs /app/apps/admin_pro/public ./apps/admin_pro/public

USER nodejs

EXPOSE 3005

CMD ["node", "apps/admin_pro/server.js"]
