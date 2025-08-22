#!/bin/sh

# Production startup script for NFL Pick'em App
# This script runs both the Astro frontend and Express backend

set -e

echo "🚀 Starting NFL Pick'em Application..."

# Set production environment
export NODE_ENV=production

# Set default port for App Runner (AWS App Runner expects port 8080)
export PORT=${PORT:-8080}
export FRONTEND_PORT=${FRONTEND_PORT:-8080}
export BACKEND_PORT=${BACKEND_PORT:-3001}

# Set database path to persistent volume
export DATABASE_PATH=${DATABASE_PATH:-/app/data/database.sqlite}

# Create data directory if it doesn't exist
mkdir -p /app/data
mkdir -p /app/logs

# Initialize database if it doesn't exist
if [ ! -f "$DATABASE_PATH" ]; then
    echo "📊 Initializing database..."
    node /app/scripts/init-db.js
fi

# Start the unified server (backend serving frontend static files)
echo "🚀 Starting unified server on port $PORT..."
cd /app
PORT=$PORT node server/index.js &
SERVER_PID=$!

# Function to handle shutdown gracefully
shutdown() {
    echo "🛑 Shutting down server..."
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    echo "✅ Server stopped"
    exit 0
}

# Trap signals for graceful shutdown
trap shutdown SIGTERM SIGINT

# Wait for the server process to exit
wait $SERVER_PID