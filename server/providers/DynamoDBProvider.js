import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import BaseDatabaseProvider from "./BaseDatabaseProvider.js";
import { v4 as uuidv4 } from "uuid";

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

  // Helper method to convert SQL operations to DynamoDB operations
  async run(operation, params = []) {
    const operationId = this._generateOperationId();
    const startTime = Date.now();
    
    try {
      console.log(`[DynamoDB:${operationId}] Starting RUN operation:`, typeof operation === 'string' ? operation.substring(0, 100) : operation);
      
      const result = await this._executeOperation(operation, params);
      const duration = Date.now() - startTime;
      
      console.log(`[DynamoDB:${operationId}] RUN completed in ${duration}ms`);
      
      return {
        id: result.id || (result.Attributes && result.Attributes.id),
        changes: 1
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DynamoDB:${operationId}] RUN failed after ${duration}ms:`, error.message);
      console.error(`[DynamoDB:${operationId}] Operation details:`, { operation: typeof operation === 'string' ? operation.substring(0, 200) : operation, params });
      throw error;
    }
  }

  async get(operation, params = []) {
    const operationId = this._generateOperationId();
    const startTime = Date.now();
    
    try {
      console.log(`[DynamoDB:${operationId}] Starting GET operation:`, typeof operation === 'string' ? operation.substring(0, 100) : operation);
      
      const result = await this._executeOperation(operation, params);
      const duration = Date.now() - startTime;
      
      // Handle both GET (result.Item) and SCAN (result.Items) results
      let item = null;
      if (result.Item) {
        // Direct GET operation
        item = result.Item;
      } else if (result.Items && result.Items.length > 0) {
        // SCAN operation - return first item
        item = result.Items[0];
      }
      
      console.log(`[DynamoDB:${operationId}] GET completed in ${duration}ms, found: ${item ? 'Yes' : 'No'}`);
      console.log(`[DynamoDB:${operationId}] Result type: ${result.Item ? 'GET' : result.Items ? 'SCAN' : 'unknown'}, Items: ${result.Items?.length || 0}`);
      
      return item;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DynamoDB:${operationId}] GET failed after ${duration}ms:`, error.message);
      console.error(`[DynamoDB:${operationId}] Operation details:`, { operation: typeof operation === 'string' ? operation.substring(0, 200) : operation, params });
      throw error;
    }
  }

  async all(operation, params = []) {
    const operationId = this._generateOperationId();
    const startTime = Date.now();
    
    try {
      console.log(`[DynamoDB:${operationId}] Starting ALL operation:`, typeof operation === 'string' ? operation.substring(0, 100) : operation);
      
      const result = await this._executeOperation(operation, params);
      const duration = Date.now() - startTime;
      const count = result.Items ? result.Items.length : (Array.isArray(result) ? result.length : 0);
      
      console.log(`[DynamoDB:${operationId}] ALL completed in ${duration}ms, returned ${count} items`);
      
      return result.Items || result || [];
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DynamoDB:${operationId}] ALL failed after ${duration}ms:`, error.message);
      console.error(`[DynamoDB:${operationId}] Operation details:`, { operation: typeof operation === 'string' ? operation.substring(0, 200) : operation, params });
      throw error;
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

  // Convert SQL-like operation strings to DynamoDB operations
  async _executeOperation(operation, params = []) {
    // Handle raw SQL strings by parsing them or using operation objects
    if (typeof operation === 'string') {
      return this._executeSQLString(operation, params);
    } else if (typeof operation === 'object') {
      return this._executeOperationObject(operation);
    }
    
    throw new Error(`Unsupported operation type: ${typeof operation}`);
  }

  async _executeSQLString(sql, params) {
    // Basic SQL parsing for common operations
    const sqlLower = sql.toLowerCase().trim();
    
    if (sqlLower.startsWith('select')) {
      return this._handleSelect(sql, params);
    } else if (sqlLower.startsWith('insert')) {
      return this._handleInsert(sql, params);
    } else if (sqlLower.startsWith('update')) {
      return this._handleUpdate(sql, params);
    } else if (sqlLower.startsWith('delete')) {
      return this._handleDelete(sql, params);
    } else if (sqlLower.includes('pragma') || sqlLower.includes('create table') || sqlLower.includes('alter table')) {
      // Ignore SQLite-specific commands
      return { success: true };
    }
    
    throw new Error(`Unsupported SQL operation: ${sql}`);
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
    const command = new GetCommand({
      TableName: this.tables[tableName] || tableName,
      Key: key
    });
    
    return await this.docClient.send(command);
  }

  async _dynamoPut(tableName, item) {
    // Add timestamps
    const now = new Date().toISOString();
    const itemWithTimestamps = {
      ...item,
      created_at: item.created_at || now,
      updated_at: now
    };

    const actualTableName = this.tables[tableName] || tableName;
    console.log(`[DynamoDB] PUT operation details:`, {
      tableName,
      actualTableName,
      itemId: item.id,
      hasRequiredFields: {
        id: !!item.id,
        email: !!item.email
      }
    });

    const command = new PutCommand({
      TableName: actualTableName,
      Item: itemWithTimestamps
    });
    
    try {
      const result = await this.docClient.send(command);
      console.log(`[DynamoDB] PUT successful:`, {
        tableName: actualTableName,
        itemId: item.id,
        httpStatusCode: result.$metadata?.httpStatusCode,
        requestId: result.$metadata?.requestId
      });
      return { id: item.id };
    } catch (error) {
      console.error(`[DynamoDB] PUT failed:`, {
        tableName: actualTableName,
        itemId: item.id,
        error: error.message,
        code: error.name,
        httpStatusCode: error.$metadata?.httpStatusCode
      });
      throw error;
    }
  }

  async _dynamoUpdate(tableName, key, updates) {
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
      hasFilters: Object.keys(filters).length > 0
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
        code: error.name
      });
      throw error;
    }
  }

  // Basic SQL parsing methods (simplified for common patterns)
  async _handleSelect(sql, params) {
    // This is a simplified implementation
    // In a real implementation, you'd want a proper SQL parser
    // For now, we'll handle common patterns manually
    
    // Extract table name
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    if (!tableMatch) {
      throw new Error('Could not parse table name from SELECT statement');
    }
    
    const tableName = tableMatch[1];
    
    // Check for WHERE clause
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i);
    
    if (whereMatch) {
      // Simple WHERE parsing - this is very basic
      const whereClause = whereMatch[1];
      const conditions = this._parseWhereClause(whereClause, params);
      
      // Determine if we should use Query or Scan
      // This is simplified - you'd want more sophisticated logic
      if (this._canUseQuery(tableName, conditions)) {
        return this._dynamoQuery(tableName, conditions);
      } else {
        return this._dynamoScan(tableName, conditions);
      }
    } else {
      // No WHERE clause - scan the entire table
      return this._dynamoScan(tableName);
    }
  }

  async _handleInsert(sql, params) {
    // Parse INSERT statement
    const tableMatch = sql.match(/INSERT\s+INTO\s+(\w+)/i);
    const valuesMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
    
    if (!tableMatch || !valuesMatch) {
      throw new Error('Could not parse INSERT statement');
    }
    
    const tableName = tableMatch[1];
    
    // For simplicity, assume the item is passed as the first parameter
    // In a real implementation, you'd parse the column names and values
    const item = params[0] || {};
    
    if (!item.id) {
      item.id = uuidv4();
    }
    
    return this._dynamoPut(tableName, item);
  }

  async _handleUpdate(sql, params) {
    // Parse UPDATE statement - properly handle SQL format
    const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
    const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
    const whereMatch = sql.match(/WHERE\s+(.+)$/i);
    
    if (!tableMatch || !whereMatch) {
      throw new Error('Could not parse UPDATE statement');
    }
    
    const tableName = tableMatch[1];
    const whereClause = whereMatch[1];
    
    // Parse WHERE clause to extract the key
    const key = {};
    const whereConditions = this._parseWhereClause(whereClause, params);
    
    // For DynamoDB, we need the primary key (id)
    if (whereConditions.id) {
      key.id = whereConditions.id;
    } else {
      throw new Error('UPDATE requires id in WHERE clause for DynamoDB');
    }
    
    // Parse SET clause to extract updates
    const updates = {};
    if (setMatch) {
      const setClause = setMatch[1];
      // Handle common SET patterns
      if (setClause.includes('last_login') && setClause.includes('datetime')) {
        updates.last_login = new Date().toISOString();
      }
      // Add more SET clause parsing as needed
    }
    
    console.log(`[DynamoDB] UPDATE parsing:`, {
      tableName,
      key,
      updates,
      originalSQL: sql.substring(0, 100),
      params
    });
    
    return this._dynamoUpdate(tableName, key, updates);
  }

  async _handleDelete(sql, params) {
    // Parse DELETE statement - simplified
    const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    const whereMatch = sql.match(/WHERE\s+(.+)$/i);
    
    if (!tableMatch || !whereMatch) {
      throw new Error('Could not parse DELETE statement');
    }
    
    const tableName = tableMatch[1];
    const key = params[0] || {}; // Assume key is first param
    
    return this._dynamoDelete(tableName, key);
  }

  _parseWhereClause(whereClause, params) {
    // Very basic WHERE clause parsing
    // In practice, you'd want a proper SQL parser
    const conditions = {};
    
    // Handle simple equality conditions
    const matches = whereClause.match(/(\w+)\s*=\s*\?/g);
    if (matches) {
      matches.forEach((match, index) => {
        const field = match.split('=')[0].trim();
        conditions[field] = params[index];
      });
    }
    
    return conditions;
  }

  _canUseQuery(tableName, conditions) {
    // Simplified logic to determine if we can use Query instead of Scan
    // This would depend on your table's key schema
    return Object.keys(conditions).includes('id') || 
           Object.keys(conditions).includes('user_id') ||
           Object.keys(conditions).includes('game_id');
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