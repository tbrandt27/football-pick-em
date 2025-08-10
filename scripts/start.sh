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

# Start the backend server in the background
echo "🔧 Starting backend server on port $BACKEND_PORT..."
node server/index.js &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start the frontend server
echo "🌐 Starting frontend server on port $FRONTEND_PORT..."
cd /app
HOST=0.0.0.0 PORT=$FRONTEND_PORT npm run preview &
FRONTEND_PID=$!

# Function to handle shutdown gracefully
shutdown() {
    echo "🛑 Shutting down services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    echo "✅ Services stopped"
    exit 0
}

# Trap signals for graceful shutdown
trap shutdown SIGTERM SIGINT

# Wait for either process to exit
wait $BACKEND_PID $FRONTEND_PID