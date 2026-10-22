# Pin Node.js 22.23.4 (Oct 21, 2026 security release). Do not float the 22 tag.
FROM node:22.23.4-alpine AS builder

# Install build dependencies and increase memory limits
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Set npm configuration for better performance
RUN npm config set fetch-retry-maxtimeout 600000 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-timeout 600000

# Copy package files
COPY package*.json ./

# Install dependencies using npm ci for faster, reliable builds
# Split into chunks to avoid timeouts and enable better caching
RUN npm ci --prefer-offline --no-audit --progress=false --maxsockets=1

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22.23.4-alpine

WORKDIR /app

# Copy built assets from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npx", "serve", "-s", "build"]