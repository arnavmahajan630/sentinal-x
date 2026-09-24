# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/dashboard/package.json apps/dashboard/
RUN npm ci
COPY apps/dashboard apps/dashboard
RUN npm run build -w @sentinelx/dashboard

FROM nginx:1.27-alpine AS runtime
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/dashboard/dist /usr/share/nginx/html
EXPOSE 80
