# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/dashboard/package.json apps/dashboard/
RUN npm ci
COPY packages/engine packages/engine
COPY apps/server apps/server
RUN npm run build -w @sentinelx/server

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/dashboard/package.json apps/dashboard/
RUN npm ci --omit=dev --workspace @sentinelx/server --include-workspace-root=false
COPY --from=build /app/apps/server/dist apps/server/dist
COPY sandbox sandbox
COPY playbooks playbooks
EXPOSE 4000
CMD ["node", "apps/server/dist/index.js"]
