# syntax=docker/dockerfile:1.7

# -------- base --------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# -------- deps --------
FROM base AS deps
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund

# -------- dev --------
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# -------- build --------
FROM deps AS build
ENV NODE_ENV=production
COPY . .
RUN npm run build

# -------- runtime --------
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache wget tini && addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER app
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
