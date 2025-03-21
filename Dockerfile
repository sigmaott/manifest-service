FROM node:18.19.0 as builder

# Set environment variables for Node
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV YARN_CACHE_FOLDER=/usr/src/app/.yarn-cache

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
FROM node:18.19.0 as installer

WORKDIR /usr/src/app
COPY ./package.json .
COPY ./yarn.lock .

ENV YARN_CACHE_FOLDER=/usr/src/app/.yarn-cache
RUN mkdir -p $YARN_CACHE_FOLDER && \
    yarn config set network-timeout 300000 && \
    yarn install --prod --frozen-lockfile --network-concurrency 1

####################
FROM node:18.19.0

WORKDIR /usr/src/app

# Copy built assets and production dependencies
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=installer /usr/src/app/node_modules ./node_modules
COPY package.json .
COPY config ./config

# Set environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Expose port
EXPOSE 3000

# Start the server using node directly
CMD ["node", "--trace-warnings", "--dns-result-order=ipv4first", "dist/main"]