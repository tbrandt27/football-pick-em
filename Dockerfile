# Use Node.js 18 LTS Alpine for smaller image size and better security
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install curl for health checks (required by App Runner)
RUN apk add --no-cache curl

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install dependencies with npm ci for production builds
RUN npm ci --only=production && npm cache clean --force

# Copy the rest of the application code
COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p /app/data /app/logs /app/dist && \
    chown -R nextjs:nodejs /app

# Make startup script executable
RUN chmod +x scripts/start.sh

# Build the application
RUN npm run build

# Switch to non-root user
USER nextjs

# Expose the port that App Runner expects
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV FRONTEND_PORT=8080
ENV BACKEND_PORT=3001

# Health check for App Runner
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health/live || exit 1

# Use the startup script as the entry point
CMD ["./scripts/start.sh"]