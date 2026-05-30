FROM node:18-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy source
COPY src/ ./src/
COPY templates/ ./templates/

# Create logs directory
RUN mkdir -p logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

EXPOSE 3000

CMD ["node", "src/proxy/server.js"]
