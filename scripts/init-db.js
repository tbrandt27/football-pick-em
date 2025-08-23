import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import sqlite3 from "sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database initialization for production deployment
async function initializeDatabase() {
  console.log("🗃️  Initializing NFL Pickem database for production...\n");

  const dbPath =
    process.env.DATABASE_PATH || join(__dirname, "../data/database.sqlite");
  const dataDir = dirname(dbPath);

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const db = new sqlite3.Database(dbPath);

  // Promisify database methods
  const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  };

  const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };

  try {
    // Enable foreign keys
    await dbRun("PRAGMA foreign_keys = ON;");

    // Create all tables
    await createTables(dbRun);

    // Seed NFL teams
    await seedTeams(dbRun, dbGet);

    // Create default season
    await createDefaultSeason(dbRun, dbGet);

    // Create admin user
    await createAdminUser(dbRun, dbGet);

    console.log("🎉 Database initialization complete!");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    process.exit(1);
  } finally {
    db.close();
  }
}

async function createTables(dbRun) {
  console.log("📋 Creating database tables...");

  // Users table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      favorite_team_id TEXT,
      is_admin BOOLEAN DEFAULT 0,
      email_verified BOOLEAN DEFAULT 0,
      email_verification_token TEXT,
      password_reset_token TEXT,
      password_reset_expires DATETIME,
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (favorite_team_id) REFERENCES football_teams (id)
    )
  `);

  // Football Teams table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS football_teams (
      id TEXT PRIMARY KEY,
      team_code TEXT UNIQUE NOT NULL,
      team_name TEXT NOT NULL,
      team_city TEXT NOT NULL,
      team_conference TEXT NOT NULL,
      team_division TEXT NOT NULL,
      team_logo TEXT,
      team_primary_color TEXT,
      team_secondary_color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seasons table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY,
      season TEXT UNIQUE NOT NULL,
      is_current BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Pickem Games table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS pickem_games (
      id TEXT PRIMARY KEY,
      game_name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'weekly',
      commissioner_id TEXT NOT NULL,
      season_id TEXT NOT NULL,
      weekly_week INTEGER,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (commissioner_id) REFERENCES users (id),
      FOREIGN KEY (season_id) REFERENCES seasons (id)
    )
  `);

  // Game participants table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS game_participants (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'player')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES pickem_games (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE (game_id, user_id)
    )
  `);

  // Football Games table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS football_games (
      id TEXT PRIMARY KEY,
      season_id TEXT NOT NULL,
      week INTEGER NOT NULL,
      home_team_id TEXT NOT NULL,
      away_team_id TEXT NOT NULL,
      home_score INTEGER DEFAULT 0,
      away_score INTEGER DEFAULT 0,
      game_date DATETIME NOT NULL,
      start_time DATETIME NOT NULL,
      status TEXT DEFAULT 'scheduled',
      season_type INTEGER DEFAULT 2,
      quarter INTEGER,
      time_remaining INTEGER,
      scores_updated_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (season_id) REFERENCES seasons (id),
      FOREIGN KEY (home_team_id) REFERENCES football_teams (id),
      FOREIGN KEY (away_team_id) REFERENCES football_teams (id)
    )
  `);

  // Picks table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS picks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      season_id TEXT NOT NULL,
      week INTEGER NOT NULL,
      football_game_id TEXT NOT NULL,
      pick_team_id TEXT NOT NULL,
      is_correct BOOLEAN DEFAULT NULL,
      tiebreaker INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (game_id) REFERENCES pickem_games (id),
      FOREIGN KEY (season_id) REFERENCES seasons (id),
      FOREIGN KEY (football_game_id) REFERENCES football_games (id),
      FOREIGN KEY (pick_team_id) REFERENCES football_teams (id),
      UNIQUE (user_id, game_id, football_game_id)
    )
  `);

  // Weekly Standings table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS weekly_standings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      season_id TEXT NOT NULL,
      week INTEGER NOT NULL,
      correct_picks INTEGER DEFAULT 0,
      total_picks INTEGER DEFAULT 0,
      pick_percentage REAL DEFAULT 0.0,
      tiebreaker_score INTEGER,
      weekly_rank INTEGER,
      points_earned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (game_id) REFERENCES pickem_games (id),
      FOREIGN KEY (season_id) REFERENCES seasons (id),
      UNIQUE (user_id, game_id, season_id, week)
    )
  `);

  // Game Invitations table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS game_invitations (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      email TEXT NOT NULL,
      invited_by_user_id TEXT NOT NULL,
      invite_token TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending',
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES pickem_games (id),
      FOREIGN KEY (invited_by_user_id) REFERENCES users (id),
      UNIQUE (game_id, email)
    )
  `);

  // System Settings table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      encrypted BOOLEAN DEFAULT 0,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category, key)
    )
  `);

  console.log("✅ Database tables created successfully\n");
}

async function seedTeams(dbRun, dbGet) {
  console.log("🏈 Seeding NFL teams...");

  // Check if teams already exist
  const existingTeam = await dbGet("SELECT id FROM football_teams LIMIT 1");
  if (existingTeam) {
    console.log("ℹ️  NFL teams already exist, skipping seed\n");
    return;
  }

  const teams = [
    // AFC East
    { code: 'BUF', name: 'Bills', city: 'Buffalo', conference: 'AFC', division: 'East', primaryColor: '#00338D', secondaryColor: '#C60C30' },
    { code: 'MIA', name: 'Dolphins', city: 'Miami', conference: 'AFC', division: 'East', primaryColor: '#008E97', secondaryColor: '#FC4C02' },
    { code: 'NE', name: 'Patriots', city: 'New England', conference: 'AFC', division: 'East', primaryColor: '#002244', secondaryColor: '#C60C30' },
    { code: 'NYJ', name: 'Jets', city: 'New York', conference: 'AFC', division: 'East', primaryColor: '#125740', secondaryColor: '#FFFFFF' },
    
    // AFC North
    { code: 'BAL', name: 'Ravens', city: 'Baltimore', conference: 'AFC', division: 'North', primaryColor: '#241773', secondaryColor: '#000000' },
    { code: 'CIN', name: 'Bengals', city: 'Cincinnati', conference: 'AFC', division: 'North', primaryColor: '#FB4F14', secondaryColor: '#000000' },
    { code: 'CLE', name: 'Browns', city: 'Cleveland', conference: 'AFC', division: 'North', primaryColor: '#311D00', secondaryColor: '#FF3C00' },
    { code: 'PIT', name: 'Steelers', city: 'Pittsburgh', conference: 'AFC', division: 'North', primaryColor: '#FFB612', secondaryColor: '#101820' },
    
    // AFC South
    { code: 'HOU', name: 'Texans', city: 'Houston', conference: 'AFC', division: 'South', primaryColor: '#03202F', secondaryColor: '#A71930' },
    { code: 'IND', name: 'Colts', city: 'Indianapolis', conference: 'AFC', division: 'South', primaryColor: '#002C5F', secondaryColor: '#A2AAAD' },
    { code: 'JAX', name: 'Jaguars', city: 'Jacksonville', conference: 'AFC', division: 'South', primaryColor: '#006778', secondaryColor: '#9F792C' },
    { code: 'TEN', name: 'Titans', city: 'Tennessee', conference: 'AFC', division: 'South', primaryColor: '#0C2340', secondaryColor: '#4B92DB' },
    
    // AFC West
    { code: 'DEN', name: 'Broncos', city: 'Denver', conference: 'AFC', division: 'West', primaryColor: '#FB4F14', secondaryColor: '#002244' },
    { code: 'KC', name: 'Chiefs', city: 'Kansas City', conference: 'AFC', division: 'West', primaryColor: '#E31837', secondaryColor: '#FFB81C' },
    { code: 'LV', name: 'Raiders', city: 'Las Vegas', conference: 'AFC', division: 'West', primaryColor: '#000000', secondaryColor: '#A5ACAF' },
    { code: 'LAC', name: 'Chargers', city: 'Los Angeles', conference: 'AFC', division: 'West', primaryColor: '#0080C6', secondaryColor: '#FFC20E' },
    
    // NFC East
    { code: 'DAL', name: 'Cowboys', city: 'Dallas', conference: 'NFC', division: 'East', primaryColor: '#003594', secondaryColor: '#041E42' },
    { code: 'NYG', name: 'Giants', city: 'New York', conference: 'NFC', division: 'East', primaryColor: '#0B2265', secondaryColor: '#A71930' },
    { code: 'PHI', name: 'Eagles', city: 'Philadelphia', conference: 'NFC', division: 'East', primaryColor: '#004C54', secondaryColor: '#A5ACAF' },
    { code: 'WSH', name: 'Commanders', city: 'Washington', conference: 'NFC', division: 'East', primaryColor: '#5A1414', secondaryColor: '#FFB612' },
    
    // NFC North
    { code: 'CHI', name: 'Bears', city: 'Chicago', conference: 'NFC', division: 'North', primaryColor: '#0B162A', secondaryColor: '#C83803' },
    { code: 'DET', name: 'Lions', city: 'Detroit', conference: 'NFC', division: 'North', primaryColor: '#0076B6', secondaryColor: '#B0B7BC' },
    { code: 'GB', name: 'Packers', city: 'Green Bay', conference: 'NFC', division: 'North', primaryColor: '#203731', secondaryColor: '#FFB612' },
    { code: 'MIN', name: 'Vikings', city: 'Minnesota', conference: 'NFC', division: 'North', primaryColor: '#4F2683', secondaryColor: '#FFC62F' },
    
    // NFC South
    { code: 'ATL', name: 'Falcons', city: 'Atlanta', conference: 'NFC', division: 'South', primaryColor: '#A71930', secondaryColor: '#000000' },
    { code: 'CAR', name: 'Panthers', city: 'Carolina', conference: 'NFC', division: 'South', primaryColor: '#0085CA', secondaryColor: '#101820' },
    { code: 'NO', name: 'Saints', city: 'New Orleans', conference: 'NFC', division: 'South', primaryColor: '#D3BC8D', secondaryColor: '#101820' },
    { code: 'TB', name: 'Buccaneers', city: 'Tampa Bay', conference: 'NFC', division: 'South', primaryColor: '#D50A0A', secondaryColor: '#FF7900' },
    
    // NFC West
    { code: 'ARI', name: 'Cardinals', city: 'Arizona', conference: 'NFC', division: 'West', primaryColor: '#97233F', secondaryColor: '#000000' },
    { code: 'LAR', name: 'Rams', city: 'Los Angeles', conference: 'NFC', division: 'West', primaryColor: '#003594', secondaryColor: '#FFA300' },
    { code: 'SF', name: '49ers', city: 'San Francisco', conference: 'NFC', division: 'West', primaryColor: '#AA0000', secondaryColor: '#B3995D' },
    { code: 'SEA', name: 'Seahawks', city: 'Seattle', conference: 'NFC', division: 'West', primaryColor: '#002244', secondaryColor: '#69BE28' }
  ];

  for (const team of teams) {
    const teamId = uuidv4();
    await dbRun(
      `
      INSERT INTO football_teams (id, team_code, team_name, team_city, team_conference, team_division, team_logo, team_primary_color, team_secondary_color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        teamId,
        team.code,
        team.name,
        team.city,
        team.conference,
        team.division,
        `/logos/${team.code}.svg`,
        team.primaryColor,
        team.secondaryColor,
      ]
    );
  }

  console.log("✅ NFL teams seeded successfully\n");
}

async function createDefaultSeason(dbRun, dbGet) {
  console.log("📅 Creating default season...");

  const currentYear = new Date().getFullYear().toString();
  const existingSeason = await dbGet(
    "SELECT id FROM seasons WHERE season = ?",
    [currentYear]
  );

  if (!existingSeason) {
    const seasonId = uuidv4();
    await dbRun(
      `
      INSERT INTO seasons (id, season, is_current)
      VALUES (?, ?, 1)
    `,
      [seasonId, currentYear]
    );

    console.log(`✅ Created ${currentYear} season as current season\n`);
  } else {
    console.log(`ℹ️  Season ${currentYear} already exists\n`);
  }
}

async function createAdminUser(dbRun, dbGet) {
  console.log("👤 Creating admin user...");

  const adminEmail = process.env.ADMIN_EMAIL || "admin@nflpickem.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

  const existingAdmin = await dbGet("SELECT id FROM users WHERE email = ?", [
    adminEmail,
  ]);

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    const adminId = uuidv4();

    await dbRun(
      `
      INSERT INTO users (
        id, email, password, first_name, last_name, is_admin, email_verified
      ) VALUES (?, ?, ?, ?, ?, 1, 1)
    `,
      [adminId, adminEmail, hashedPassword, "Admin", "User"]
    );

    console.log("✅ Admin user created successfully");
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log("   🚨 CHANGE THIS PASSWORD AFTER FIRST LOGIN!\n");
  } else {
    console.log("ℹ️  Admin user already exists\n");
  }
}

// Run initialization
initializeDatabase();
