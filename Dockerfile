# Build frontend
FROM node:25-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Build server
FROM node:25-alpine AS server-builder
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src/ ./src/
RUN npm run build

# Production image
FROM node:25-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=server-builder /app/dist ./dist
COPY server/src/shared/skills ./dist/shared/skills
COPY server/src/shared/browser-profiles ./dist/shared/browser-profiles
COPY --from=frontend-builder /frontend/dist ./public
EXPOSE 8000
CMD ["node", "dist/index.js"]
