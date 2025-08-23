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
      console.log(`[DynamoDB:${operationId}] Starting RUN operation:`, typeof operation === 'string' ? operation.substring(0, 200) : operation);
      console.log(`[DynamoDB:${operationId}] RUN params:`, params);
      
      const result = await this._executeOperation(operation, params);
      const duration = Date.now() - startTime;
      
      console.log(`[DynamoDB:${operationId}] RUN completed in ${duration}ms`);
      console.log(`[DynamoDB:${operationId}] RUN result:`, result);
      
      return {
        id: result.id || (result.Attributes && result.Attributes.id),
        changes: 1
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DynamoDB:${operationId}] RUN failed after ${duration}ms:`, error.message);
      console.error(`[DynamoDB:${operationId}] Full error:`, error);
      console.error(`[DynamoDB:${operationId}] Operation details:`, {
        operation: typeof operation === 'string' ? operation.substring(0, 500) : operation,
        params,
        stack: error.stack
      });
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
      
      // Handle COUNT queries - if result has count property, return it directly
      if (result && typeof result === 'object' && 'count' in result && !result.Item && !result.Items) {
        console.log(`[DynamoDB:${operationId}] GET completed in ${duration}ms, COUNT result: ${result.count}`);
        return result;
      }
      
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
    try {
      console.log(`[DynamoDB] _executeOperation called with:`, {
        operationType: typeof operation,
        operation: typeof operation === 'string' ? operation.substring(0, 300) : operation,
        paramsLength: params.length,
        params
      });
      
      // Handle raw SQL strings by parsing them or using operation objects
      if (typeof operation === 'string') {
        return this._executeSQLString(operation, params);
      } else if (typeof operation === 'object') {
        return this._executeOperationObject(operation);
      }
      
      throw new Error(`Unsupported operation type: ${typeof operation}`);
    } catch (error) {
      console.error(`[DynamoDB] _executeOperation error:`, {
        error: error.message,
        operation: typeof operation === 'string' ? operation.substring(0, 300) : operation,
        params,
        stack: error.stack
      });
      throw error;
    }
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
    try {
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
    
    // Check for COUNT queries first
    const countMatch = sql.match(/SELECT\s+COUNT\(\*\)\s+(?:as\s+)?(\w+)?\s+FROM\s+(\w+)/i);
    if (countMatch) {
      const countAlias = countMatch[1] || 'count';
      const tableName = countMatch[2];
      
      console.log(`[DynamoDB] Handling COUNT query for table: ${tableName}`);
      
      // Check for WHERE clause in COUNT query
      const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i);
      
      let result;
      if (whereMatch) {
        const whereClause = whereMatch[1];
        const conditions = this._parseWhereClause(whereClause, params);
        result = await this._dynamoScan(tableName, conditions);
      } else {
        result = await this._dynamoScan(tableName);
      }
      
      // Return count in the expected format
      const count = result.Items ? result.Items.length : 0;
      const countResult = {};
      countResult[countAlias] = count;
      
      console.log(`[DynamoDB] COUNT query result: ${count} items`);
      return countResult;
    }
    
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
      
      // Check if this is a simple GET by primary key (id)
      if (Object.keys(conditions).length === 1 && conditions.id) {
        console.log(`[DynamoDB] Using GET operation for primary key lookup: ${conditions.id}`);
        return this._dynamoGet(tableName, { id: conditions.id });
      }
      
      // Determine if we should use Query or Scan
      // This is simplified - you'd want more sophisticated logic
      if (this._canUseQuery(tableName, conditions)) {
        return this._dynamoQuery(tableName, conditions);
      } else {
        return this._dynamoScan(tableName, conditions);
      }
    } else {
      // No WHERE clause - scan the entire table and handle ORDER BY
      const result = await this._dynamoScan(tableName);
      
      // Handle ORDER BY clause for SCAN operations
      const orderMatch = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
      if (orderMatch && result.Items) {
        try {
          const orderClause = orderMatch[1];
          console.log(`[DynamoDB] Attempting to sort ${result.Items.length} items by: ${orderClause}`);
          result.Items = this._applySorting(result.Items, orderClause);
          console.log(`[DynamoDB] Successfully applied ORDER BY sorting: ${orderClause}`);
        } catch (sortError) {
          console.error(`[DynamoDB] Error applying ORDER BY sorting:`, sortError);
          // Return unsorted results rather than failing completely
        }
      }
      
      return result;
    }
  }

  async _handleInsert(sql, params) {
    // Parse INSERT statement - handle both column list and VALUES
    const tableMatch = sql.match(/INSERT\s+INTO\s+(\w+)/i);
    const columnsMatch = sql.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i);
    const valuesMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
    
    if (!tableMatch) {
      throw new Error('Could not parse table name from INSERT statement');
    }
    
    const tableName = tableMatch[1];
    
    console.log(`[DynamoDB] === INSERT PARSING START ===`);
    console.log(`[DynamoDB] Table: ${tableName}`);
    console.log(`[DynamoDB] Full SQL: ${sql}`);
    console.log(`[DynamoDB] Params:`, params);
    console.log(`[DynamoDB] Table match:`, tableMatch);
    console.log(`[DynamoDB] Columns match:`, columnsMatch);
    console.log(`[DynamoDB] Values match:`, valuesMatch);
    
    // If we have column names and values, map them properly
    if (columnsMatch && valuesMatch) {
      const columnString = columnsMatch[1];
      console.log(`[DynamoDB] Raw column string: "${columnString}"`);
      
      const columns = columnString
        .split(',')
        .map(col => col.trim())
        .filter(col => col.length > 0);
      
      console.log(`[DynamoDB] Parsed columns:`, columns);
      console.log(`[DynamoDB] Column count: ${columns.length}, Param count: ${params.length}`);
      
      const item = {};
      
      // Map parameters to column names
      columns.forEach((column, index) => {
        if (index < params.length) {
          const value = params[index];
          item[column] = value;
          console.log(`[DynamoDB] Mapping column[${index}] "${column}" = ${JSON.stringify(value)} (type: ${typeof value})`);
        } else {
          console.log(`[DynamoDB] WARNING: No parameter for column[${index}] "${column}"`);
        }
      });
      
      console.log(`[DynamoDB] Final mapped item:`, JSON.stringify(item, null, 2));
      
      // Ensure we have an ID
      if (!item.id) {
        const newId = uuidv4();
        item.id = newId;
        console.log(`[DynamoDB] Generated new ID: ${newId}`);
      } else {
        console.log(`[DynamoDB] Using provided ID: ${item.id}`);
      }
      
      // Validate required fields for specific tables
      if (tableName === 'pickem_games') {
        console.log(`[DynamoDB] Validating pickem_games required fields:`);
        console.log(`[DynamoDB] - id: ${item.id ? 'present' : 'MISSING'}`);
        console.log(`[DynamoDB] - game_name: ${item.game_name ? 'present' : 'MISSING'}`);
        
        if (!item.id) {
          throw new Error(`Missing required field 'id' for pickem_games table`);
        }
        if (!item.game_name) {
          throw new Error(`Missing required field 'game_name' for pickem_games table`);
        }
      }
      
      console.log(`[DynamoDB] === INSERT PARSING END - CALLING _dynamoPut ===`);
      return this._dynamoPut(tableName, item);
    } else {
      console.log(`[DynamoDB] No column/values match found - using fallback parsing`);
      
      // Fallback: assume the item is passed as the first parameter (object)
      const item = params[0] || {};
      
      console.log(`[DynamoDB] Fallback item:`, item);
      
      if (!item.id) {
        const newId = uuidv4();
        item.id = newId;
        console.log(`[DynamoDB] Generated fallback ID: ${newId}`);
      }
      
      console.log(`[DynamoDB] === FALLBACK INSERT - CALLING _dynamoPut ===`);
      return this._dynamoPut(tableName, item);
    }
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
    
    console.log(`[DynamoDB] Parsing UPDATE for table: ${tableName}`);
    console.log(`[DynamoDB] SQL: ${sql.substring(0, 200)}`);
    console.log(`[DynamoDB] Params:`, params);
    
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
      console.log(`[DynamoDB] Parsing SET clause: ${setClause}`);
      
      // Split SET clause by commas, but be careful with nested function calls
      const setFields = this._parseSetClause(setClause);
      let paramIndex = 0;
      
      // Count WHERE clause parameters to know how many are left for SET
      const whereParamCount = (whereClause.match(/\?/g) || []).length;
      const setParamCount = params.length - whereParamCount;
      
      console.log(`[DynamoDB] SET parsing details:`, {
        setFields,
        setParamCount,
        whereParamCount,
        totalParams: params.length
      });
      
      setFields.forEach((field, index) => {
        const trimmedField = field.trim();
        
        // Handle datetime('now') patterns
        if (trimmedField.includes("datetime('now')")) {
          const fieldNameMatch = trimmedField.match(/(\w+)\s*=\s*datetime\s*\(\s*['"]now['"]\s*\)/i);
          if (fieldNameMatch) {
            updates[fieldNameMatch[1]] = new Date().toISOString();
            console.log(`[DynamoDB] Mapped datetime('now') for field: ${fieldNameMatch[1]}`);
          }
        }
        // Handle parameter placeholders (?)
        else if (trimmedField.includes('?')) {
          const fieldMatch = trimmedField.match(/(\w+)\s*=\s*\?/);
          if (fieldMatch && paramIndex < setParamCount) {
            const fieldName = fieldMatch[1];
            updates[fieldName] = params[paramIndex];
            console.log(`[DynamoDB] Mapped parameter ${paramIndex} to field: ${fieldName} = ${params[paramIndex]}`);
            paramIndex++;
          }
        }
        // Handle direct string values
        else if (trimmedField.includes('=')) {
          const directMatch = trimmedField.match(/(\w+)\s*=\s*'([^']*)'|(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*(\w+)/);
          if (directMatch) {
            const fieldName = directMatch[1] || directMatch[3] || directMatch[5];
            const fieldValue = directMatch[2] || directMatch[4] || directMatch[6];
            if (fieldName && fieldValue !== undefined) {
              updates[fieldName] = fieldValue;
              console.log(`[DynamoDB] Mapped direct value for field: ${fieldName} = ${fieldValue}`);
            }
          }
        }
      });
    }
    
    console.log(`[DynamoDB] UPDATE parsed:`, {
      tableName,
      key,
      updates,
      whereConditions
    });
    
    return this._dynamoUpdate(tableName, key, updates);
  }

  async _handleDelete(sql, params) {
    // Parse DELETE statement - properly handle WHERE conditions
    const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    const whereMatch = sql.match(/WHERE\s+(.+)$/i);
    
    if (!tableMatch || !whereMatch) {
      throw new Error('Could not parse DELETE statement');
    }
    
    const tableName = tableMatch[1];
    const whereClause = whereMatch[1];
    
    console.log(`[DynamoDB] Parsing DELETE for table: ${tableName}`);
    console.log(`[DynamoDB] SQL: ${sql.substring(0, 200)}`);
    console.log(`[DynamoDB] Params:`, params);
    
    // Parse WHERE clause to extract the key
    const whereConditions = this._parseWhereClause(whereClause, params);
    
    // For DynamoDB, we need the primary key (id)
    const key = {};
    if (whereConditions.id) {
      key.id = whereConditions.id;
    } else {
      throw new Error('DELETE requires id in WHERE clause for DynamoDB');
    }
    
    console.log(`[DynamoDB] DELETE parsed key:`, key);
    
    return this._dynamoDelete(tableName, key);
  }

  _parseSetClause(setClause) {
    // Parse SET clause while respecting function calls like datetime('now')
    const fields = [];
    let current = '';
    let depth = 0;
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < setClause.length; i++) {
      const char = setClause[i];
      
      if (!inQuotes && (char === '"' || char === "'")) {
        inQuotes = true;
        quoteChar = char;
        current += char;
      } else if (inQuotes && char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
        current += char;
      } else if (!inQuotes && char === '(') {
        depth++;
        current += char;
      } else if (!inQuotes && char === ')') {
        depth--;
        current += char;
      } else if (!inQuotes && char === ',' && depth === 0) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      fields.push(current.trim());
    }
    
    return fields;
  }

  _parseWhereClause(whereClause, params) {
    // Enhanced WHERE clause parsing
    const conditions = {};
    
    console.log(`[DynamoDB] Parsing WHERE clause: ${whereClause}`);
    console.log(`[DynamoDB] Available params:`, params);
    
    // Handle simple equality conditions with parameters
    const matches = whereClause.match(/(\w+)\s*=\s*\?/g);
    if (matches) {
      let paramIndex = 0;
      matches.forEach((match) => {
        const field = match.split('=')[0].trim();
        if (paramIndex < params.length) {
          conditions[field] = params[paramIndex];
          paramIndex++;
        }
      });
    }
    
    // Handle direct value conditions (for cases where values are in the SQL)
    const directMatches = whereClause.match(/(\w+)\s*=\s*['"]([^'"]+)['"]|(\w+)\s*=\s*(\d+)/g);
    if (directMatches) {
      directMatches.forEach((match) => {
        const parts = match.split('=').map(p => p.trim());
        if (parts.length === 2) {
          const field = parts[0];
          let value = parts[1];
          // Remove quotes if present
          value = value.replace(/^['"]|['"]$/g, '');
          conditions[field] = value;
        }
      });
    }
    
    console.log(`[DynamoDB] Parsed WHERE conditions:`, conditions);
    
    return conditions;
  }

  _canUseQuery(tableName, conditions) {
    // Simplified logic to determine if we can use Query instead of Scan
    // This would depend on your table's key schema
    // Don't use Query for simple id lookups (use GET instead)
    if (Object.keys(conditions).length === 1 && conditions.id) {
      return false; // Use GET instead
    }
    
    return Object.keys(conditions).includes('user_id') ||
           Object.keys(conditions).includes('game_id');
  }

  // Helper method to sort query results (since DynamoDB doesn't support ORDER BY)
  _applySorting(items, orderClause) {
    try {
      console.log(`[DynamoDB] Parsing ORDER BY clause: "${orderClause}"`);
      
      const orderFields = orderClause.split(',').map(field => {
        const trimmed = field.trim();
        const isDesc = trimmed.toLowerCase().includes('desc');
        const fieldName = trimmed.replace(/\s+(asc|desc)$/i, '').trim();
        console.log(`[DynamoDB] Order field: ${fieldName}, desc: ${isDesc}`);
        return { field: fieldName, desc: isDesc };
      });

      const sortedItems = [...items].sort((a, b) => {
        for (const { field, desc } of orderFields) {
          const aVal = a[field];
          const bVal = b[field];
          
          // Handle null/undefined values
          if (aVal == null && bVal == null) continue;
          if (aVal == null) return desc ? 1 : -1;
          if (bVal == null) return desc ? -1 : 1;
          
          // Convert to string for consistent comparison
          const aStr = String(aVal);
          const bStr = String(bVal);
          
          let comparison = 0;
          if (aStr < bStr) comparison = -1;
          else if (aStr > bStr) comparison = 1;
          
          if (comparison !== 0) {
            return desc ? -comparison : comparison;
          }
        }
        return 0;
      });

      console.log(`[DynamoDB] Sorting complete. Original count: ${items.length}, Sorted count: ${sortedItems.length}`);
      return sortedItems;
    } catch (error) {
      console.error(`[DynamoDB] Error in _applySorting:`, error);
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