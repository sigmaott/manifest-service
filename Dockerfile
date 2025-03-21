FROM node:18.19.0 as builder

# Set environment variables for Node
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV YARN_CACHE_FOLDER=/usr/src/app/.yarn-cache
ENV UV_THREADPOOL_SIZE=64
ENV NODE_ENV=production

# Create working dir
WORKDIR /usr/src/app

# Copy package files
COPY package.json .
COPY yarn.lock .

# Install dependencies with specific flags for stability
RUN mkdir -p $YARN_CACHE_FOLDER && \
    yarn config set network-timeout 300000 && \
    yarn install --frozen-lockfile --network-concurrency 1

# Copy source
COPY . .

# Build
RUN yarn build

################## 
FROM node:18.19.0-slim as installer

WORKDIR /usr/src/app
COPY ./package.json .
COPY ./yarn.lock .

ENV YARN_CACHE_FOLDER=/usr/src/app/.yarn-cache
ENV NODE_ENV=production
RUN mkdir -p $YARN_CACHE_FOLDER && \
    yarn config set network-timeout 300000 && \
    yarn install --prod --frozen-lockfile --network-concurrency 1

####################
FROM node:18.19.0-slim

WORKDIR /usr/src/app

# Copy built assets and production dependencies
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=installer /usr/src/app/node_modules ./node_modules
COPY package.json .
COPY config ./config

# Set environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV UV_THREADPOOL_SIZE=64

# Add tini for proper signal handling
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

# Use tini as entrypoint
ENTRYPOINT ["/usr/bin/tini", "--"]

# Start the application
CMD ["node", "--trace-warnings", "--dns-result-order=ipv4first", "dist/main"]