import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

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
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        const adminUser = await this.db.get('SELECT id FROM users WHERE email = ?', [adminEmail.toLowerCase()]);
        checks.adminUser = !adminUser;
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
    const adminEmail = process.env.ADMIN_EMAIL || "admin@nflpickem.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

    try {
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
}