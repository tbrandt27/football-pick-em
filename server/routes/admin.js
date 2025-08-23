import express from "express";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { seedTeams, updateTeamLogos } from "../utils/seedTeams.js";
import espnService from "../services/espnApi.js";
import scheduler from "../services/scheduler.js";
import pickCalculator from "../services/pickCalculator.js";
import onDemandUpdates from "../services/onDemandUpdates.js";
import db from "../models/database.js";
import crypto from "crypto";
import emailService from "../services/emailService.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

// Get admin dashboard stats
router.get("/stats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [userCount, gameCount, teamCount, seasonCount] = await Promise.all([
      db.get("SELECT COUNT(*) as count FROM users"),
      db.get("SELECT COUNT(*) as count FROM pickem_games"),
      db.get("SELECT COUNT(*) as count FROM football_teams"),
      db.get("SELECT COUNT(*) as count FROM seasons"),
    ]);

    res.json({
      stats: {
        users: userCount?.count || 0,
        games: gameCount?.count || 0,
        teams: teamCount?.count || 0,
        seasons: seasonCount?.count || 0,
      },
    });
  } catch (error) {
    console.error("Get admin stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Seed NFL teams
router.post(
  "/seed-teams",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      await seedTeams();
      res.json({ message: "NFL teams seeded successfully" });
    } catch (error) {
      console.error("Seed teams error:", error);
      res.status(500).json({ error: "Failed to seed teams" });
    }
  }
);

// Update team logos
router.post(
  "/update-team-logos",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      await updateTeamLogos();
      res.json({ message: "Team logos updated successfully" });
    } catch (error) {
      console.error("Update team logos error:", error);
      res.status(500).json({ error: "Failed to update team logos" });
    }
  }
);


// Get available team logos
router.get("/team-logos", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Use exact same logic as the working /logos/:filename route in server/index.js
    const explicitLogosPath = process.env.LOGOS_PATH;
    
    const possibleLogoPaths = explicitLogosPath ? [explicitLogosPath] : [
      // Standard relative path from current working directory
      path.join(process.cwd(), "public/logos"),
      // Path relative to server directory structure
      path.join(__dirname, "../public/logos"),
      path.join(__dirname, "../../public/logos"),
      // Path relative to project root in different deployment scenarios
      path.join(process.env.APP_ROOT || process.cwd(), "public/logos"),
      "/app/public/logos", // Common Docker path
      "/var/app/current/public/logos", // AWS App Runner path
      // Additional AWS App Runner paths
      path.join(process.cwd(), "../public/logos"),
      path.join(process.cwd(), "dist/client/logos"),
      path.join(__dirname, "../../dist/client/logos"),
      // Try relative to the built client directory
      path.join(process.cwd(), "dist/public/logos"),
      path.join(__dirname, "../dist/public/logos"),
    ];

    let logosPath = null;
    for (const testPath of possibleLogoPaths) {
      if (fs.existsSync(testPath)) {
        logosPath = testPath;
        console.log(`Admin API: Found logos directory at ${testPath}`);
        break;
      }
    }

    if (!logosPath) {
      console.error("Admin API: Logos directory not found. Tried paths:", possibleLogoPaths);
      return res.status(404).json({
        error: "Logos directory not found",
        triedPaths: possibleLogoPaths,
        debugInfo: {
          cwd: process.cwd(),
          __dirname,
          envLogosPath: process.env.LOGOS_PATH,
          envAppRoot: process.env.APP_ROOT,
          nodeEnv: process.env.NODE_ENV
        },
        note: "Individual logos may still work via direct URL"
      });
    }

    const logoFiles = fs
      .readdirSync(logosPath)
      .filter((file) => file.endsWith(".svg"))
      .sort();

    console.log(`Admin API: Found ${logoFiles.length} logo files in ${logosPath}`);
    res.json({ logos: logoFiles });
  } catch (error) {
    console.error("Admin API: Get team logos error:", error);
    res
      .status(500)
      .json({ error: `Failed to get team logos: ${error.message}` });
  }
});

// Debug endpoint to help troubleshoot logos directory issues in production
router.get("/debug/paths", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const debugInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      cwd: process.cwd(),
      __filename,
      __dirname,
      envAppRoot: process.env.APP_ROOT,
      envLogosPath: process.env.LOGOS_PATH,
    };

    // Test all possible paths
    const possiblePaths = [
      path.join(process.cwd(), "public/logos"),
      path.join(__dirname, "../../public/logos"),
      path.join(__dirname, "../../../public/logos"),
      path.resolve("public/logos"),
      path.resolve("./public/logos"),
      path.join(process.env.APP_ROOT || process.cwd(), "public/logos"),
      "/app/public/logos",
      "/var/app/current/public/logos",
    ];

    const pathTests = [];
    for (const testPath of possiblePaths) {
      try {
        const exists = fs.existsSync(testPath);
        const result = { path: testPath, exists };
        
        if (exists) {
          try {
            const contents = fs.readdirSync(testPath);
            result.contents = contents.slice(0, 10); // Limit to first 10 items
            result.svgCount = contents.filter(f => f.endsWith('.svg')).length;
          } catch (err) {
            result.error = err.message;
          }
        }
        
        pathTests.push(result);
      } catch (err) {
        pathTests.push({ path: testPath, exists: false, error: err.message });
      }
    }

    // Check if public directory exists
    const publicDirTests = [
      path.join(process.cwd(), "public"),
      path.join(__dirname, "../../public"),
      "/app/public",
      "/var/app/current/public",
    ];

    const publicTests = [];
    for (const testPath of publicDirTests) {
      try {
        const exists = fs.existsSync(testPath);
        const result = { path: testPath, exists };
        
        if (exists) {
          try {
            const contents = fs.readdirSync(testPath);
            result.contents = contents;
          } catch (err) {
            result.error = err.message;
          }
        }
        
        publicTests.push(result);
      } catch (err) {
        publicTests.push({ path: testPath, exists: false, error: err.message });
      }
    }

    res.json({
      debugInfo,
      pathTests,
      publicTests,
    });
  } catch (error) {
    console.error("Debug paths error:", error);
    res.status(500).json({ error: `Debug error: ${error.message}` });
  }
});

// Sync NFL schedule from ESPN
router.post("/sync-espn", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { seasonId, week } = req.body;

    if (!seasonId) {
      return res.status(400).json({ error: "Season ID is required" });
    }

    // Verify season exists
    const season = await db.get("SELECT * FROM seasons WHERE id = ?", [
      seasonId,
    ]);
    if (!season) {
      return res.status(404).json({ error: "Season not found" });
    }

    const result = await espnService.updateNFLGames(seasonId, week);

    res.json({
      message: `ESPN sync completed for ${season.season}${
        week ? ` week ${week}` : ""
      }`,
      ...result,
    });
  } catch (error) {
    console.error("ESPN sync error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to sync with ESPN" });
  }
});

// Update current week scores
router.post(
  "/update-scores",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const results = await espnService.updateGameScores();

      res.json({
        message: "Game scores updated successfully",
        results,
      });
    } catch (error) {
      console.error("Update scores error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to update scores" });
    }
  }
);

// Get all users (for user management)
router.get("/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.all(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.is_admin,
        u.email_verified,
        u.last_login,
        u.created_at,
        COUNT(gp.id) as game_count
      FROM users u
      LEFT JOIN game_participants gp ON u.id = gp.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    res.json({ users });
  } catch (error) {
    console.error("Get admin users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all pending invitations
router.get(
  "/invitations",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const invitations = await db.all(`
      SELECT 
        gi.id,
        gi.email,
        gi.status,
        gi.expires_at,
        gi.created_at,
        g.name as game_name,
        u.first_name || ' ' || u.last_name as invited_by_name
      FROM game_invitations gi
      LEFT JOIN pickem_games g ON gi.game_id = g.id
      LEFT JOIN users u ON gi.invited_by_user_id = u.id
      WHERE gi.status = 'pending' AND gi.expires_at > datetime('now')
      ORDER BY gi.created_at DESC
    `);

      res.json({ invitations });
    } catch (error) {
      console.error("Get admin invitations error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Cancel invitation
router.delete(
  "/invitations/:invitationId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { invitationId } = req.params;

      const invitation = await db.get(
        "SELECT email FROM game_invitations WHERE id = ?",
        [invitationId]
      );
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      await db.run(
        `
      UPDATE game_invitations 
      SET status = 'cancelled', updated_at = datetime('now')
      WHERE id = ?
    `,
        [invitationId]
      );

      res.json({
        message: `Invitation for ${invitation.email} cancelled successfully`,
      });
    } catch (error) {
      console.error("Cancel invitation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get all games (for game management)
router.get("/games", authenticateToken, requireAdmin, async (req, res) => {
  try {
    // First, let's migrate any games that might have NULL names or commissioner_ids
    await migrateGameData();

    // Handle different database types
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, we need to do separate queries and aggregate in JavaScript
      const games = await db.all('SELECT * FROM pickem_games ORDER BY created_at DESC');
      
      // For each game, get the additional data
      const gamesWithDetails = await Promise.all(games.map(async (game) => {
        // Get commissioner name
        let commissioner_name = 'Unknown';
        if (game.commissioner_id) {
          const commissioner = await db.get('SELECT first_name, last_name FROM users WHERE id = ?', [game.commissioner_id]);
          if (commissioner) {
            commissioner_name = `${commissioner.first_name} ${commissioner.last_name}`;
          }
        }
        
        // Get season info
        let season_year = null;
        let season_is_current = false;
        if (game.season_id) {
          const season = await db.get('SELECT season, is_current FROM seasons WHERE id = ?', [game.season_id]);
          if (season) {
            season_year = season.season;
            season_is_current = Boolean(season.is_current);
          }
        }
        
        // Get participant count
        const participants = await db.all('SELECT id FROM game_participants WHERE game_id = ?', [game.id]);
        const participant_count = participants.length;
        
        return {
          ...game,
          name: game.game_name || 'Unnamed Game',
          commissioner_name,
          season_year,
          season_is_current,
          participant_count
        };
      }));
      
      res.json({ games: gamesWithDetails });
    } else {
      // For SQLite, use the optimized JOIN query
      const games = await db.all(`
        SELECT
          g.*,
          COALESCE(g.game_name, 'Unnamed Game') as name,
          u.first_name || ' ' || u.last_name as commissioner_name,
          s.season as season_year,
          s.is_current as season_is_current,
          COUNT(DISTINCT gp.id) as participant_count
        FROM pickem_games g
        LEFT JOIN users u ON g.commissioner_id = u.id
        LEFT JOIN seasons s ON g.season_id = s.id
        LEFT JOIN game_participants gp ON g.id = gp.game_id
        GROUP BY g.id
        ORDER BY g.created_at DESC
      `);

      res.json({ games });
    }
  } catch (error) {
    console.error("Get admin games error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Helper function to migrate old game data
async function migrateGameData() {
  try {
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, handle migrations differently
      const games = await db.all('SELECT * FROM pickem_games');
      
      for (const game of games) {
        let needsUpdate = false;
        const updates = {};
        
        // Fix missing game_name
        if (!game.game_name || game.game_name === '') {
          if (game.type === 'weekly' && game.weekly_week) {
            updates.game_name = `Week ${game.weekly_week} Picks`;
          } else if (game.type === 'survivor') {
            updates.game_name = 'Survivor Pool';
          } else {
            updates.game_name = 'Pick\'em Game';
          }
          needsUpdate = true;
        }
        
        // Fix missing is_active
        if (game.is_active === null || game.is_active === undefined) {
          updates.is_active = true;
          needsUpdate = true;
        }
        
        // Fix missing commissioner_id
        if (!game.commissioner_id || game.commissioner_id === '') {
          // Find first admin user
          const adminUsers = await db.all('SELECT id FROM users WHERE is_admin = ? LIMIT 1', [true]);
          if (adminUsers && adminUsers.length > 0) {
            updates.commissioner_id = adminUsers[0].id;
            needsUpdate = true;
          } else {
            // Find any user
            const anyUsers = await db.all('SELECT id FROM users LIMIT 1');
            if (anyUsers && anyUsers.length > 0) {
              updates.commissioner_id = anyUsers[0].id;
              needsUpdate = true;
            }
          }
        }
        
        if (needsUpdate) {
          await db.run({
            action: 'update',
            table: 'pickem_games',
            key: { id: game.id },
            item: updates
          });
        }
      }
    } else {
      // For SQLite, use SQL queries
      // Update games with NULL game_name
      await db.run(`
        UPDATE pickem_games
        SET game_name = CASE
          WHEN type = 'weekly' AND weekly_week IS NOT NULL THEN 'Week ' || weekly_week || ' Picks'
          WHEN type = 'survivor' THEN 'Survivor Pool'
          ELSE 'Pick''em Game'
        END
        WHERE game_name IS NULL OR game_name = ''
      `);

      // Update games with NULL is_active - set to active by default
      await db.run(`
        UPDATE pickem_games
        SET is_active = 1
        WHERE is_active IS NULL
      `);

      // Update games with NULL commissioner_id - set to first admin user
      const firstAdmin = await db.get(
        "SELECT id FROM users WHERE is_admin = 1 LIMIT 1"
      );

      if (firstAdmin) {
        await db.run(
          `
          UPDATE pickem_games
          SET commissioner_id = ?
          WHERE commissioner_id IS NULL OR commissioner_id = ''
        `,
          [firstAdmin.id]
        );
      } else {
        // If no admin user, try to find any user
        const anyUser = await db.get("SELECT id FROM users LIMIT 1");
        if (anyUser) {
          await db.run(
            `
            UPDATE pickem_games
            SET commissioner_id = ?
            WHERE commissioner_id IS NULL OR commissioner_id = ''
          `,
            [anyUser.id]
          );
        }
      }
    }
  } catch (error) {
    console.error("Game data migration error:", error);
  }
}

// Delete game (admin override)
router.delete(
  "/games/:gameId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { gameId } = req.params;

      const game = await db.get(
        "SELECT game_name FROM pickem_games WHERE id = ?",
        [gameId]
      );
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Delete related records manually to handle foreign key constraints
      await db.run("DELETE FROM picks WHERE game_id = ?", [gameId]);
      await db.run("DELETE FROM weekly_standings WHERE game_id = ?", [gameId]);
      await db.run("DELETE FROM game_invitations WHERE game_id = ?", [gameId]);
      await db.run("DELETE FROM game_participants WHERE game_id = ?", [gameId]);
      
      // Finally delete the game itself
      await db.run("DELETE FROM pickem_games WHERE id = ?", [gameId]);

      res.json({
        message: `Game "${game.game_name}" deleted successfully`,
      });
    } catch (error) {
      console.error("Delete game error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update user admin status
router.put(
  "/users/:userId/admin",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { isAdmin } = req.body;

      // Don't allow removing admin from self
      if (userId === req.user.id && !isAdmin) {
        return res
          .status(400)
          .json({ error: "Cannot remove admin status from yourself" });
      }

      await db.run(
        `
      UPDATE users 
      SET is_admin = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
        [isAdmin ? 1 : 0, userId]
      );

      res.json({ message: "User admin status updated successfully" });
    } catch (error) {
      console.error("Update user admin error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Delete user (admin only)
router.delete(
  "/users/:userId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Don't allow deleting yourself
      if (userId === req.user.id) {
        return res
          .status(400)
          .json({ error: "Cannot delete your own account" });
      }

      // Get user info before deletion
      const user = await db.get(
        "SELECT first_name, last_name, email FROM users WHERE id = ?",
        [userId]
      );
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Delete related records manually to handle foreign key constraints
      // Delete picks first
      await db.run("DELETE FROM picks WHERE user_id = ?", [userId]);
      
      // Delete weekly standings
      await db.run("DELETE FROM weekly_standings WHERE user_id = ?", [userId]);
      
      // Delete game invitations
      await db.run("DELETE FROM game_invitations WHERE invited_by_user_id = ? OR email = ?", [userId, user.email]);
      
      // Remove from game participants
      await db.run("DELETE FROM game_participants WHERE user_id = ?", [userId]);
      
      // Update games where this user was commissioner (set to the requesting admin)
      await db.run("UPDATE pickem_games SET commissioner_id = ? WHERE commissioner_id = ?", [req.user.id, userId]);
      
      // Finally delete the user
      await db.run("DELETE FROM users WHERE id = ?", [userId]);

      res.json({
        message: `User "${user.first_name} ${user.last_name}" (${user.email}) deleted successfully`,
      });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get all seasons (for season management)
router.get("/seasons", authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Handle different database types
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, we need to do separate queries and aggregate in JavaScript
      const seasons = await db.all('SELECT * FROM seasons ORDER BY season DESC');
      
      // For each season, get the game counts
      const seasonsWithCounts = await Promise.all(seasons.map(async (season) => {
        // Get pickem game count
        const pickemGames = await db.all('SELECT id FROM pickem_games WHERE season_id = ?', [season.id]);
        const game_count = pickemGames.length;
        
        // Get football game count
        const footballGames = await db.all('SELECT id FROM football_games WHERE season_id = ?', [season.id]);
        const football_games_count = footballGames.length;
        
        return {
          ...season,
          game_count,
          football_games_count,
          year: parseInt(season.season), // Convert to integer
          is_active: Boolean(season.is_current)
        };
      }));
      
      res.json({ seasons: seasonsWithCounts });
    } else {
      // For SQLite, use the optimized JOIN query
      const seasons = await db.all(`
        SELECT
          s.*,
          COUNT(DISTINCT pg.id) as game_count,
          COUNT(DISTINCT ng.id) as football_games_count,
          CAST(s.season AS INTEGER) as year,
          s.is_current as is_active
        FROM seasons s
        LEFT JOIN pickem_games pg ON s.id = pg.season_id
        LEFT JOIN football_games ng ON s.id = ng.season_id
        GROUP BY s.id
        ORDER BY s.season DESC
      `);

      res.json({ seasons });
    }
  } catch (error) {
    console.error("Get admin seasons error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create new season
router.post("/seasons", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { year } = req.body;

    if (!year) {
      return res.status(400).json({ error: "Year is required" });
    }

    // Check if season already exists
    const existingSeason = await db.get(
      "SELECT id FROM seasons WHERE season = ?",
      [year.toString()]
    );
    if (existingSeason) {
      return res.status(409).json({ error: "Season already exists" });
    }

    const seasonId = "season-" + Date.now();

    await db.run(
      `
      INSERT INTO seasons (id, season, is_current)
      VALUES (?, ?, 0)
    `,
      [seasonId, year.toString()]
    );

    let newSeason;
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, get the season and add counts manually
      const season = await db.get('SELECT * FROM seasons WHERE id = ?', [seasonId]);
      if (season) {
        newSeason = {
          ...season,
          game_count: 0,
          football_games_count: 0,
          year: parseInt(season.season),
          is_active: Boolean(season.is_current)
        };
      }
    } else {
      // For SQLite, use the optimized query
      newSeason = await db.get(
        `
        SELECT
          *,
          0 as game_count,
          0 as football_games_count,
          CAST(season AS INTEGER) as year,
          is_current as is_active
        FROM seasons
        WHERE id = ?
      `,
        [seasonId]
      );
    }

    res.status(201).json({
      message: "Season created successfully",
      season: newSeason,
    });
  } catch (error) {
    console.error("Create season error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete season (admin only)
router.delete(
  "/seasons/:seasonId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId } = req.params;

      console.log(`[Admin] Delete season request for ID: ${seasonId}`);

      // Get season info before deletion
      console.log(`[Admin] Looking up season with ID: ${seasonId}`);
      const season = await db.get(
        "SELECT season FROM seasons WHERE id = ?",
        [seasonId]
      );
      
      console.log(`[Admin] Season lookup result:`, season);
      
      if (!season) {
        console.log(`[Admin] Season not found for ID: ${seasonId}`);
        return res.status(404).json({ error: "Season not found" });
      }

      // Check if season has any active games
      console.log(`[Admin] Checking for associated games for season: ${seasonId}`);
      const gameCount = await db.get(
        "SELECT COUNT(*) as count FROM pickem_games WHERE season_id = ?",
        [seasonId]
      );

      console.log(`[Admin] Game count result:`, gameCount);

      if (gameCount?.count > 0) {
        console.log(`[Admin] Cannot delete season - has ${gameCount.count} associated games`);
        return res.status(400).json({
          error: `Cannot delete season ${season.season} - it has ${gameCount.count} associated pick'em games. Delete the games first.`
        });
      }

      // Delete related NFL games first (DynamoDB requires individual deletes by ID)
      console.log(`[Admin] Getting football games for season: ${seasonId}`);
      const footballGames = await db.all("SELECT id FROM football_games WHERE season_id = ?", [seasonId]);
      console.log(`[Admin] Found ${footballGames.length} football games to delete`);
      
      // Delete each football game individually
      for (const game of footballGames) {
        console.log(`[Admin] Deleting football game: ${game.id}`);
        await db.run("DELETE FROM football_games WHERE id = ?", [game.id]);
      }
      console.log(`[Admin] Deleted ${footballGames.length} football games`);
      
      // Finally delete the season itself
      console.log(`[Admin] Deleting season record: ${seasonId}`);
      const seasonDeleteResult = await db.run("DELETE FROM seasons WHERE id = ?", [seasonId]);
      console.log(`[Admin] Season deletion result:`, seasonDeleteResult);

      console.log(`[Admin] Season ${season.season} deleted successfully`);
      res.json({
        message: `Season ${season.season} deleted successfully`,
      });
    } catch (error) {
      console.error("[Admin] Delete season error:", error);
      console.error("[Admin] Error stack:", error.stack);
      res.status(500).json({
        error: "Internal server error",
        details: error.message
      });
    }
  }
);

// Toggle season status
router.put(
  "/seasons/:seasonId/status",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId } = req.params;
      const { isActive } = req.body;

      const season = await db.get("SELECT * FROM seasons WHERE id = ?", [
        seasonId,
      ]);
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      await db.run(
        `
      UPDATE seasons 
      SET is_current = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
        [isActive ? 1 : 0, seasonId]
      );

      res.json({ message: "Season status updated successfully" });
    } catch (error) {
      console.error("Update season status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Sync NFL games for season
router.post(
  "/seasons/:seasonId/sync-football-games",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId } = req.params;

      const season = await db.get("SELECT * FROM seasons WHERE id = ?", [
        seasonId,
      ]);
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      // This would integrate with ESPN API to sync games
      // For now, return success with count
      const gameCount = await db.get(
        "SELECT COUNT(*) as count FROM football_games WHERE season_id = ?",
        [seasonId]
      );

      res.json({
        message: "NFL games synced successfully",
        gamesCount: gameCount.count,
      });
    } catch (error) {
      console.error("Sync NFL games error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Sync NFL games for season (proper ESPN integration)
router.post(
  "/seasons/:seasonId/sync-nfl-games",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId } = req.params;

      const season = await db.get("SELECT * FROM seasons WHERE id = ?", [
        seasonId,
      ]);
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      // Call ESPN service to actually sync games
      const result = await espnService.updateNFLGames(seasonId);

      res.json({
        message: `ESPN sync completed for ${season.season}`,
        gamesCount: result.created + result.updated,
        created: result.created,
        updated: result.updated
      });
    } catch (error) {
      console.error("Sync NFL games error:", error);
      res.status(500).json({ error: error.message || "Failed to sync NFL games" });
    }
  }
);

// Toggle game status
router.put(
  "/games/:gameId/status",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { gameId } = req.params;
      const { isActive } = req.body;

      const game = await db.get("SELECT * FROM pickem_games WHERE id = ?", [
        gameId,
      ]);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      await db.run(
        `
      UPDATE pickem_games 
      SET is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
        [isActive ? 1 : 0, gameId]
      );

      res.json({ message: "Game status updated successfully" });
    } catch (error) {
      console.error("Update game status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update NFL game time
router.put(
  "/football-games/:gameId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { gameId } = req.params;
      const { start_time } = req.body;

      const game = await db.get("SELECT * FROM football_games WHERE id = ?", [
        gameId,
      ]);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      await db.run(
        `
      UPDATE football_games
      SET start_time = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
        [start_time, gameId]
      );

      res.json({ message: "Game time updated successfully" });
    } catch (error) {
      console.error("Update game time error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Set current season
router.put(
  "/seasons/:seasonId/current",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId } = req.params;

      let season;
      if (db.getType && db.getType() === 'dynamodb') {
        season = await db.get({
          action: 'get',
          table: 'seasons',
          key: { id: seasonId }
        });
      } else {
        season = await db.get("SELECT * FROM seasons WHERE id = ?", [
          seasonId,
        ]);
      }
      
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      if (db.getType && db.getType() === 'dynamodb') {
        // DynamoDB: scan and update all seasons
        const allSeasonsResult = await db.all({
          action: 'scan',
          table: 'seasons'
        });
        const allSeasons = allSeasonsResult || [];
        
        for (const s of allSeasons) {
          await db.run({
            action: 'update',
            table: 'seasons',
            key: { id: s.id },
            item: { is_current: s.id === seasonId ? true : false }
          });
        }
      } else {
        // SQLite: bulk updates
        // Unset all current seasons
        await db.run("UPDATE seasons SET is_current = 0");

        // Set this season as current
        await db.run("UPDATE seasons SET is_current = 1 WHERE id = ?", [
          seasonId,
        ]);
      }

      res.json({ message: "Current season updated successfully" });
    } catch (error) {
      console.error("Set current season error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Unset current season
router.put(
  "/seasons/:seasonId/unset-current",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId } = req.params;

      let season;
      if (db.getType && db.getType() === 'dynamodb') {
        season = await db.get({
          action: 'get',
          table: 'seasons',
          key: { id: seasonId }
        });
      } else {
        season = await db.get("SELECT * FROM seasons WHERE id = ?", [
          seasonId,
        ]);
      }
      
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      if (db.getType && db.getType() === 'dynamodb') {
        // DynamoDB: update specific season
        await db.run({
          action: 'update',
          table: 'seasons',
          key: { id: seasonId },
          item: { is_current: false }
        });
      } else {
        // SQLite: update season
        // Unset this season as current
        await db.run("UPDATE seasons SET is_current = 0 WHERE id = ?", [
          seasonId,
        ]);
      }

      res.json({ message: "Season unset as current successfully" });
    } catch (error) {
      console.error("Unset current season error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update team information
router.put(
  "/teams/:teamId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { teamId } = req.params;
      const {
        team_city,
        team_name,
        team_primary_color,
        team_secondary_color,
        team_logo,
      } = req.body;

      const team = await db.get("SELECT * FROM football_teams WHERE id = ?", [
        teamId,
      ]);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }

      // Handle different database types
      if (db.getType && db.getType() === 'dynamodb') {
        // DynamoDB update
        await db.run({
          action: 'update',
          table: 'football_teams',
          key: { id: teamId },
          item: {
            team_city,
            team_name,
            team_primary_color,
            team_secondary_color,
            team_logo,
            updated_at: new Date().toISOString()
          }
        });
      } else {
        // SQLite update
        await db.run(
          `
        UPDATE football_teams
        SET team_city = ?, team_name = ?, team_primary_color = ?, team_secondary_color = ?, team_logo = ?, updated_at = datetime('now')
        WHERE id = ?
      `,
          [
            team_city,
            team_name,
            team_primary_color,
            team_secondary_color,
            team_logo,
            teamId,
          ]
        );
      }

      res.json({ message: "Team updated successfully" });
    } catch (error) {
      console.error("Update team error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Scheduler management endpoints

// Get scheduler status
router.get(
  "/scheduler/status",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const status = scheduler.getStatus();
      res.json({ status });
    } catch (error) {
      console.error("Get scheduler status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Start scheduler
router.post(
  "/scheduler/start",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      scheduler.start();
      const status = scheduler.getStatus();
      res.json({
        message: "Scheduler started successfully",
        status,
      });
    } catch (error) {
      console.error("Start scheduler error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Stop scheduler
router.post(
  "/scheduler/stop",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      scheduler.stop();
      const status = scheduler.getStatus();
      res.json({
        message: "Scheduler stopped successfully",
        status,
      });
    } catch (error) {
      console.error("Stop scheduler error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Trigger manual update
router.post(
  "/scheduler/trigger",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      await scheduler.triggerUpdate();
      res.json({ message: "Manual update triggered successfully" });
    } catch (error) {
      console.error("Trigger manual update error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update the existing calculate-picks endpoint to use the new service
router.post(
  "/calculate-picks",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId, week } = req.body;

      if (!seasonId) {
        return res.status(400).json({ error: "Season ID is required" });
      }

      const result = await pickCalculator.calculatePicks(seasonId, week);

      res.json({
        message: `Updated ${result.updatedPicks} picks for ${result.completedGames} completed games`,
        gamesProcessed: result.completedGames,
        picksUpdated: result.updatedPicks,
        week: result.week,
      });
    } catch (error) {
      console.error("Calculate picks error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// On-demand score update endpoint
router.post("/update-scores-on-demand", authenticateToken, async (req, res) => {
  try {
    const { seasonId, week } = req.body;

    if (seasonId && week) {
      // Update specific week
      const result = await onDemandUpdates.updateScoresIfStale(seasonId, week);
      res.json(result);
    } else {
      // Update current week
      const result = await onDemandUpdates.updateCurrentWeekIfStale();
      res.json(result);
    }
  } catch (error) {
    console.error("On-demand update error:", error);
    res.status(500).json({
      updated: false,
      reason: "Server error",
      error: error.message,
    });
  }
});

// Update game season
router.put(
  "/games/:gameId/season",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { gameId } = req.params;
      const { seasonId } = req.body;

      if (!seasonId) {
        return res.status(400).json({ error: "Season ID is required" });
      }

      const game = await db.get("SELECT * FROM pickem_games WHERE id = ?", [
        gameId,
      ]);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const season = await db.get("SELECT * FROM seasons WHERE id = ?", [
        seasonId,
      ]);
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      await db.run(
        `
      UPDATE pickem_games 
      SET season_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
        [seasonId, gameId]
      );

      res.json({ message: "Game season updated successfully" });
    } catch (error) {
      console.error("Update game season error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get last update time for a week
router.get(
  "/scores-last-updated/:seasonId/:week",
  authenticateToken,
  async (req, res) => {
    try {
      const { seasonId, week } = req.params;
      const lastUpdate = await onDemandUpdates.getLastUpdateTime(
        seasonId,
        week
      );
      const formatted = onDemandUpdates.formatLastUpdate(lastUpdate);

      res.json({
        lastUpdate,
        formatted,
        isStale: await onDemandUpdates.areScoresStale(seasonId, week),
      });
    } catch (error) {
      console.error("Get last update error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Settings management endpoints

// Encryption key for sensitive settings (in production, this should be from environment)
const ENCRYPTION_KEY =
  process.env.SETTINGS_ENCRYPTION_KEY ||
  "football-pickem-default-key-32-chars!";

function encrypt(text) {
  const cipher = crypto.createCipher("aes-256-cbc", ENCRYPTION_KEY);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function decrypt(encryptedText) {
  const decipher = crypto.createDecipher("aes-256-cbc", ENCRYPTION_KEY);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Get all settings by category
router.get(
  "/settings/:category",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { category } = req.params;

      const settings = await db.all(
        `
      SELECT key, value, encrypted, description
      FROM system_settings 
      WHERE category = ?
      ORDER BY key
    `,
        [category]
      );

      // Decrypt encrypted values for display (but mask passwords)
      const processedSettings = settings.map((setting) => ({
        ...setting,
        value:
          setting.encrypted && setting.key.toLowerCase().includes("pass")
            ? "••••••••" // Mask passwords
            : setting.encrypted
            ? decrypt(setting.value)
            : setting.value,
      }));

      res.json({ settings: processedSettings });
    } catch (error) {
      console.error("Get settings error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update settings
router.put(
  "/settings/:category",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { category } = req.params;
      const { settings } = req.body;

      if (!Array.isArray(settings)) {
        return res.status(400).json({ error: "Settings must be an array" });
      }

      for (const setting of settings) {
        const { key, value, encrypted = false, description = "" } = setting;

        if (!key) continue;

        const settingId = `${category}_${key}`;
        const processedValue = encrypted ? encrypt(value) : value;

        await db.run(
          `
        INSERT OR REPLACE INTO system_settings (id, category, key, value, encrypted, description, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `,
          [
            settingId,
            category,
            key,
            processedValue,
            encrypted ? 1 : 0,
            description,
          ]
        );
      }

      // Refresh email service transporter if SMTP settings were updated
      if (category === "smtp") {
        await emailService.refreshTransporter();
      }

      res.json({ message: "Settings updated successfully" });
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Test SMTP connection
router.post(
  "/settings/smtp/test",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { host, port, user, pass, from } = req.body;

      if (!host || !user || !pass || !from) {
        return res
          .status(400)
          .json({ error: "All SMTP fields are required for testing" });
      }

      const nodemailer = await import("nodemailer");
      const testTransporter = nodemailer.createTransporter({
        host: host,
        port: parseInt(port) || 587,
        secure: false,
        auth: {
          user: user,
          pass: pass,
        },
      });

      // Verify connection
      await testTransporter.verify();

      // Send test email
      await testTransporter.sendMail({
        from: from,
        to: req.user.email, // Send test email to admin
        subject: "SMTP Test - NFL Pick'em",
        text: "This is a test email to verify your SMTP settings are working correctly.",
        html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>🏈 SMTP Test Successful!</h2>
          <p>Your SMTP settings are working correctly.</p>
          <p>This test email was sent from your NFL Pick'em application.</p>
        </div>
      `,
      });

      res.json({
        success: true,
        message: "SMTP test successful! Check your email for the test message.",
      });
    } catch (error) {
      console.error("SMTP test error:", error);
      res.status(400).json({
        success: false,
        error: `SMTP test failed: ${error.message}`,
      });
    }
  }
);

export default router;
