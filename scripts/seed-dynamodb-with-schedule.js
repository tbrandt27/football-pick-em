#!/usr/bin/env node

/**
 * Enhanced DynamoDB Seeding Script with NFL Schedule Sync
 * 
 * This script seeds DynamoDB tables with initial data and syncs NFL schedule:
 * - NFL teams
 * - Default season
 * - Admin user
 * - NFL games schedule from ESPN API
 * 
 * Usage:
 *   node scripts/seed-dynamodb-with-schedule.js
 *   
 * Environment Variables:
 *   DATABASE_TYPE=dynamodb (to force DynamoDB)
 *   AWS_REGION=us-east-1 (or your preferred region)
 *   DYNAMODB_TABLE_PREFIX=football_pickem_
 *   ADMIN_EMAIL=admin@example.com
 *   ADMIN_PASSWORD=your_password
 */

import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import DatabaseProviderFactory from "../server/providers/DatabaseProviderFactory.js";
import ESPNService from "../server/services/espnApi.js";

// Load environment variables
dotenv.config();

class DynamoDBSeederWithSchedule {
  constructor() {
    this.db = null;
    this.espnService = ESPNService;
  }

  async initialize() {
    console.log("🗃️  Initializing DynamoDB Seeder with Schedule Sync...\n");
    
    // Force DynamoDB provider
    process.env.DATABASE_TYPE = 'dynamodb';
    
    this.db = await DatabaseProviderFactory.createProvider();
    await this.db.initialize();
    
    console.log("✅ DynamoDB provider initialized\n");
  }

  async seedTeams() {
    console.log("🏈 Seeding NFL teams...");

    // Check if teams already exist using native DynamoDB scan
    try {
      const existingTeamsResult = await this.db._dynamoScan('football_teams');
      if (existingTeamsResult.Items && existingTeamsResult.Items.length > 0) {
        console.log(`ℹ️  NFL teams already exist (${existingTeamsResult.Items.length} teams), skipping seed\n`);
        return;
      }
    } catch (error) {
      console.log("🔍 No existing teams found, proceeding with seed...");
    }

    const teams = [
      // AFC East
      { code: "BUF", name: "Bills", city: "Buffalo", conference: "AFC", division: "East", primaryColor: "#00338D", secondaryColor: "#C60C30" },
      { code: "MIA", name: "Dolphins", city: "Miami", conference: "AFC", division: "East", primaryColor: "#008E97", secondaryColor: "#FC4C02" },
      { code: "NE", name: "Patriots", city: "New England", conference: "AFC", division: "East", primaryColor: "#002244", secondaryColor: "#C60C30" },
      { code: "NYJ", name: "Jets", city: "New York", conference: "AFC", division: "East", primaryColor: "#125740", secondaryColor: "#FFFFFF" },
      
      // AFC North
      { code: "BAL", name: "Ravens", city: "Baltimore", conference: "AFC", division: "North", primaryColor: "#241773", secondaryColor: "#000000" },
      { code: "CIN", name: "Bengals", city: "Cincinnati", conference: "AFC", division: "North", primaryColor: "#FB4F14", secondaryColor: "#000000" },
      { code: "CLE", name: "Browns", city: "Cleveland", conference: "AFC", division: "North", primaryColor: "#311D00", secondaryColor: "#FF3C00" },
      { code: "PIT", name: "Steelers", city: "Pittsburgh", conference: "AFC", division: "North", primaryColor: "#FFB612", secondaryColor: "#101820" },
      
      // AFC South
      { code: "HOU", name: "Texans", city: "Houston", conference: "AFC", division: "South", primaryColor: "#03202F", secondaryColor: "#A71930" },
      { code: "IND", name: "Colts", city: "Indianapolis", conference: "AFC", division: "South", primaryColor: "#002C5F", secondaryColor: "#A2AAAD" },
      { code: "JAX", name: "Jaguars", city: "Jacksonville", conference: "AFC", division: "South", primaryColor: "#006778", secondaryColor: "#9F792C" },
      { code: "TEN", name: "Titans", city: "Tennessee", conference: "AFC", division: "South", primaryColor: "#0C2340", secondaryColor: "#4B92DB" },
      
      // AFC West
      { code: "DEN", name: "Broncos", city: "Denver", conference: "AFC", division: "West", primaryColor: "#FB4F14", secondaryColor: "#002244" },
      { code: "KC", name: "Chiefs", city: "Kansas City", conference: "AFC", division: "West", primaryColor: "#E31837", secondaryColor: "#FFB81C" },
      { code: "LV", name: "Raiders", city: "Las Vegas", conference: "AFC", division: "West", primaryColor: "#000000", secondaryColor: "#A5ACAF" },
      { code: "LAC", name: "Chargers", city: "Los Angeles", conference: "AFC", division: "West", primaryColor: "#0080C6", secondaryColor: "#FFC20E" },
      
      // NFC East
      { code: "DAL", name: "Cowboys", city: "Dallas", conference: "NFC", division: "East", primaryColor: "#003594", secondaryColor: "#041E42" },
      { code: "NYG", name: "Giants", city: "New York", conference: "NFC", division: "East", primaryColor: "#0B2265", secondaryColor: "#A71930" },
      { code: "PHI", name: "Eagles", city: "Philadelphia", conference: "NFC", division: "East", primaryColor: "#004C54", secondaryColor: "#A5ACAF" },
      { code: "WSH", name: "Commanders", city: "Washington", conference: "NFC", division: "East", primaryColor: "#5A1414", secondaryColor: "#FFB612" },
      
      // NFC North
      { code: "CHI", name: "Bears", city: "Chicago", conference: "NFC", division: "North", primaryColor: "#0B162A", secondaryColor: "#C83803" },
      { code: "DET", name: "Lions", city: "Detroit", conference: "NFC", division: "North", primaryColor: "#0076B6", secondaryColor: "#B0B7BC" },
      { code: "GB", name: "Packers", city: "Green Bay", conference: "NFC", division: "North", primaryColor: "#203731", secondaryColor: "#FFB612" },
      { code: "MIN", name: "Vikings", city: "Minnesota", conference: "NFC", division: "North", primaryColor: "#4F2683", secondaryColor: "#FFC62F" },
      
      // NFC South
      { code: "ATL", name: "Falcons", city: "Atlanta", conference: "NFC", division: "South", primaryColor: "#A71930", secondaryColor: "#000000" },
      { code: "CAR", name: "Panthers", city: "Carolina", conference: "NFC", division: "South", primaryColor: "#0085CA", secondaryColor: "#101820" },
      { code: "NO", name: "Saints", city: "New Orleans", conference: "NFC", division: "South", primaryColor: "#D3BC8D", secondaryColor: "#101820" },
      { code: "TB", name: "Buccaneers", city: "Tampa Bay", conference: "NFC", division: "South", primaryColor: "#D50A0A", secondaryColor: "#FF7900" },
      
      // NFC West
      { code: "ARI", name: "Cardinals", city: "Arizona", conference: "NFC", division: "West", primaryColor: "#97233F", secondaryColor: "#000000" },
      { code: "LAR", name: "Rams", city: "Los Angeles", conference: "NFC", division: "West", primaryColor: "#003594", secondaryColor: "#FFA300" },
      { code: "SF", name: "49ers", city: "San Francisco", conference: "NFC", division: "West", primaryColor: "#AA0000", secondaryColor: "#B3995D" },
      { code: "SEA", name: "Seahawks", city: "Seattle", conference: "NFC", division: "West", primaryColor: "#002244", secondaryColor: "#69BE28" }
    ];

    let successCount = 0;
    for (const team of teams) {
      try {
        const teamId = uuidv4();
        const now = new Date().toISOString();
        
        const teamItem = {
          id: teamId,
          team_code: team.code,
          team_name: team.name,
          team_city: team.city,
          team_conference: team.conference,
          team_division: team.division,
          team_logo: `/logos/${team.code}.svg`,
          team_primary_color: team.primaryColor,
          team_secondary_color: team.secondaryColor,
          created_at: now,
          updated_at: now
        };
        
        // Use native DynamoDB PUT operation
        await this.db._dynamoPut('football_teams', teamItem);
        
        successCount++;
        process.stdout.write('.');
      } catch (error) {
        console.error(`\n❌ Failed to insert team ${team.code}:`, error.message);
      }
    }

    console.log(`\n✅ NFL teams seeded successfully (${successCount}/${teams.length} teams)\n`);
  }

  async createDefaultSeason() {
    console.log("📅 Creating default season...");

    const currentYear = new Date().getFullYear().toString();
    
    try {
      // Check if season exists using native DynamoDB scan
      const existingSeasonsResult = await this.db._dynamoScan('seasons', { season: currentYear });
      if (existingSeasonsResult.Items && existingSeasonsResult.Items.length > 0) {
        console.log(`ℹ️  Season ${currentYear} already exists\n`);
        return existingSeasonsResult.Items[0];
      }
    } catch (error) {
      console.log("🔍 No existing season found, creating new season...");
    }

    try {
      const seasonId = uuidv4();
      const now = new Date().toISOString();
      
      const seasonItem = {
        id: seasonId,
        season: currentYear,
        is_current: true,
        created_at: now,
        updated_at: now
      };
      
      await this.db._dynamoPut('seasons', seasonItem);

      console.log(`✅ Created ${currentYear} season as current season\n`);
      return seasonItem;
    } catch (error) {
      console.error(`❌ Failed to create season: ${error.message}\n`);
      throw error;
    }
  }

  async createAdminUser() {
    console.log("👤 Creating admin user...");

    const adminEmail = process.env.ADMIN_EMAIL || "admin@nflpickem.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

    try {
      // Check if admin exists using native DynamoDB scan
      const existingUsersResult = await this.db._dynamoScan('users', { email: adminEmail.toLowerCase() });
      if (existingUsersResult.Items && existingUsersResult.Items.length > 0) {
        console.log("ℹ️  Admin user already exists\n");
        return;
      }
    } catch (error) {
      console.log("🔍 No existing admin found, creating new admin user...");
    }

    try {
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      const adminId = uuidv4();
      const now = new Date().toISOString();

      const adminItem = {
        id: adminId,
        email: adminEmail.toLowerCase(),
        password: hashedPassword,
        first_name: "Admin",
        last_name: "User",
        is_admin: true,
        email_verified: true,
        created_at: now,
        updated_at: now
      };

      await this.db._dynamoPut('users', adminItem);

      console.log("✅ Admin user created successfully");
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Password: ${adminPassword}`);
      console.log("   🚨 CHANGE THIS PASSWORD AFTER FIRST LOGIN!\n");
    } catch (error) {
      console.error(`❌ Failed to create admin user: ${error.message}\n`);
    }
  }

  async syncNFLSchedule(season) {
    console.log("📺 Syncing NFL schedule from ESPN API...");
    
    try {
      // Check if games already exist for this season
      const existingGamesResult = await this.db._dynamoScan('football_games', { season_id: season.id });
      if (existingGamesResult.Items && existingGamesResult.Items.length > 0) {
        console.log(`ℹ️  NFL games already exist for season ${season.season} (${existingGamesResult.Items.length} games)`);
        console.log("   🔄 Updating existing games with latest scores...\n");
        
        // Update scores for existing games
        const result = await this.espnService.updateGameScores();
        console.log(`✅ Updated ${result.length} weeks of games\n`);
        return;
      }
    } catch (error) {
      console.log("🔍 No existing games found, proceeding with full sync...");
    }

    try {
      console.log("📡 Fetching NFL schedule from ESPN API...");
      console.log("   This may take a few minutes as we fetch all weeks...\n");
      
      // Fetch full season schedule (including preseason)
      const result = await this.espnService.updateNFLGames(season.id, null, null);
      
      console.log(`✅ NFL schedule sync completed:`);
      console.log(`   📊 Created: ${result.created} games`);
      console.log(`   🔄 Updated: ${result.updated} games\n`);
      
      return result;
    } catch (error) {
      console.error(`❌ Failed to sync NFL schedule: ${error.message}`);
      console.error("   This might be due to ESPN API rate limiting or network issues.");
      console.error("   You can run the script again later to retry schedule sync.\n");
      // Don't throw error - allow script to continue
    }
  }

  async verifySeeding() {
    console.log("🔍 Verifying seeded data...");

    try {
      const teamsResult = await this.db._dynamoScan('football_teams');
      console.log(`✅ Teams: ${teamsResult.Items ? teamsResult.Items.length : 0} found`);

      const seasonsResult = await this.db._dynamoScan('seasons');
      console.log(`✅ Seasons: ${seasonsResult.Items ? seasonsResult.Items.length : 0} found`);

      const usersResult = await this.db._dynamoScan('users');
      console.log(`✅ Users: ${usersResult.Items ? usersResult.Items.length : 0} found`);
      
      const gamesResult = await this.db._dynamoScan('football_games');
      console.log(`✅ Games: ${gamesResult.Items ? gamesResult.Items.length : 0} found`);
      
      // Show sample data
      if (gamesResult.Items && gamesResult.Items.length > 0) {
        const sampleGame = gamesResult.Items[0];
        console.log(`   Sample game: Week ${sampleGame.week}, ${sampleGame.status}`);
      }
      
      console.log("\n🎉 Data verification complete!");
    } catch (error) {
      console.error("❌ Verification failed:", error.message);
    }
  }

  async close() {
    if (this.db) {
      await this.db.close();
    }
  }

  async run() {
    try {
      await this.initialize();
      await this.seedTeams();
      const season = await this.createDefaultSeason();
      await this.createAdminUser();
      
      // Sync NFL schedule after teams and season are created
      if (season) {
        await this.syncNFLSchedule(season);
      }
      
      await this.verifySeeding();
      
      console.log("🎉 DynamoDB seeding with NFL schedule sync complete!");
      console.log("\n📋 Summary:");
      console.log("   ✅ NFL teams seeded");
      console.log("   ✅ Default season created");
      console.log("   ✅ Admin user created");
      console.log("   ✅ NFL schedule synced from ESPN");
      console.log("\n🚀 Your NFL Pick'em app is ready to use!");
      
    } catch (error) {
      console.error("❌ Seeding failed:", error);
      process.exit(1);
    } finally {
      await this.close();
    }
  }
}

// Run the seeder if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const seeder = new DynamoDBSeederWithSchedule();
  seeder.run().catch(console.error);
}

export default DynamoDBSeederWithSchedule;