# Build from repository path: local-first/ (parent of server/)
# Example: docker build -f server/Dockerfile -t digikot-server:1.0.0 .

FROM node:20-alpine AS deps

WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY server/package.json server/package-lock.json ./
COPY server/ ./
COPY db/ /db/

COPY server/scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN chown -R nodejs:nodejs /app /db

USER nodejs

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
