FROM node:22-alpine AS builder

WORKDIR /app
COPY apps/signing-gateway/package.json ./
RUN npm install
COPY apps/signing-gateway/tsconfig.json ./
COPY apps/signing-gateway/src ./src
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

RUN mkdir -p /data/documents /data/db

EXPOSE 3100

CMD ["node", "dist/index.js"]
