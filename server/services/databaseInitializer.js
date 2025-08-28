import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import ESPNService from "./espnApi.js";
import configService from "./configService.js";

/**
 * Database Initializer Service
 * 
 * Automatically checks and seeds the database on application startup
 * - Checks for NFL teams and seeds if missing
 * - Checks for admin user (from env vars) and creates if missing
 * - Creates default season if missing
 */
export default class DatabaseInitializer {
  constructor(db) {
    this.db = db;
  }

  async initialize() {
    console.log("🔍 Checking database initialization status...");
    
    try {
      const needsSeeding = await this.checkIfSeedingNeeded();
      const needsSchedule = await this.checkIfScheduleSyncNeeded();
      
      if (needsSeeding.teams || needsSeeding.adminUser || needsSeeding.season) {
        console.log("🌱 Database needs seeding, starting initialization...");
        
        if (needsSeeding.teams) {
          await this.seedTeams();
        }
        
        if (needsSeeding.season) {
          await this.createDefaultSeason();
        }
        
        if (needsSeeding.adminUser) {
          await this.createAdminUser();
        }
        
        console.log("✅ Database initialization complete!");
      } else {
        console.log("✅ Database already initialized, skipping seeding");
      }
      
      // Check if NFL schedule sync is needed (especially for DynamoDB)
      if (needsSchedule) {
        await this.syncNFLSchedule();
      }
      
    } catch (error) {
      console.error("❌ Database initialization failed:", error);
      // Don't throw error to prevent app from failing to start
      // Log the error and continue - the app can still run without seeding
    }
  }

  async checkIfSeedingNeeded() {
    const checks = {
      teams: false,
      adminUser: false,
      season: false
    };

    try {
      // Check if teams exist
      let teams;
      if (this.db.getType() === 'dynamodb') {
        const teamsResult = await this.db._dynamoScan('football_teams');
        teams = teamsResult?.Items || [];
      } else {
        teams = await this.db.all('SELECT * FROM football_teams LIMIT 1');
      }
      checks.teams = !teams || teams.length === 0;
      
      // Check if current season exists
      const currentYear = new Date().getFullYear().toString();
      let season;
      if (this.db.getType() === 'dynamodb') {
        const seasonsResult = await this.db._dynamoScan('seasons', { season: currentYear });
        season = seasonsResult?.Items?.[0] || null;
      } else {
        season = await this.db.get('SELECT id FROM seasons WHERE season = ?', [currentYear]);
      }
      checks.season = !season;
      
      // Check if admin user exists (try Secrets Manager first in production)
      let adminEmail;
      
      // Get admin email using the config service
      adminEmail = configService.getAdminEmail();
      
      if (adminEmail) {
        let adminUser;
        if (this.db.getType() === 'dynamodb') {
          const usersResult = await this.db._dynamoScan('users', { email: adminEmail.toLowerCase() });
          adminUser = usersResult?.Items?.[0] || null;
        } else {
          adminUser = await this.db.get('SELECT id FROM users WHERE email = ?', [adminEmail.toLowerCase()]);
        }
        checks.adminUser = !adminUser;
        
        // Also check for any users created with placeholder emails and mark for cleanup
        try {
          let allUsers;
          if (this.db.getType() === 'dynamodb') {
            const usersResult = await this.db._dynamoScan('users');
            allUsers = usersResult?.Items || [];
          } else {
            allUsers = await this.db.all('SELECT * FROM users');
          }
          
          const placeholderUser = (allUsers || []).find(user =>
            user.email && user.email.includes('{{resolve:secretsmanager')
          );
          if (placeholderUser) {
            console.log("🧹 Found user with placeholder email, will clean up during seeding");
            checks.adminUser = true; // Force admin user recreation
          }
        } catch (error) {
          console.log("Note: Could not check for placeholder users");
        }
      } else {
        // If no admin email env var, check for any admin user
        let anyAdmin;
        if (this.db.getType() === 'dynamodb') {
          const usersResult = await this.db._dynamoScan('users', { is_admin: true });
          anyAdmin = usersResult?.Items?.[0] || null;
        } else {
          anyAdmin = await this.db.get('SELECT id FROM users WHERE is_admin = ? LIMIT 1', [true]);
        }
        checks.adminUser = !anyAdmin;
      }

      console.log("🔍 Database status check:", {
        needsTeams: checks.teams,
        needsAdminUser: checks.adminUser,
        needsSeason: checks.season,
        adminEmail: adminEmail || "Not configured"
      });

    } catch (error) {
      console.error("❌ Failed to check database status:", error);
      // If we can't check, assume we need seeding
      return { teams: true, adminUser: true, season: true };
    }

    return checks;
  }

  async seedTeams() {
    console.log("🏈 Seeding NFL teams using proper seeding logic...");
    
    try {
      // Use the comprehensive seedTeams function with robust duplicate detection
      const { seedTeams } = await import('../utils/seedTeams.js');
      await seedTeams();
      console.log("✅ NFL teams seeded successfully with proper duplicate detection");
    } catch (error) {
      console.error(`❌ Failed to seed teams: ${error.message}`);
      // Don't throw - allow app to continue starting even if team seeding fails
    }
  }

  async createDefaultSeason() {
    console.log("📅 Creating default season...");
    
    const currentYear = new Date().getFullYear().toString();

    try {
      // Import DatabaseServiceFactory to use proper season service
      const { default: DatabaseServiceFactory } = await import('./database/DatabaseServiceFactory.js');
      const seasonService = DatabaseServiceFactory.getSeasonService();

      // Check if season already exists using the service layer
      const existingSeason = await seasonService.getSeasonByYear(currentYear);
      if (existingSeason) {
        console.log(`ℹ️  Season ${currentYear} already exists, skipping creation`);
        return;
      }

      // Use the season service to create the season (with duplicate prevention)
      const newSeason = await seasonService.createSeason({
        season: currentYear,
        isCurrent: true
      });

      console.log(`✅ Created ${currentYear} season as current season (ID: ${newSeason.id})`);
    } catch (error) {
      if (error.message.includes('Season already exists')) {
        console.log(`ℹ️  Season ${currentYear} already exists, skipping creation`);
      } else {
        console.error(`❌ Failed to create season: ${error.message}`);
      }
    }
  }

  async createAdminUser() {
    console.log("👤 Creating admin user...");

    // Get admin credentials using the config service
    const adminEmail = configService.getAdminEmail();
    const adminPassword = configService.getAdminPassword();

    console.log(`📧 Admin email resolved to: ${adminEmail}`);
    console.log(`🔑 Admin password source: ${configService.isInitialized() ? 'Configuration service' : 'fallback values'}`);

    try {
      // First, clean up ALL users with the target email to prevent duplicates
      let allUsers;
      if (this.db.getType() === 'dynamodb') {
        const usersResult = await this.db._dynamoScan('users');
        allUsers = usersResult?.Items || [];
      } else {
        allUsers = await this.db.all('SELECT * FROM users');
      }
      
      const usersToDelete = (allUsers || []).filter(user => {
        return (user.email && user.email.includes('{{resolve:secretsmanager')) ||
               (user.email && user.email.toLowerCase() === adminEmail.toLowerCase());
      });
      
      if (usersToDelete.length > 0) {
        console.log(`🧹 Cleaning up ${usersToDelete.length} existing users with email ${adminEmail} or placeholder emails`);
        
        for (const user of usersToDelete) {
          console.log(`🧹 Removing user: ${user.email} (ID: ${user.id})`);
          if (this.db.getType() === 'dynamodb') {
            await this.db._dynamoDelete('users', { id: user.id });
          } else {
            await this.db.run('DELETE FROM users WHERE id = ?', [user.id]);
          }
        }
      }

      // Double-check no admin user exists with this email
      let existingAdmin;
      if (this.db.getType() === 'dynamodb') {
        const usersResult = await this.db._dynamoScan('users', { email: adminEmail.toLowerCase() });
        existingAdmin = usersResult?.Items?.[0] || null;
      } else {
        existingAdmin = await this.db.get('SELECT id FROM users WHERE email = ?', [adminEmail.toLowerCase()]);
      }
      
      if (existingAdmin) {
        console.log(`ℹ️  Admin user with email ${adminEmail} already exists after cleanup, skipping creation`);
        return;
      }

      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      const adminId = uuidv4();

      if (this.db.getType() === 'dynamodb') {
        // DynamoDB format
        await this.db._dynamoPut('users', {
          id: adminId,
          email: adminEmail.toLowerCase(),
          password: hashedPassword,
          first_name: "Admin",
          last_name: "User",
          is_admin: true,
          email_verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } else {
        // SQLite format
        await this.db.run(`
          INSERT INTO users (
            id, email, password, first_name, last_name, is_admin, email_verified
          ) VALUES (?, ?, ?, ?, ?, 1, 1)
        `, [adminId, adminEmail.toLowerCase(), hashedPassword, "Admin", "User"]);
      }

      console.log("✅ Admin user created successfully");
      console.log(`   Email: ${adminEmail}`);
      console.log("   Password: [from environment variables]");
      
      if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
        console.log("   🚨 Using default credentials - configure ADMIN_EMAIL and ADMIN_PASSWORD env vars!");
      }
    } catch (error) {
      console.error(`❌ Failed to create admin user: ${error.message}`);
    }
  }

  async checkIfScheduleSyncNeeded() {
    // Check if NFL games exist for current season
    try {
      const currentYear = new Date().getFullYear().toString();
      
      if (this.db.getType && this.db.getType() === 'dynamodb') {
        // For DynamoDB, check if we have games
        const gamesResult = await this.db._dynamoScan('football_games');
        const games = gamesResult?.Items || [];
        
        // If no games exist, or very few games (less than expected for a season)
        const gamesCount = games.length;
        const minExpectedGames = 250; // Roughly 16 teams * 17 weeks
        
        if (gamesCount < minExpectedGames) {
          console.log(`🔍 Found ${gamesCount} games, expected at least ${minExpectedGames}. Schedule sync needed.`);
          return true;
        }
        
        console.log(`✅ Found ${gamesCount} games, schedule sync not needed.`);
        return false;
      } else {
        // For SQLite, check normally
        const gamesCount = await this.db.get('SELECT COUNT(*) as count FROM football_games');
        const count = gamesCount?.count || 0;
        const minExpectedGames = 250;
        
        if (count < minExpectedGames) {
          console.log(`🔍 Found ${count} games, expected at least ${minExpectedGames}. Schedule sync needed.`);
          return true;
        }
        
        console.log(`✅ Found ${count} games, schedule sync not needed.`);
        return false;
      }
    } catch (error) {
      console.log("🔍 Could not check game count, assuming schedule sync needed");
      return true; // If we can't check, assume we need sync
    }
  }

  async syncNFLSchedule() {
    console.log("📺 Syncing NFL schedule from ESPN API...");
    
    try {
      // Get current season
      let currentSeason;
      const currentYear = new Date().getFullYear().toString();
      
      if (this.db.getType && this.db.getType() === 'dynamodb') {
        const seasonsResult = await this.db._dynamoScan('seasons', { is_current: true });
        const seasons = seasonsResult?.Items || [];
        currentSeason = seasons.length > 0 ? seasons[0] : null;
      } else {
        currentSeason = await this.db.get('SELECT * FROM seasons WHERE is_current = 1');
      }
      
      if (!currentSeason) {
        console.log("⚠️  No current season found, skipping schedule sync");
        return;
      }
      
      console.log(`📡 Fetching NFL schedule for ${currentSeason.season} season...`);
      
      // Use ESPN service to sync schedule
      const result = await ESPNService.updateNFLGames(currentSeason.id, null, null);
      
      console.log(`✅ NFL schedule sync completed:`);
      console.log(`   📊 Created: ${result.created} games`);
      console.log(`   🔄 Updated: ${result.updated} games`);
      
    } catch (error) {
      console.error(`❌ Failed to sync NFL schedule: ${error.message}`);
      console.error("   This might be due to ESPN API rate limiting or network issues.");
      console.error("   The app will continue to work, but games may need manual sync later.");
      // Don't throw error - allow app to continue starting
    }
  }
}