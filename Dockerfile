# ─── Build the SPA ───────────────────────────────────────────────────────────
FROM node:22-alpine AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN npm ci --omit=dev --workspace=@devdeck/server --include-workspace-root || npm ci
COPY web ./web
RUN npm run build -w web

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    DATABASE_URL=/data/devdeck.db
WORKDIR /app

# git is required by the command runner; openssl for secret generation helpers.
RUN apk add --no-cache git tini

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN npm ci --omit=dev --workspace=@devdeck/server --include-workspace-root

COPY server ./server
COPY --from=web-build /app/web/dist ./web/dist

RUN mkdir -p /data && chown -R node:node /app /data
USER node

EXPOSE 4000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/src/index.js"]
