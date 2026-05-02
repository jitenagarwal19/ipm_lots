# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci && npm cache clean --force

COPY frontend/ ./

ARG NEXT_PUBLIC_USE_BACKEND_PROXY=true
ENV NEXT_PUBLIC_USE_BACKEND_PROXY=${NEXT_PUBLIC_USE_BACKEND_PROXY}

ARG BACKEND_INTERNAL_URL=http://backend:4000
ENV BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL}

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
