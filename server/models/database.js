import sqlite3 from "sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
// import databaseSwitcher from "../utils/databaseSwitcher.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getDbPath = () => {
  // Use database switcher with fallback to original path
  try {
    return databaseSwitcher.getCurrentDatabasePath();
  } catch (error) {
    console.warn("Database switcher not available, using default path");
    return (
      process.env.DATABASE_PATH || join(__dirname, "../../database.sqlite")
    );
  }
};

class Database {
  constructor() {
    this.connectToDatabase();
  }

  connectToDatabase() {
    const dbPath = getDbPath();
    console.log(`Connecting to database: ${dbPath}`);

    if (this.db) {
      this.db.close();
    }

    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error("Error opening database:", err.message);
      } else {
        console.log("Connected to SQLite database");
        this.initializeTables();
      }
    });
  }

  // Method to reinitialize database connection (used when switching databases)
  reinitialize() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error("Error closing previous database:", err.message);
          }
          this.connectToDatabase();
          resolve();
        });
      } else {
        this.connectToDatabase();
        resolve();
      }
    });
  }

  initializeTables() {
    // Enable foreign keys
    this.db.exec("PRAGMA foreign_keys = ON;");

    // Users table
    this.db.run(`
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
        FOREIGN KEY (favorite_team_id) REFERENCES nfl_teams (id)
      )
    `);

    // NFL Teams table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS nfl_teams (
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

    // Pickem Games table
    this.db.run(`
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

    // Add missing columns to existing pickem_games table if they don't exist
    this.db.run(`ALTER TABLE pickem_games ADD COLUMN game_name TEXT`, () => {});
    this.db.run(
      `ALTER TABLE pickem_games ADD COLUMN type TEXT DEFAULT 'weekly'`,
      () => {}
    );
    this.db.run(
      `ALTER TABLE pickem_games ADD COLUMN commissioner_id TEXT`,
      () => {}
    );
    this.db.run(`ALTER TABLE pickem_games ADD COLUMN season_id TEXT`, () => {});
    this.db.run(
      `ALTER TABLE pickem_games ADD COLUMN weekly_week INTEGER`,
      () => {}
    );
    this.db.run(
      `ALTER TABLE pickem_games ADD COLUMN is_active BOOLEAN DEFAULT 1`,
      () => {}
    );

    // Game participants (owners and players)
    this.db.run(`
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

    // Season table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS seasons (
        id TEXT PRIMARY KEY,
        season TEXT UNIQUE NOT NULL,
        is_current BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // NFL Games table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS nfl_games (
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (season_id) REFERENCES seasons (id),
        FOREIGN KEY (home_team_id) REFERENCES nfl_teams (id),
        FOREIGN KEY (away_team_id) REFERENCES nfl_teams (id)
      )
    `);

    // Add season_type column to existing nfl_games table if it doesn't exist
    this.db.run(
      `ALTER TABLE nfl_games ADD COLUMN season_type INTEGER DEFAULT 2`,
      () => {}
    );

    // Add scores_updated_at column to track when scores were last fetched from ESPN
    this.db.run(
      `ALTER TABLE nfl_games ADD COLUMN scores_updated_at DATETIME`,
      () => {}
    );

    // System Settings table for admin configuration
    this.db.run(`
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

    // Picks table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS picks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        game_id TEXT NOT NULL,
        season_id TEXT NOT NULL,
        week INTEGER NOT NULL,
        nfl_game_id TEXT NOT NULL,
        pick_team_id TEXT NOT NULL,
        is_correct BOOLEAN DEFAULT NULL,
        tiebreaker INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (game_id) REFERENCES pickem_games (id),
        FOREIGN KEY (season_id) REFERENCES seasons (id),
        FOREIGN KEY (nfl_game_id) REFERENCES nfl_games (id),
        FOREIGN KEY (pick_team_id) REFERENCES nfl_teams (id),
        UNIQUE (user_id, game_id, nfl_game_id)
      )
    `);

    // Weekly Standings table
    this.db.run(`
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
    this.db.run(`
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

    console.log("Database tables initialized");
  }

  // Helper method to run queries with promises
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // Helper method to get single row
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Helper method to get all rows
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) {
          console.error("Error closing database:", err.message);
        } else {
          console.log("Database connection closed");
        }
        resolve();
      });
    });
  }
}

// Create singleton instance
const db = new Database();

export default db;
