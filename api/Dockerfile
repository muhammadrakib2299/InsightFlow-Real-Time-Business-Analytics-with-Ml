# syntax=docker/dockerfile:1.7

# -------- base --------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# -------- deps (with dev) --------
FROM base AS deps
COPY package.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund

# -------- dev stage (used by docker-compose.dev.yml) --------
FROM deps AS dev
ENV NODE_ENV=development
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
EXPOSE 4000
CMD ["npm", "run", "start:dev"]

# -------- build --------
FROM deps AS build
ENV NODE_ENV=production
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

# -------- runtime --------
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl wget tini && \
    addgroup -S app && adduser -S app -G app
# The Prisma CLI is a dev dependency, so the prune above removes it. Install
# it here so the container can apply migrations before the API starts.
RUN npm install -g prisma@5.22.0
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
USER app
EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "prisma migrate deploy && exec node dist/main.js"]
