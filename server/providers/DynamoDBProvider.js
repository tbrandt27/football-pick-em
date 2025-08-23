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
    console.log(`[DynamoDB] Using credentials: ${process.env.AWS_ACCESS_KEY_ID ? 'Yes (Access Key)' : 'No (IAM Role/Profile)'}`);
    
    // Initialize DynamoDB client
    try {
      this.client = new DynamoDBClient({
        region: this.region,
        // Add credentials configuration if needed
        ...(process.env.AWS_ACCESS_KEY_ID && {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          }
        })
      });

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
    console.log("[DynamoDB] Tables should be created via infrastructure (CloudFormation/CDK)");
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

  // Compatibility methods for SQL-like operations (gradually migrate to service layer)
  async run(operation, params = []) {
    try {
      // Handle object-style DynamoDB operations (preferred)
      if (typeof operation === 'object' && operation.action) {
        return await this._executeOperationObject(operation);
      }

      // Handle SQL strings (legacy compatibility - basic parsing)
      if (typeof operation === 'string') {
        console.warn('[DynamoDB] SQL operation detected - should migrate to service layer:', operation);
        return await this._parseSQLAndExecute(operation, params);
      }
      
      throw new Error('Invalid query format');
    } catch (error) {
      console.error('[DynamoDB] Run operation failed:', error);
      throw error;
    }
  }

  async get(sql, params = []) {
    try {
      // Handle object-style queries
      if (typeof sql === 'object') {
        const { action, table, key } = sql;
        if (action === 'get') {
          const result = await this._dynamoGet(table, key);
          return result.Item;
        }
      }
      
      // Handle SQL strings (legacy compatibility)
      if (typeof sql === 'string') {
        console.warn('[DynamoDB] SQL query detected - should migrate to service layer:', sql);
        const result = await this._parseSQLAndExecute(sql, params);
        return result.length > 0 ? result[0] : null;
      }
      
      throw new Error('Invalid query format');
    } catch (error) {
      console.error('[DynamoDB] Get operation failed:', error);
      throw error;
    }
  }

  async all(sql, params = []) {
    try {
      // Handle object-style queries
      if (typeof sql === 'object') {
        const { action, table, conditions } = sql;
        if (action === 'scan') {
          const result = await this._dynamoScan(table, conditions);
          return result.Items || [];
        }
      }
      
      // Handle SQL strings (legacy compatibility)
      if (typeof sql === 'string') {
        console.warn('[DynamoDB] SQL query detected - should migrate to service layer:', sql);
        return await this._parseSQLAndExecute(sql, params);
      }
      
      throw new Error('Invalid query format');
    } catch (error) {
      console.error('[DynamoDB] All operation failed:', error);
      throw error;
    }
  }

  /**
   * Parse SQL and execute equivalent DynamoDB operation (basic implementation)
   */
  async _parseSQLAndExecute(sql, params = []) {
    const sqlUpper = sql.toUpperCase().trim();
    
    // Basic SELECT parsing
    if (sqlUpper.startsWith('SELECT')) {
      return await this._parseAndExecuteSelect(sql, params);
    }
    
    // Basic INSERT/UPDATE/DELETE - return mock success for compatibility
    if (sqlUpper.startsWith('INSERT') || sqlUpper.startsWith('UPDATE') || sqlUpper.startsWith('DELETE')) {
      console.log('[DynamoDB] Mock success for modification operation:', sql);
      return { changes: 1 };
    }
    
    console.warn('[DynamoDB] Unsupported SQL operation:', sql);
    return [];
  }

  /**
   * Parse and execute SELECT statements
   */
  async _parseAndExecuteSelect(sql, params = []) {
    try {
      // Handle COUNT queries
      if (sql.toUpperCase().includes('COUNT(*)')) {
        const tableMatch = sql.match(/FROM\s+(\w+)/i);
        if (tableMatch) {
          const tableName = tableMatch[1];
          const result = await this._dynamoScan(tableName, {});
          return [{ count: result.Items ? result.Items.length : 0 }];
        }
      }

      // Extract table name
      const tableMatch = sql.match(/FROM\s+(\w+)/i);
      if (!tableMatch) {
        console.warn('[DynamoDB] Could not parse table name from SQL:', sql);
        return [];
      }
      
      const tableName = tableMatch[1];
      
      // Basic WHERE clause parsing
      const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
      const conditions = {};
      
      if (whereMatch && params.length > 0) {
        const whereClause = whereMatch[1];
        // Simple parsing for basic conditions
        const conditionMatch = whereClause.match(/(\w+)\s*=\s*\?/);
        if (conditionMatch) {
          conditions[conditionMatch[1]] = params[0];
        }
      }
      
      const result = await this._dynamoScan(tableName, conditions);
      return result.Items || [];
    } catch (error) {
      console.error('[DynamoDB] SELECT operation failed:', error);
      return [];
    }
  }

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

      console.log(`[DynamoDB] === _dynamoPut START ===`);
      console.log(`[DynamoDB] Input table name: "${tableName}"`);
      console.log(`[DynamoDB] Input item:`, JSON.stringify(item, null, 2));
      console.log(`[DynamoDB] Item keys:`, Object.keys(item));
      console.log(`[DynamoDB] Item type validation:`, {
        id: { value: item.id, type: typeof item.id, present: !!item.id },
        game_name: { value: item.game_name, type: typeof item.game_name, present: !!item.game_name }
      });
      
      // Add timestamps
      const now = new Date().toISOString();
      const itemWithTimestamps = {
        ...item,
        created_at: item.created_at || now,
        updated_at: now
      };

      const actualTableName = this.tables[tableName] || tableName;
      console.log(`[DynamoDB] Table name mapping:`, {
        inputTableName: tableName,
        actualTableName,
        mappingFound: !!this.tables[tableName],
        tablePrefix: this.tablePrefix,
        availableMappings: Object.keys(this.tables)
      });

      console.log(`[DynamoDB] Item with timestamps:`, JSON.stringify(itemWithTimestamps, null, 2));

      // Validate required fields based on table
      if (tableName === 'pickem_games') {
        console.log(`[DynamoDB] Validating pickem_games required fields:`);
        const validations = {
          id: { required: true, present: !!item.id, value: item.id },
          game_name: { required: true, present: !!item.game_name, value: item.game_name },
          type: { required: false, present: !!item.type, value: item.type },
          commissioner_id: { required: false, present: !!item.commissioner_id, value: item.commissioner_id },
          season_id: { required: false, present: !!item.season_id, value: item.season_id },
          is_active: { required: false, present: item.is_active !== undefined, value: item.is_active }
        };
        
        console.log(`[DynamoDB] Field validations:`, validations);
        
        if (!item.id) {
          throw new Error(`Missing required field 'id' for pickem_games table. Current value: ${item.id}`);
        }
        if (!item.game_name) {
          throw new Error(`Missing required field 'game_name' for pickem_games table. Current value: ${item.game_name}`);
        }
        
        console.log(`[DynamoDB] All required fields validated successfully`);
      }

      console.log(`[DynamoDB] Creating PutCommand...`);
      const command = new PutCommand({
        TableName: actualTableName,
        Item: itemWithTimestamps
      });
      
      console.log(`[DynamoDB] PutCommand created:`, {
        TableName: command.input.TableName,
        Item: command.input.Item,
        ItemKeys: Object.keys(command.input.Item),
        commandType: command.constructor.name
      });
      
      console.log(`[DynamoDB] Sending PUT command to DynamoDB...`);
      const startTime = Date.now();
      
      const result = await this.docClient.send(command);
      
      const duration = Date.now() - startTime;
      console.log(`[DynamoDB] PUT completed in ${duration}ms`);
      console.log(`[DynamoDB] PUT result:`, {
        tableName: actualTableName,
        itemId: item.id,
        httpStatusCode: result.$metadata?.httpStatusCode,
        requestId: result.$metadata?.requestId,
        cfId: result.$metadata?.cfId,
        attempts: result.$metadata?.attempts,
        totalRetryDelay: result.$metadata?.totalRetryDelay
      });
      
      console.log(`[DynamoDB] === _dynamoPut SUCCESS ===`);
      return { id: item.id };
    } catch (error) {
      console.error(`[DynamoDB] === _dynamoPut FAILED ===`);
      console.error(`[DynamoDB] Error details:`, {
        tableName,
        actualTableName: this.tables[tableName] || tableName,
        inputItem: item,
        errorMessage: error.message,
        errorCode: error.name,
        errorType: error.constructor.name,
        httpStatusCode: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId,
        retryable: error.$retryable,
        time: error.time
      });
      
      console.error(`[DynamoDB] Full error object:`, error);
      console.error(`[DynamoDB] Error stack:`, error.stack);
      
      // Check for specific DynamoDB errors
      if (error.name === 'ResourceNotFoundException') {
        console.error(`[DynamoDB] Table not found! Available tables:`, Object.values(this.tables));
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
    
    Object.keys(updates).forEach((field, index) => {
      const fieldName = `#field${index}`;
      const fieldValue = `:value${index}`;
      
      updateExpression.push(`${fieldName} = ${fieldValue}`);
      expressionAttributeNames[fieldName] = field;
      expressionAttributeValues[fieldValue] = updates[field];
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
    console.log(`[DynamoDB] DELETE operation details:`, {
      tableName,
      actualTableName,
      key
    });

    const command = new DeleteCommand({
      TableName: actualTableName,
      Key: key
    });
    
    try {
      const result = await this.docClient.send(command);
      console.log(`[DynamoDB] DELETE successful:`, {
        tableName: actualTableName,
        key,
        httpStatusCode: result.$metadata?.httpStatusCode
      });
      return result;
    } catch (error) {
      console.error(`[DynamoDB] DELETE failed:`, {
        tableName: actualTableName,
        key,
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

    if (Object.keys(filters).length > 0) {
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

    console.log(`[DynamoDB] SCAN operation details:`, {
      tableName,
      actualTableName,
      filters,
      hasFilters: Object.keys(filters).length > 0,
      clientInitialized: !!this.docClient
    });

    const command = new ScanCommand(scanParams);
    try {
      const result = await this.docClient.send(command);
      console.log(`[DynamoDB] SCAN successful:`, {
        tableName: actualTableName,
        itemCount: result.Items?.length || 0,
        scannedCount: result.ScannedCount,
        httpStatusCode: result.$metadata?.httpStatusCode
      });
      return result;
    } catch (error) {
      console.error(`[DynamoDB] SCAN failed:`, {
        tableName: actualTableName,
        error: error.message,
        code: error.name,
        clientState: {
          client: !!this.client,
          docClient: !!this.docClient
        }
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
    } else if (duration > 500) {
      console.log(`[DynamoDB] Operation ${operation} took ${duration}ms`, details);
    }
  }
}