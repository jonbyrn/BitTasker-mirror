FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
RUN npm config set fetch-retry-maxtimeout 600000 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-timeout 600000

COPY package*.json ./
COPY scripts ./scripts
RUN npm install --legacy-peer-deps --no-audit --progress=false

COPY . .
RUN npm run build
RUN cd bittasker-nestjs && npm install --legacy-peer-deps && npx prisma generate && npm run build && cp -r dist /app/dist

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

EXPOSE 8000
CMD ["node", "dist/main"]

