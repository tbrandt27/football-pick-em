import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import ESPNService from "./espnApi.js";

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
      const teams = await this.db.all('SELECT * FROM football_teams LIMIT 1');
      checks.teams = !teams || teams.length === 0;
      
      // Check if current season exists
      const currentYear = new Date().getFullYear().toString();
      const season = await this.db.get('SELECT id FROM seasons WHERE season = ?', [currentYear]);
      checks.season = !season;
      
      // Check if admin user exists (using env var email)
      let adminEmail = process.env.ADMIN_EMAIL;
      
      // Handle AWS Secrets Manager placeholders
      if (adminEmail && adminEmail.includes('{{resolve:secretsmanager')) {
        console.log("⚠️  AWS Secrets Manager placeholder detected in admin check, using fallback");
        adminEmail = "admin@nflpickem.com";
      }
      
      if (adminEmail) {
        const adminUser = await this.db.get('SELECT id FROM users WHERE email = ?', [adminEmail.toLowerCase()]);
        checks.adminUser = !adminUser;
        
        // Also check for any users created with placeholder emails and mark for cleanup
        try {
          const allUsers = await this.db.all('SELECT * FROM users');
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
        const anyAdmin = await this.db.get('SELECT id FROM users WHERE is_admin = ? LIMIT 1', [true]);
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
    console.log("🏈 Seeding NFL teams...");
    
    const teams = [
      { code: "ARI", name: "Cardinals", city: "Arizona", conference: "NFC", division: "West" },
      { code: "ATL", name: "Falcons", city: "Atlanta", conference: "NFC", division: "South" },
      { code: "BAL", name: "Ravens", city: "Baltimore", conference: "AFC", division: "North" },
      { code: "BUF", name: "Bills", city: "Buffalo", conference: "AFC", division: "East" },
      { code: "CAR", name: "Panthers", city: "Carolina", conference: "NFC", division: "South" },
      { code: "CHI", name: "Bears", city: "Chicago", conference: "NFC", division: "North" },
      { code: "CIN", name: "Bengals", city: "Cincinnati", conference: "AFC", division: "North" },
      { code: "CLE", name: "Browns", city: "Cleveland", conference: "AFC", division: "North" },
      { code: "DAL", name: "Cowboys", city: "Dallas", conference: "NFC", division: "East" },
      { code: "DEN", name: "Broncos", city: "Denver", conference: "AFC", division: "West" },
      { code: "DET", name: "Lions", city: "Detroit", conference: "NFC", division: "North" },
      { code: "GB", name: "Packers", city: "Green Bay", conference: "NFC", division: "North" },
      { code: "HOU", name: "Texans", city: "Houston", conference: "AFC", division: "South" },
      { code: "IND", name: "Colts", city: "Indianapolis", conference: "AFC", division: "South" },
      { code: "JAX", name: "Jaguars", city: "Jacksonville", conference: "AFC", division: "South" },
      { code: "KC", name: "Chiefs", city: "Kansas City", conference: "AFC", division: "West" },
      { code: "LAC", name: "Chargers", city: "Los Angeles", conference: "AFC", division: "West" },
      { code: "LAR", name: "Rams", city: "Los Angeles", conference: "NFC", division: "West" },
      { code: "LV", name: "Raiders", city: "Las Vegas", conference: "AFC", division: "West" },
      { code: "MIA", name: "Dolphins", city: "Miami", conference: "AFC", division: "East" },
      { code: "MIN", name: "Vikings", city: "Minnesota", conference: "NFC", division: "North" },
      { code: "NE", name: "Patriots", city: "New England", conference: "AFC", division: "East" },
      { code: "NO", name: "Saints", city: "New Orleans", conference: "NFC", division: "South" },
      { code: "NYG", name: "Giants", city: "New York", conference: "NFC", division: "East" },
      { code: "NYJ", name: "Jets", city: "New York", conference: "AFC", division: "East" },
      { code: "PHI", name: "Eagles", city: "Philadelphia", conference: "NFC", division: "East" },
      { code: "PIT", name: "Steelers", city: "Pittsburgh", conference: "AFC", division: "North" },
      { code: "SEA", name: "Seahawks", city: "Seattle", conference: "NFC", division: "West" },
      { code: "SF", name: "49ers", city: "San Francisco", conference: "NFC", division: "West" },
      { code: "TB", name: "Buccaneers", city: "Tampa Bay", conference: "NFC", division: "South" },
      { code: "TEN", name: "Titans", city: "Tennessee", conference: "AFC", division: "South" },
      { code: "WSH", name: "Commanders", city: "Washington", conference: "NFC", division: "East" },
    ];

    let successCount = 0;
    for (const team of teams) {
      try {
        const teamId = uuidv4();
        
        if (this.db.getType() === 'dynamodb') {
          // DynamoDB format
          await this.db.run({
            action: 'put',
            table: 'football_teams',
            item: {
              id: teamId,
              team_code: team.code,
              team_name: team.name,
              team_city: team.city,
              team_conference: team.conference,
              team_division: team.division,
              team_logo: `/logos/${team.code}.svg`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          });
        } else {
          // SQLite format
          await this.db.run(`
            INSERT INTO football_teams (id, team_code, team_name, team_city, team_conference, team_division, team_logo)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [teamId, team.code, team.name, team.city, team.conference, team.division, `/logos/${team.code}.svg`]);
        }
        
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to insert team ${team.code}:`, error.message);
      }
    }

    console.log(`✅ NFL teams seeded: ${successCount}/${teams.length} teams`);
  }

  async createDefaultSeason() {
    console.log("📅 Creating default season...");
    
    const currentYear = new Date().getFullYear().toString();
    const seasonId = uuidv4();

    try {
      if (this.db.getType() === 'dynamodb') {
        // DynamoDB format
        await this.db.run({
          action: 'put',
          table: 'seasons',
          item: {
            id: seasonId,
            season: currentYear,
            is_current: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        });
      } else {
        // SQLite format
        await this.db.run(`
          INSERT INTO seasons (id, season, is_current)
          VALUES (?, ?, 1)
        `, [seasonId, currentYear]);
      }

      console.log(`✅ Created ${currentYear} season as current season`);
    } catch (error) {
      console.error(`❌ Failed to create season: ${error.message}`);
    }
  }

  async createAdminUser() {
    console.log("👤 Creating admin user...");

    // Get admin credentials from environment variables (configured in apprunner.yaml)
    let adminEmail = process.env.ADMIN_EMAIL || "admin@nflpickem.com";
    let adminPassword = process.env.ADMIN_PASSWORD || "admin123";

    // Check if AWS Secrets Manager placeholders weren't resolved
    if (adminEmail.includes('{{resolve:secretsmanager')) {
      console.log("⚠️  AWS Secrets Manager placeholder detected in ADMIN_EMAIL, using fallback");
      adminEmail = "admin@nflpickem.com";
    }
    
    if (adminPassword.includes('{{resolve:secretsmanager')) {
      console.log("⚠️  AWS Secrets Manager placeholder detected in ADMIN_PASSWORD, using fallback");
      adminPassword = "admin123";
    }

    console.log(`📧 Admin email resolved to: ${adminEmail}`);
    console.log(`🔑 Admin password source: ${process.env.ADMIN_PASSWORD ? 'environment variable' : 'fallback default'}`);

    try {
      // First, clean up ALL users with the target email to prevent duplicates
      const allUsers = await this.db.all('SELECT * FROM users');
      const usersToDelete = (allUsers || []).filter(user => {
        return (user.email && user.email.includes('{{resolve:secretsmanager')) ||
               (user.email && user.email.toLowerCase() === adminEmail.toLowerCase());
      });
      
      if (usersToDelete.length > 0) {
        console.log(`🧹 Cleaning up ${usersToDelete.length} existing users with email ${adminEmail} or placeholder emails`);
        
        for (const user of usersToDelete) {
          console.log(`🧹 Removing user: ${user.email} (ID: ${user.id})`);
          if (this.db.getType() === 'dynamodb') {
            await this.db.run({
              action: 'delete',
              table: 'users',
              key: { id: user.id }
            });
          } else {
            await this.db.run('DELETE FROM users WHERE id = ?', [user.id]);
          }
        }
      }

      // Double-check no admin user exists with this email
      const existingAdmin = await this.db.get('SELECT id FROM users WHERE email = ?', [adminEmail.toLowerCase()]);
      if (existingAdmin) {
        console.log(`ℹ️  Admin user with email ${adminEmail} already exists after cleanup, skipping creation`);
        return;
      }

      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      const adminId = uuidv4();

      if (this.db.getType() === 'dynamodb') {
        // DynamoDB format
        await this.db.run({
          action: 'put',
          table: 'users',
          item: {
            id: adminId,
            email: adminEmail.toLowerCase(),
            password: hashedPassword,
            first_name: "Admin",
            last_name: "User",
            is_admin: true,
            email_verified: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
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
        const games = await this.db.all({
          action: 'scan',
          table: 'football_games'
        });
        
        // If no games exist, or very few games (less than expected for a season)
        const gamesCount = games ? games.length : 0;
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
        const seasons = await this.db.all({
          action: 'scan',
          table: 'seasons',
          conditions: { is_current: true }
        });
        currentSeason = seasons && seasons.length > 0 ? seasons[0] : null;
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