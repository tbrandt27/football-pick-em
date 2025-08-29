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
RESTART_DELAY=${RESTART_DELAY:-10}
HEALTH_CHECK_INTERVAL=${HEALTH_CHECK_INTERVAL:-60}
MEMORY_LIMIT_MB=${MEMORY_LIMIT_MB:-512}

# Create data and logs directories if they don't exist
mkdir -p ./server/data
mkdir -p ./logs

# Initialize database based on type
DATABASE_TYPE=${DATABASE_TYPE:-sqlite}
NODE_ENV=${NODE_ENV:-development}

# Determine actual database type (handle 'auto' setting)
ACTUAL_DB_TYPE=$DATABASE_TYPE
if [ "$DATABASE_TYPE" = "auto" ]; then
    if [ "$NODE_ENV" = "production" ]; then
        ACTUAL_DB_TYPE="dynamodb"
    else
        ACTUAL_DB_TYPE="sqlite"
    fi
fi

# Only initialize SQLite database if using SQLite
if [ "$ACTUAL_DB_TYPE" = "sqlite" ]; then
    if [ ! -f "$DATABASE_PATH" ]; then
        echo "📊 Initializing database..."
        node ./scripts/init-db.js
    fi
else
    echo "📊 Using DynamoDB - skipping local database initialization..."
    echo "ℹ️  DynamoDB tables should be created via infrastructure (CloudFormation/CDK)"
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
        MEMORY_KB=$(ps -o rss= -p "$1" 2>/dev/null | tr -d ' ' || echo "0")
        # Ensure MEMORY_KB is a valid number, default to 0 if not
        MEMORY_KB=${MEMORY_KB:-0}
        if [ "$MEMORY_KB" != "0" ] && [ "$MEMORY_KB" -gt 0 ] 2>/dev/null; then
            echo $((MEMORY_KB / 1024))
        else
            echo "0"
        fi
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
    
    # Wait longer for the server to fully initialize
    sleep 5
    
    if is_process_running $SERVER_PID; then
        # Wait additional time for Express app to be ready
        sleep 3
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

# Ensure all numeric variables have valid defaults for arithmetic operations
MAX_RESTARTS=${MAX_RESTARTS:-5}
RESTART_DELAY=${RESTART_DELAY:-10}
HEALTH_CHECK_INTERVAL=${HEALTH_CHECK_INTERVAL:-60}
MEMORY_LIMIT_MB=${MEMORY_LIMIT_MB:-512}
PORT=${PORT:-8080}

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
    
    # Ensure CURRENT_TIME is valid
    CURRENT_TIME=${CURRENT_TIME:-$(date +%s)}
    
    # Check if process is still running
    if ! is_process_running $SERVER_PID; then
        NEEDS_RESTART=true
        RESTART_REASON="Process died"
        log_with_timestamp "❌ Server process not running"
    else
        # Check memory usage
        MEMORY_USAGE=$(get_memory_usage $SERVER_PID)
        # Ensure MEMORY_USAGE is a valid number before comparison, default to 0 if empty
        MEMORY_USAGE=${MEMORY_USAGE:-0}
        MEMORY_LIMIT_MB=${MEMORY_LIMIT_MB:-512}
        
        # Only check memory limit if we have valid numbers
        if [ "$MEMORY_USAGE" != "0" ] && [ "$MEMORY_USAGE" -gt 0 ] 2>/dev/null && [ "$MEMORY_USAGE" -gt "$MEMORY_LIMIT_MB" ] 2>/dev/null; then
            NEEDS_RESTART=true
            RESTART_REASON="Memory limit exceeded (${MEMORY_USAGE}MB > ${MEMORY_LIMIT_MB}MB)"
            log_with_timestamp "⚠️  $RESTART_REASON"
        fi
        
        # Check health endpoint (every 3 intervals to avoid too frequent checks in production)
        # Ensure variables are initialized for arithmetic operations
        CURRENT_TIME=${CURRENT_TIME:-$(date +%s)}
        LAST_HEALTH_CHECK=${LAST_HEALTH_CHECK:-0}
        HEALTH_CHECK_INTERVAL=${HEALTH_CHECK_INTERVAL:-60}
        
        if [ $((CURRENT_TIME - LAST_HEALTH_CHECK)) -ge $((HEALTH_CHECK_INTERVAL * 3)) ]; then
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
        # Ensure restart count variables are properly initialized
        RESTART_COUNT=${RESTART_COUNT:-0}
        MAX_RESTARTS=${MAX_RESTARTS:-5}
        
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