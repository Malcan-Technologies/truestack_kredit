# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

# Prisma needs OpenSSL in Alpine images.
RUN apk add --no-cache openssl

# package-lock.json is generated with npm >=11 on dev machines.
# node:22-alpine ships with npm 10.9.x which can't read the newer lockfile
# entries (e.g. `*--for-generate-function-map`), causing `npm ci` to fail
# with "Missing: <pkg> from lock file". Pin npm to the lockfile-compatible
# version.
RUN npm install -g npm@11

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

ARG BORROWER_APP=Demo_Client

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
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
