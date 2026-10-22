FROM node:22-bookworm-slim
WORKDIR /app
COPY src/lib/search ./src/lib/search
COPY src/lib/qvac/embed.js src/lib/qvac/gate.js ./src/lib/qvac/
COPY scripts/typesense-indexer.mjs scripts/typesense-keys.mjs scripts/typesense-health.mjs scripts/typesense-env.mjs ./scripts/
CMD ["node", "scripts/typesense-indexer.mjs"]
