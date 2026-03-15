# Sponsor Service Dockerfile
# Multi-stage build for optimized production image

FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY src/sponsor-service ./src/sponsor-service
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build || true

# Production image
FROM node:20-alpine

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/src/sponsor-service/db/schema.sql ./db/schema.sql

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error('Health check failed')})" || exit 1

# Expose port
EXPOSE 3001

# Start application
CMD ["node", "build/src/sponsor-service/index.js"]
