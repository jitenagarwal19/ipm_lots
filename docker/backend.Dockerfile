# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci && npm cache clean --force

COPY backend/ ./
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]
