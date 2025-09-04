import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

export class DynamoDBHealthCheck {
  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.tablePrefix = process.env.DYNAMODB_TABLE_PREFIX || 'football_pickem_';
    this.client = null;
    this.docClient = null;
    
    // Expected tables for the application
    this.expectedTables = [
      'users',
      'football_teams',
      'pickem_games',
      'game_participants',
      'seasons',
      'football_games',
      'system_settings',
      'picks',
      'weekly_standings',
      'game_invitations'
    ];
  }

  /**
   * Initialize DynamoDB clients
   */
  async initializeClients() {
    try {
      const clientConfig = {
        region: this.region,
        ...(process.env.AWS_ACCESS_KEY_ID && {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          }
        })
      };

      // Add LocalStack endpoint if configured
      if (process.env.USE_LOCALSTACK === 'true' && process.env.LOCALSTACK_ENDPOINT) {
        clientConfig.endpoint = process.env.LOCALSTACK_ENDPOINT;
      }

      this.client = new DynamoDBClient(clientConfig);
      this.docClient = DynamoDBDocumentClient.from(this.client);
      return true;
    } catch (error) {
      console.error('Failed to initialize DynamoDB clients:', error);
      return false;
    }
  }

  /**
   * Test basic DynamoDB connectivity
   */
  async testConnection() {
    const result = {
      success: false,
      region: this.region,
      tablePrefix: this.tablePrefix,
      error: null,
      timestamp: new Date().toISOString()
    };

    try {
      if (!this.client) {
        const initialized = await this.initializeClients();
        if (!initialized) {
          throw new Error('Failed to initialize DynamoDB clients');
        }
      }

      // Test basic connectivity by listing tables
      const command = new ListTablesCommand({});
      const response = await this.client.send(command);
      
      result.success = true;
      result.totalTables = response.TableNames.length;
      result.message = 'Successfully connected to DynamoDB';
      
    } catch (error) {
      result.error = {
        message: error.message,
        code: error.name,
        statusCode: error.$metadata?.httpStatusCode
      };
      result.message = 'Failed to connect to DynamoDB';
    }

    return result;
  }

  /**
   * Verify all required tables exist
   */
  async verifyTables() {
    const result = {
      success: false,
      tables: {},
      missingTables: [],
      error: null,
      timestamp: new Date().toISOString()
    };

    try {
      if (!this.client) {
        const initialized = await this.initializeClients();
        if (!initialized) {
          throw new Error('Failed to initialize DynamoDB clients');
        }
      }

      const command = new ListTablesCommand({});
      const response = await this.client.send(command);
      const existingTables = response.TableNames || [];

      // Check each expected table
      for (const tableName of this.expectedTables) {
        const fullTableName = `${this.tablePrefix}${tableName}`;
        const exists = existingTables.includes(fullTableName);
        
        result.tables[tableName] = {
          fullName: fullTableName,
          exists: exists,
          status: exists ? 'OK' : 'MISSING'
        };

        if (!exists) {
          result.missingTables.push(fullTableName);
        }
      }

      result.success = result.missingTables.length === 0;
      result.message = result.success 
        ? 'All required tables exist'
        : `Missing ${result.missingTables.length} tables`;

    } catch (error) {
      result.error = {
        message: error.message,
        code: error.name,
        statusCode: error.$metadata?.httpStatusCode
      };
      result.message = 'Failed to verify tables';
    }

    return result;
  }

  /**
   * Test read/write operations on a specific table
   */
  async testTableOperations(tableName = 'system_settings') {
    const result = {
      success: false,
      tableName: `${this.tablePrefix}${tableName}`,
      operations: {},
      error: null,
      timestamp: new Date().toISOString()
    };

    try {
      if (!this.docClient) {
        const initialized = await this.initializeClients();
        if (!initialized) {
          throw new Error('Failed to initialize DynamoDB clients');
        }
      }

      const fullTableName = `${this.tablePrefix}${tableName}`;
      
      // Test scan operation (read)
      try {
        const scanCommand = new ScanCommand({
          TableName: fullTableName,
          Limit: 1
        });
        
        const scanResponse = await this.docClient.send(scanCommand);
        result.operations.scan = {
          success: true,
          itemCount: scanResponse.Items?.length || 0,
          scannedCount: scanResponse.ScannedCount || 0
        };
      } catch (scanError) {
        result.operations.scan = {
          success: false,
          error: scanError.message
        };
      }

      // Determine overall success
      result.success = result.operations.scan?.success || false;
      result.message = result.success 
        ? 'Table operations successful'
        : 'Table operations failed';

    } catch (error) {
      result.error = {
        message: error.message,
        code: error.name,
        statusCode: error.$metadata?.httpStatusCode
      };
      result.message = 'Failed to test table operations';
    }

    return result;
  }

  /**
   * Comprehensive health check
   */
  async fullHealthCheck() {
    const startTime = Date.now();
    
    const result = {
      overall: {
        success: false,
        duration: 0,
        timestamp: new Date().toISOString()
      },
      connection: null,
      tables: null,
      operations: null,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        databaseType: process.env.DATABASE_TYPE,
        awsRegion: this.region,
        tablePrefix: this.tablePrefix,
        hasAwsCredentials: !!(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE)
      }
    };

    // Test connection
    result.connection = await this.testConnection();
    
    if (result.connection.success) {
      // Test tables
      result.tables = await this.verifyTables();
      
      if (result.tables.success) {
        // Test operations
        result.operations = await this.testTableOperations();
      }
    }

    // Calculate overall success
    result.overall.success = 
      result.connection.success && 
      result.tables?.success && 
      result.operations?.success;
    
    result.overall.duration = Date.now() - startTime;
    result.overall.message = result.overall.success 
      ? 'DynamoDB is fully operational'
      : 'DynamoDB health check failed';

    return result;
  }

  /**
   * Get DynamoDB configuration info
   */
  getConfigInfo() {
    return {
      region: this.region,
      tablePrefix: this.tablePrefix,
      expectedTables: this.expectedTables.map(table => `${this.tablePrefix}${table}`),
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_TYPE: process.env.DATABASE_TYPE,
        AWS_REGION: process.env.AWS_REGION,
        DYNAMODB_TABLE_PREFIX: process.env.DYNAMODB_TABLE_PREFIX,
        hasAwsAccessKeyId: !!process.env.AWS_ACCESS_KEY_ID,
        hasAwsSecretAccessKey: !!process.env.AWS_SECRET_ACCESS_KEY,
        hasAwsProfile: !!process.env.AWS_PROFILE
      }
    };
  }

  /**
   * Close connections
   */
  close() {
    if (this.client) {
      this.client.destroy();
      this.client = null;
      this.docClient = null;
    }
  }
}

export default DynamoDBHealthCheck;