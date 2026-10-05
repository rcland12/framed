FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ffmpeg pulls frames from the library (zscale for HDR tone-mapping comes with Debian's build);
# sharp scores and encodes them.
FROM node:24-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends ca-certificates ffmpeg && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /data/frames && \
    chown node:node /app /data/frames

USER node
COPY --from=builder --chown=node:node /app/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder --chown=node:node /app/build ./build

EXPOSE 3000
# Sibling subdomains' cookies add up; Node's default 16 KB header limit can 431 on them.
CMD ["node", "--max-http-header-size=65536", "build"]
