#!/bin/sh

# Production startup script for NFL Pick'em App with process monitoring
# This script runs the Express backend and includes monitoring capabilities

set -e

echo "🚀 Starting NFL Pick'em Application with process monitoring..."

# Set production environment
export NODE_ENV=production

# Set default port for App Runner (AWS App Runner expects port 8080)
export PORT=${PORT:-8080}
export FRONTEND_PORT=${FRONTEND_PORT:-8080}
export BACKEND_PORT=${BACKEND_PORT:-3001}

# Set database path relative to current directory for AppRunner
export DATABASE_PATH=${DATABASE_PATH:-./server/data/database.sqlite}

# Process monitoring configuration
MAX_RESTARTS=${MAX_RESTARTS:-5}
RESTART_DELAY=${RESTART_DELAY:-5}
HEALTH_CHECK_INTERVAL=${HEALTH_CHECK_INTERVAL:-30}
MEMORY_LIMIT_MB=${MEMORY_LIMIT_MB:-512}

# Create data and logs directories if they don't exist
mkdir -p ./server/data
mkdir -p ./logs

# Initialize database if it doesn't exist
if [ ! -f "$DATABASE_PATH" ]; then
    echo "📊 Initializing database..."
    node ./scripts/init-db.js
fi

# Function to log with timestamp
log_with_timestamp() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Function to check if process is running
is_process_running() {
    if [ -n "$1" ] && kill -0 "$1" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to check server health
check_server_health() {
    if curl -s -f "http://localhost:$PORT/api/health/live" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to get process memory usage in MB
get_memory_usage() {
    if [ -n "$1" ] && is_process_running "$1"; then
        # Get RSS memory in KB and convert to MB
        ps -o rss= -p "$1" 2>/dev/null | awk '{print int($1/1024)}' || echo "0"
    else
        echo "0"
    fi
}

# Function to start server
start_server() {
    log_with_timestamp "🚀 Starting unified server on port $PORT..."
    PORT=$PORT node server/index.js &
    SERVER_PID=$!
    log_with_timestamp "📋 Server started with PID: $SERVER_PID"
    
    # Wait a moment for the server to start
    sleep 3
    
    if is_process_running $SERVER_PID; then
        log_with_timestamp "✅ Server startup successful"
        return 0
    else
        log_with_timestamp "❌ Server startup failed"
        return 1
    fi
}

# Function to stop server gracefully
stop_server() {
    if [ -n "$SERVER_PID" ] && is_process_running $SERVER_PID; then
        log_with_timestamp "🛑 Stopping server (PID: $SERVER_PID)..."
        kill -TERM $SERVER_PID 2>/dev/null || true
        
        # Wait up to 10 seconds for graceful shutdown
        for i in $(seq 1 10); do
            if ! is_process_running $SERVER_PID; then
                log_with_timestamp "✅ Server stopped gracefully"
                return 0
            fi
            sleep 1
        done
        
        # Force kill if still running
        log_with_timestamp "⚠️  Forcing server shutdown..."
        kill -KILL $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    fi
    SERVER_PID=""
}

# Function to handle shutdown gracefully
shutdown() {
    log_with_timestamp "🛑 Received shutdown signal..."
    SHUTDOWN_REQUESTED=true
    stop_server
    log_with_timestamp "✅ Shutdown complete"
    exit 0
}

# Trap signals for graceful shutdown
trap shutdown SIGTERM SIGINT

# Main monitoring loop
RESTART_COUNT=0
SHUTDOWN_REQUESTED=false
SERVER_PID=""
LAST_HEALTH_CHECK=0

# Initial server start
if ! start_server; then
    log_with_timestamp "❌ Initial server start failed"
    exit 1
fi

log_with_timestamp "🔍 Starting process monitoring (checking every ${HEALTH_CHECK_INTERVAL}s)"
log_with_timestamp "📊 Memory limit: ${MEMORY_LIMIT_MB}MB, Max restarts: $MAX_RESTARTS"

# Main monitoring loop
while [ "$SHUTDOWN_REQUESTED" != "true" ]; do
    sleep $HEALTH_CHECK_INTERVAL
    
    if [ "$SHUTDOWN_REQUESTED" = "true" ]; then
        break
    fi
    
    CURRENT_TIME=$(date +%s)
    NEEDS_RESTART=false
    RESTART_REASON=""
    
    # Check if process is still running
    if ! is_process_running $SERVER_PID; then
        NEEDS_RESTART=true
        RESTART_REASON="Process died"
        log_with_timestamp "❌ Server process not running"
    else
        # Check memory usage
        MEMORY_USAGE=$(get_memory_usage $SERVER_PID)
        if [ "$MEMORY_USAGE" -gt "$MEMORY_LIMIT_MB" ]; then
            NEEDS_RESTART=true
            RESTART_REASON="Memory limit exceeded (${MEMORY_USAGE}MB > ${MEMORY_LIMIT_MB}MB)"
            log_with_timestamp "⚠️  $RESTART_REASON"
        fi
        
        # Check health endpoint (every 2 intervals to avoid too frequent checks)
        if [ $((CURRENT_TIME - LAST_HEALTH_CHECK)) -ge $((HEALTH_CHECK_INTERVAL * 2)) ]; then
            if ! check_server_health; then
                NEEDS_RESTART=true
                RESTART_REASON="Health check failed"
                log_with_timestamp "❌ Health check failed"
            else
                log_with_timestamp "✅ Health check passed (Memory: ${MEMORY_USAGE}MB)"
            fi
            LAST_HEALTH_CHECK=$CURRENT_TIME
        fi
    fi
    
    # Restart if needed
    if [ "$NEEDS_RESTART" = "true" ]; then
        if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
            log_with_timestamp "💀 Maximum restart limit ($MAX_RESTARTS) reached. Exiting."
            stop_server
            exit 1
        fi
        
        RESTART_COUNT=$((RESTART_COUNT + 1))
        log_with_timestamp "🔄 Restarting server (attempt $RESTART_COUNT/$MAX_RESTARTS): $RESTART_REASON"
        
        stop_server
        sleep $RESTART_DELAY
        
        if start_server; then
            log_with_timestamp "✅ Server restart successful"
        else
            log_with_timestamp "❌ Server restart failed"
        fi
    fi
done

# Final cleanup
stop_server