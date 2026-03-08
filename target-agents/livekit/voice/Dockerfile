# syntax=docker/dockerfile:1

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

RUN apt-get update -qq \
  && apt-get install --no-install-recommends -y \
    ca-certificates \
    libasound2 \
    libglib2.0-0 \
    libnss3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# No build step needed; run directly from source.

ARG UID=10001
RUN adduser \
  --disabled-password \
  --gecos "" \
  --home "/app" \
  --shell "/sbin/nologin" \
  --uid "${UID}" \
  appuser

RUN chown -R appuser:appuser /app
USER appuser

ENV NODE_ENV=production

CMD [ "npm", "run", "start" ]
