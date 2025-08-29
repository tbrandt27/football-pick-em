import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import BaseDatabaseProvider from "./BaseDatabaseProvider.js";

export default class DynamoDBProvider extends BaseDatabaseProvider {
  constructor() {
    super();
    this.client = null;
    this.docClient = null;
    this.tablePrefix = process.env.DYNAMODB_TABLE_PREFIX || 'football_pickem_';
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.isLocalStack = process.env.USE_LOCALSTACK === 'true';
    this.localStackEndpoint = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
    
    // Table name mappings
    this.tables = {
      users: `${this.tablePrefix}users`,
      football_teams: `${this.tablePrefix}football_teams`,
      pickem_games: `${this.tablePrefix}pickem_games`,
      game_participants: `${this.tablePrefix}game_participants`,
      seasons: `${this.tablePrefix}seasons`,
      football_games: `${this.tablePrefix}football_games`,
      system_settings: `${this.tablePrefix}system_settings`,
      picks: `${this.tablePrefix}picks`,
      weekly_standings: `${this.tablePrefix}weekly_standings`,
      game_invitations: `${this.tablePrefix}game_invitations`
    };
  }

  async initialize() {
    console.log(`[DynamoDB] Connecting to DynamoDB in region: ${this.region}`);
    console.log(`[DynamoDB] Table prefix: ${this.tablePrefix}`);
    console.log(`[DynamoDB] LocalStack mode: ${this.isLocalStack ? 'ENABLED' : 'DISABLED'}`);
    if (this.isLocalStack) {
      console.log(`[DynamoDB] LocalStack endpoint: ${this.localStackEndpoint}`);
    }
    console.log(`[DynamoDB] Using credentials: ${process.env.AWS_ACCESS_KEY_ID ? 'Yes (Access Key)' : 'No (IAM Role/Profile)'}`);
    
    // Initialize DynamoDB client
    try {
      const clientConfig = {
        region: this.region,
        // Add credentials configuration if needed
        ...(process.env.AWS_ACCESS_KEY_ID && {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          }
        })
      };

      // Configure LocalStack endpoint if enabled
      if (this.isLocalStack) {
        clientConfig.endpoint = this.localStackEndpoint;
        clientConfig.forcePathStyle = true; // Required for LocalStack
        console.log(`[DynamoDB] Configuring for LocalStack at ${this.localStackEndpoint}`);
      }

      this.client = new DynamoDBClient(clientConfig);
      this.docClient = DynamoDBDocumentClient.from(this.client);
      
      console.log("[DynamoDB] Client initialized successfully");
      
      // Test connection by listing tables
      await this._testConnection();
      
      console.log("[DynamoDB] Connection verified successfully");
      
    } catch (error) {
      console.error("[DynamoDB] Failed to initialize:", error);
      throw error;
    }
    
    // Note: Table creation would typically be handled by infrastructure (CloudFormation, CDK, etc.)
    if (this.isLocalStack) {
      console.log("[DynamoDB] LocalStack mode - tables can be created via setup scripts");
    } else {
      console.log("[DynamoDB] Production mode - tables should be created via infrastructure (CloudFormation/CDK)");
    }
  }

  async close() {
    if (this.client) {
      this.client.destroy();
      console.log("DynamoDB connection closed");
    }
  }

  getType() {
    return 'dynamodb';
  }

  // Native DynamoDB operations only - SQL compatibility removed
  async run(operation, params = []) {
    try {
      // Handle object-style DynamoDB operations only
      if (typeof operation === 'object' && operation.action) {
        return await this._executeOperationObject(operation);
      }

      // SQL strings are no longer supported - all code should use service layer
      if (typeof operation === 'string') {
        throw new Error('SQL operations are not supported. Use the service layer instead.');
      }
      
      throw new Error('Invalid operation format. DynamoDB provider requires operation objects with action property.');
    } catch (error) {
      console.error('[DynamoDB] Run operation failed:', error);
      throw error;
    }
  }

  async get(query, params = []) {
    try {
      // Handle object-style queries only
      if (typeof query === 'object') {
        const { action, table, key } = query;
        if (action === 'get') {
          const result = await this._dynamoGet(table, key);
          return result.Item;
        }
      }
      
      // SQL strings are no longer supported - all code should use service layer
      if (typeof query === 'string') {
        throw new Error('SQL queries are not supported. Use the service layer instead.');
      }
      
      throw new Error('Invalid query format. DynamoDB provider requires operation objects with action property.');
    } catch (error) {
      console.error('[DynamoDB] Get operation failed:', error);
      throw error;
    }
  }

  async all(query, params = []) {
    try {
      // Handle object-style queries only
      if (typeof query === 'object') {
        const { action, table, conditions } = query;
        if (action === 'scan') {
          const result = await this._dynamoScan(table, conditions);
          return result.Items || [];
        }
      }
      
      // SQL strings are no longer supported - all code should use service layer
      if (typeof query === 'string') {
        throw new Error('SQL queries are not supported. Use the service layer instead.');
      }
      
      throw new Error('Invalid query format. DynamoDB provider requires operation objects with action property.');
    } catch (error) {
      console.error('[DynamoDB] All operation failed:', error);
      throw error;
    }
  }

  // SQL parsing methods removed - all operations now use native DynamoDB calls through service layer

  async transaction(operations) {
    try {
      const transactItems = operations.map(op => this._convertToTransactItem(op));
      
      const command = new TransactWriteCommand({
        TransactItems: transactItems
      });
      
      await this.docClient.send(command);
      return { success: true };
    } catch (error) {
      console.error('DynamoDB transaction error:', error);
      throw error;
    }
  }

  // Execute DynamoDB operation objects only
  async _executeOperation(operation) {
    if (typeof operation === 'object' && operation.action) {
      return this._executeOperationObject(operation);
    }
    
    throw new Error('DynamoDB provider only supports operation objects with action property. SQL strings are not supported.');
  }

  async _executeOperationObject(operation) {
    const { action, table, key, item, conditions, index } = operation;
    
    switch (action) {
      case 'get':
        return this._dynamoGet(table, key);
      case 'put':
        return this._dynamoPut(table, item);
      case 'update':
        return this._dynamoUpdate(table, key, item);
      case 'delete':
        return this._dynamoDelete(table, key);
      case 'query':
        return this._dynamoQuery(table, conditions, index);
      case 'scan':
        return this._dynamoScan(table, conditions);
      default:
        throw new Error(`Unsupported DynamoDB action: ${action}`);
    }
  }

  async _dynamoGet(tableName, key) {
    // Check if docClient is properly initialized
    if (!this.docClient) {
      const error = new Error('DynamoDB docClient is not initialized. Call initialize() first.');
      console.error(`[DynamoDB] GET failed - docClient not initialized:`, {
        tableName,
        key,
        clientState: {
          client: !!this.client,
          docClient: !!this.docClient,
          region: this.region,
          tablePrefix: this.tablePrefix
        }
      });
      throw error;
    }

    const command = new GetCommand({
      TableName: this.tables[tableName] || tableName,
      Key: key
    });
    
    return await this.docClient.send(command);
  }

  async _dynamoPut(tableName, item) {
    try {
      // Check if docClient is properly initialized
      if (!this.docClient) {
        const error = new Error('DynamoDB docClient is not initialized. Call initialize() first.');
        console.error(`[DynamoDB] PUT failed - docClient not initialized:`, {
          tableName,
          item,
          clientState: {
            client: !!this.client,
            docClient: !!this.docClient,
            region: this.region,
            tablePrefix: this.tablePrefix
          }
        });
        throw error;
      }

      // Add timestamps
      const now = new Date().toISOString();
      const itemWithTimestamps = {
        ...item,
        created_at: item.created_at || now,
        updated_at: now
      };

      // Remove null and undefined values - DynamoDB doesn't accept them
      const cleanedItem = {};
      Object.keys(itemWithTimestamps).forEach(key => {
        const value = itemWithTimestamps[key];
        if (value !== null && value !== undefined) {
          cleanedItem[key] = value;
        }
      });

      // Log null filtering only when values are actually removed
      const removedFields = Object.keys(itemWithTimestamps).filter(key =>
        itemWithTimestamps[key] === null || itemWithTimestamps[key] === undefined
      );
      if (removedFields.length > 0) {
        console.log(`[DynamoDB] Filtered out null/undefined fields: [${removedFields.join(', ')}]`);
      }

      const actualTableName = this.tables[tableName] || tableName;

      // Validate required fields based on table using cleaned item
      if (tableName === 'pickem_games') {
        if (!cleanedItem.id) {
          throw new Error(`Missing required field 'id' for pickem_games table. Current value: ${cleanedItem.id}`);
        }
        if (!cleanedItem.game_name) {
          throw new Error(`Missing required field 'game_name' for pickem_games table. Current value: ${cleanedItem.game_name}`);
        }
      }

      const command = new PutCommand({
        TableName: actualTableName,
        Item: cleanedItem
      });
      
      const startTime = Date.now();
      const result = await this.docClient.send(command);
      const duration = Date.now() - startTime;
      
      this._logPerformance('PUT', duration, { tableName: actualTableName, itemId: cleanedItem.id });
      
      return { id: cleanedItem.id };
    } catch (error) {
      console.error(`[DynamoDB] PUT operation failed:`, {
        tableName: this.tables[tableName] || tableName,
        error: error.message,
        code: error.name,
        httpStatusCode: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId
      });
      
      // Check for specific DynamoDB errors and provide helpful context
      if (error.name === 'ResourceNotFoundException') {
        console.error(`[DynamoDB] Table not found. Available tables:`, Object.values(this.tables));
      } else if (error.name === 'ValidationException') {
        console.error(`[DynamoDB] Validation error - check item structure`);
      } else if (error.name === 'AccessDeniedException') {
        console.error(`[DynamoDB] Access denied - check AWS credentials and permissions`);
      }
      
      throw error;
    }
  }

  async _dynamoUpdate(tableName, key, updates) {
    // Check if docClient is properly initialized
    if (!this.docClient) {
      const error = new Error('DynamoDB docClient is not initialized. Call initialize() first.');
      console.error(`[DynamoDB] UPDATE failed - docClient not initialized:`, {
        tableName,
        key,
        updates,
        clientState: {
          client: !!this.client,
          docClient: !!this.docClient,
          region: this.region,
          tablePrefix: this.tablePrefix
        }
      });
      throw error;
    }

    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    // Filter out updated_at from updates to avoid duplication
    const filteredUpdates = { ...updates };
    delete filteredUpdates.updated_at;
    
    Object.keys(filteredUpdates).forEach((field, index) => {
      const fieldName = `#field${index}`;
      const fieldValue = `:value${index}`;
      
      updateExpression.push(`${fieldName} = ${fieldValue}`);
      expressionAttributeNames[fieldName] = field;
      expressionAttributeValues[fieldValue] = filteredUpdates[field];
    });

    // Always update the updated_at timestamp
    updateExpression.push('#updated_at = :updated_at');
    expressionAttributeNames['#updated_at'] = 'updated_at';
    expressionAttributeValues[':updated_at'] = new Date().toISOString();

    const command = new UpdateCommand({
      TableName: this.tables[tableName] || tableName,
      Key: key,
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    });
    
    return await this.docClient.send(command);
  }

  async _dynamoDelete(tableName, key) {
    // Check if docClient is properly initialized
    if (!this.docClient) {
      const error = new Error('DynamoDB docClient is not initialized. Call initialize() first.');
      console.error(`[DynamoDB] DELETE failed - docClient not initialized:`, {
        tableName,
        key,
        clientState: {
          client: !!this.client,
          docClient: !!this.docClient,
          region: this.region,
          tablePrefix: this.tablePrefix
        }
      });
      throw error;
    }

    const actualTableName = this.tables[tableName] || tableName;
    const command = new DeleteCommand({
      TableName: actualTableName,
      Key: key
    });
    
    try {
      const result = await this.docClient.send(command);
      return result;
    } catch (error) {
      console.error(`[DynamoDB] DELETE failed:`, {
        tableName: actualTableName,
        error: error.message,
        code: error.name
      });
      throw error;
    }
  }

  async _dynamoQuery(tableName, conditions, indexName = null) {
    // Check if docClient is properly initialized
    if (!this.docClient) {
      const error = new Error('DynamoDB docClient is not initialized. Call initialize() first.');
      console.error(`[DynamoDB] QUERY failed - docClient not initialized:`, {
        tableName,
        conditions,
        indexName,
        clientState: {
          client: !!this.client,
          docClient: !!this.docClient,
          region: this.region,
          tablePrefix: this.tablePrefix
        }
      });
      throw error;
    }

    const keyConditionExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    Object.keys(conditions).forEach((field, index) => {
      const fieldName = `#field${index}`;
      const fieldValue = `:value${index}`;
      
      keyConditionExpression.push(`${fieldName} = ${fieldValue}`);
      expressionAttributeNames[fieldName] = field;
      expressionAttributeValues[fieldValue] = conditions[field];
    });

    const queryParams = {
      TableName: this.tables[tableName] || tableName,
      KeyConditionExpression: keyConditionExpression.join(' AND '),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    };

    if (indexName) {
      queryParams.IndexName = indexName;
    }

    const command = new QueryCommand(queryParams);
    return await this.docClient.send(command);
  }

  async _dynamoScan(tableName, filters = {}) {
    // Check if docClient is properly initialized
    if (!this.docClient) {
      const error = new Error('DynamoDB docClient is not initialized. Call initialize() first.');
      console.error(`[DynamoDB] SCAN failed - docClient not initialized:`, {
        tableName,
        filters,
        clientState: {
          client: !!this.client,
          docClient: !!this.docClient,
          region: this.region,
          tablePrefix: this.tablePrefix
        }
      });
      throw error;
    }

    const actualTableName = this.tables[tableName] || tableName;
    const scanParams = {
      TableName: actualTableName
    };

    const startTime = Date.now();
    const hasFilters = Object.keys(filters).length > 0;

    if (hasFilters) {
      const filterExpression = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};
      
      Object.keys(filters).forEach((field, index) => {
        const fieldName = `#field${index}`;
        const fieldValue = `:value${index}`;
        
        filterExpression.push(`${fieldName} = ${fieldValue}`);
        expressionAttributeNames[fieldName] = field;
        expressionAttributeValues[fieldValue] = filters[field];
      });

      scanParams.FilterExpression = filterExpression.join(' AND ');
      scanParams.ExpressionAttributeNames = expressionAttributeNames;
      scanParams.ExpressionAttributeValues = expressionAttributeValues;
    }

    const command = new ScanCommand(scanParams);
    try {
      const result = await this.docClient.send(command);
      const duration = Date.now() - startTime;
      
      // Enhanced logging with performance metrics
      const logData = {
        tableName: actualTableName,
        itemCount: result.Items?.length || 0,
        scannedCount: result.ScannedCount,
        duration: `${duration}ms`,
        hasFilters,
        filterCount: Object.keys(filters).length,
        efficiency: result.ScannedCount > 0 ? ((result.Items?.length || 0) / result.ScannedCount * 100).toFixed(1) + '%' : '0%'
      };

      // Log all scans with performance data, but highlight problematic ones
      if (result.ScannedCount > 100 || duration > 500 || (result.Items?.length || 0) > 50) {
        console.warn(`[DynamoDB] Large/Slow SCAN:`, logData);
      } else {
        console.log(`[DynamoDB] SCAN completed:`, logData);
      }

      // Track performance metrics
      this._logPerformance('SCAN', duration, logData);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DynamoDB] SCAN failed:`, {
        tableName: actualTableName,
        error: error.message,
        code: error.name,
        duration: `${duration}ms`,
        hasFilters
      });
      throw error;
    }
  }


  _convertToTransactItem(operation) {
    // Convert operation to DynamoDB TransactItem format
    const { action, table, key, item } = operation;
    
    switch (action) {
      case 'put':
        return {
          Put: {
            TableName: this.tables[table] || table,
            Item: item
          }
        };
      case 'update':
        return {
          Update: {
            TableName: this.tables[table] || table,
            Key: key,
            // Add update expression here
          }
        };
      case 'delete':
        return {
          Delete: {
            TableName: this.tables[table] || table,
            Key: key
          }
        };
      default:
        throw new Error(`Unsupported transaction action: ${action}`);
    }
  }

  // Helper method to test DynamoDB connection
  async _testConnection() {
    try {
      const { ListTablesCommand } = await import("@aws-sdk/client-dynamodb");
      const command = new ListTablesCommand({});
      const response = await this.client.send(command);
      console.log(`[DynamoDB] Connection test successful. Found ${response.TableNames?.length || 0} tables.`);
      return true;
    } catch (error) {
      console.error("[DynamoDB] Connection test failed:", error.message);
      throw error;
    }
  }

  // Helper method to generate operation IDs for logging
  _generateOperationId() {
    return Math.random().toString(36).substr(2, 9);
  }

  // Enhanced error logging
  _logError(operation, error, context = {}) {
    console.error(`[DynamoDB] Error in ${operation}:`, {
      message: error.message,
      code: error.name,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
      context
    });
  }

  // Log performance metrics
  _logPerformance(operation, duration, details = {}) {
    if (duration > 1000) {
      console.warn(`[DynamoDB] Slow operation detected: ${operation} took ${duration}ms`, details);
      
      // Log optimization suggestions for slow operations
      if (operation === 'SCAN' && details.scannedCount > 100) {
        console.warn(`[DynamoDB] Optimization suggestion: Consider using Query instead of Scan, or add a GSI for better performance`);
      }
    } else if (duration > 500) {
      console.log(`[DynamoDB] Operation ${operation} took ${duration}ms`, details);
    }

    // Track metrics for monitoring dashboard
    if (!this.performanceMetrics) {
      this.performanceMetrics = {
        operationCounts: {},
        totalDuration: {},
        slowOperations: 0
      };
    }

    this.performanceMetrics.operationCounts[operation] = (this.performanceMetrics.operationCounts[operation] || 0) + 1;
    this.performanceMetrics.totalDuration[operation] = (this.performanceMetrics.totalDuration[operation] || 0) + duration;
    
    if (duration > 1000) {
      this.performanceMetrics.slowOperations++;
    }
  }

  // Get performance statistics
  getPerformanceStats() {
    if (!this.performanceMetrics) return null;
    
    const stats = {
      totalOperations: Object.values(this.performanceMetrics.operationCounts).reduce((a, b) => a + b, 0),
      slowOperations: this.performanceMetrics.slowOperations,
      operationBreakdown: {},
      averageDurations: {}
    };

    for (const [operation, count] of Object.entries(this.performanceMetrics.operationCounts)) {
      stats.operationBreakdown[operation] = count;
      stats.averageDurations[operation] = Math.round(this.performanceMetrics.totalDuration[operation] / count);
    }

    return stats;
  }

  // Reset performance metrics
  resetPerformanceStats() {
    this.performanceMetrics = {
      operationCounts: {},
      totalDuration: {},
      slowOperations: 0
    };
  }
}