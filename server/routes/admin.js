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
import DatabaseServiceFactory from "../services/database/DatabaseServiceFactory.js";

const router = express.Router();

// Get application version from package.json
router.get("/version", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const packageJsonPath = path.join(__dirname, "../../package.json");
    
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);
    
    res.json({
      version: packageJson.version,
      name: packageJson.name
    });
  } catch (error) {
    console.error("Get version error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get admin dashboard stats
router.get("/stats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userService = DatabaseServiceFactory.getUserService();
    const gameService = DatabaseServiceFactory.getGameService();
    const seasonService = DatabaseServiceFactory.getSeasonService();
    
    const [userCount, gameCount, teamCount, seasonCount] = await Promise.all([
      userService.getUserCount(),
      gameService.getGameCount(),
      seasonService.getTeamCount(),
      seasonService.getSeasonCount(),
    ]);

    res.json({
      stats: {
        users: userCount || 0,
        games: gameCount || 0,
        teams: teamCount || 0,
        seasons: seasonCount || 0,
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
    
    // Always try multiple paths for better reliability in different deployment environments
    const possibleLogoPaths = [
      // Try explicit path first if set
      ...(explicitLogosPath ? [explicitLogosPath] : []),
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
    const seasonService = DatabaseServiceFactory.getSeasonService();
    const season = await seasonService.getSeasonById(seasonId);
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
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, get users and game counts using service layer
      const userService = DatabaseServiceFactory.getUserService();
      const users = await userService.getAllUsers();
      
      // For each user, get game count using DynamoDB scan
      const usersWithGameCount = await Promise.all(
        users.map(async (user) => {
          try {
            // Use DynamoDB scan to find game participations for this user
            const gameParticipations = await db.provider._dynamoScan('game_participants', {
              user_id: user.id
            });
            return {
              ...user,
              game_count: gameParticipations.Items ? gameParticipations.Items.length : 0
            };
          } catch (error) {
            console.warn(`Could not get game count for user ${user.id}:`, error);
            return {
              ...user,
              game_count: 0
            };
          }
        })
      );
      
      res.json({ users: usersWithGameCount });
    } else {
      // For SQLite, use service layer for consistency
      const userService = DatabaseServiceFactory.getUserService();
      const users = await userService.getAllUsers();
      
      res.json({ users });
    }
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
      const invitationService = DatabaseServiceFactory.getInvitationService();
      const invitations = await invitationService.getPendingInvitations();
      
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

      const invitationService = DatabaseServiceFactory.getInvitationService();
      const invitation = await invitationService.cancelInvitation(invitationId);

      res.json({
        message: `Invitation for ${invitation.email} cancelled successfully`,
      });
    } catch (error) {
      console.error("Cancel invitation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Manually confirm invitation (admin creates account for user)
router.post(
  "/invitations/:invitationId/confirm",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { invitationId } = req.params;
      const { firstName, lastName, tempPassword } = req.body;

      if (!firstName || !lastName || !tempPassword) {
        return res.status(400).json({
          error: "First name, last name, and temporary password are required"
        });
      }

      // Get invitation details
      const invitationService = DatabaseServiceFactory.getInvitationService();
      const invitation = await invitationService.getInvitationById(invitationId);

      if (!invitation || invitation.status !== 'pending' || invitation.expires_at <= new Date().toISOString()) {
        return res.status(404).json({ error: "Invalid or expired invitation" });
      }

      // Get game name - handle both regular and admin invitations
      let gameName = 'Admin Invitation';
      if (invitation.game_id) {
        // This is a regular game invitation - use admin bypass method
        const gameService = DatabaseServiceFactory.getGameService();
        try {
          // Try the new admin method first
          if (gameService.getGameByIdForAdmin) {
            const game = await gameService.getGameByIdForAdmin(invitation.game_id);
            if (game) {
              gameName = game.game_name;
            }
          } else {
            // Fallback to direct database access for admin operations
            if (db.getType() === 'dynamodb') {
              const gameResult = await db.get({
                action: 'get',
                table: 'pickem_games',
                key: { id: invitation.game_id }
              });
              if (gameResult && gameResult.Item) {
                gameName = gameResult.Item.game_name;
              }
            } else {
              const game = await db.get("SELECT game_name FROM pickem_games WHERE id = ?", [invitation.game_id]);
              if (game) {
                gameName = game.game_name;
              }
            }
          }
        } catch (error) {
          console.warn(`Could not get game name for invitation ${invitationId}:`, error);
          // Use default name for admin invitations or when game lookup fails
        }
      }
      invitation.game_name = gameName;

      // Check if user already exists
      const userService = DatabaseServiceFactory.getUserService();
      const userExists = await userService.userExists(invitation.email);
      if (userExists) {
        return res.status(409).json({ error: "User with this email already exists" });
      }

      // Hash the temporary password
      const bcrypt = await import('bcryptjs');
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

      // Create user account
      const { v4: uuidv4 } = await import("uuid");
      const userId = uuidv4();
      const emailVerificationToken = uuidv4();
      
      const createdUser = await userService.createUser({
        id: userId,
        email: invitation.email,
        password: hashedPassword,
        firstName,
        lastName,
        favoriteTeamId: null,
        emailVerificationToken,
        emailVerified: true,  // Admin-created accounts are pre-verified
        isAdmin: invitation.is_admin_invitation || false  // Set admin status for admin invitations
      });

      // Add user to the game (only for regular game invitations)
      if (invitation.game_id) {
        const gameService = DatabaseServiceFactory.getGameService();
        await gameService.addParticipant(invitation.game_id, userId, 'player');
      }

      // Mark invitation as accepted
      await invitationService.updateInvitationStatus(invitation.id, 'accepted');

      res.json({
        message: `Account created for ${invitation.email} and added to "${invitation.game_name}". Temporary password: ${tempPassword}`,
        user: {
          id: userId,
          email: invitation.email,
          firstName,
          lastName,
          tempPassword
        },
        game: {
          id: invitation.game_id,
          name: invitation.game_name
        }
      });

    } catch (error) {
      console.error("Confirm invitation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get all games (for game management)
router.get("/games", authenticateToken, requireAdmin, async (req, res) => {
  try {
    // First, let's migrate any games that might have NULL names or commissioner_ids
    await migrateGameData();

    const gameService = DatabaseServiceFactory.getGameService();
    const games = await gameService.getAllGamesWithDetails();
    
    res.json({ games });
  } catch (error) {
    console.error("Get admin games error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Helper function to migrate old game data
async function migrateGameData() {
  try {
    const gameService = DatabaseServiceFactory.getGameService();
    const userService = DatabaseServiceFactory.getUserService();
    
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, handle migrations differently
      const games = await gameService.getAllGames();
      
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
          const adminUser = await userService.getFirstAdminUser();
          if (adminUser) {
            updates.commissioner_id = adminUser.id;
            needsUpdate = true;
          } else {
            // Find any user
            const anyUser = await userService.getAnyUser();
            if (anyUser) {
              updates.commissioner_id = anyUser.id;
              needsUpdate = true;
            }
          }
        }
        
        if (needsUpdate) {
          await gameService.updateGameData(game.id, updates);
        }
      }
    } else {
      // For SQLite, use SQL queries through the service layer
      await gameService.migrateGameData();
      
      // Update games with NULL commissioner_id - set to first admin user
      const firstAdmin = await userService.getFirstAdminUser();
      if (firstAdmin) {
        await gameService.updateCommissionerForGamesWithoutCommissioner(firstAdmin.id);
      } else {
        // If no admin user, try to find any user
        const anyUser = await userService.getAnyUser();
        if (anyUser) {
          await gameService.updateCommissionerForGamesWithoutCommissioner(anyUser.id);
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

      console.log(`[Admin Game Deletion] Starting deletion for game: ${gameId}`);
      console.log(`[Admin Game Deletion] Database type: ${db.getType ? db.getType() : 'unknown'}`);

      // Use the game service layer for proper deletion handling
      const gameService = DatabaseServiceFactory.getGameService();
      
      // Get game info before deletion for response message using admin method
      let game;
      try {
        console.log(`[Admin Game Deletion] Attempting to get game info for ${gameId}`);
        game = await gameService.getGameByIdForAdmin(gameId);
        console.log(`[Admin Game Deletion] Game found:`, game ? 'Yes' : 'No');
        if (!game) {
          console.log(`[Admin Game Deletion] Game ${gameId} not found using service layer`);
          
          // Fallback: try direct database access for debugging
          console.log(`[Admin Game Deletion] Trying direct database access as fallback`);
          try {
            if (db.getType && db.getType() === 'dynamodb') {
              const directResult = await db.get({
                action: 'get',
                table: 'pickem_games',
                key: { id: gameId }
              });
              console.log(`[Admin Game Deletion] Direct DynamoDB result:`, directResult ? 'Found' : 'Not found');
              if (directResult && directResult.Item) {
                game = directResult.Item;
                console.log(`[Admin Game Deletion] Found game via direct access: ${game.game_name}`);
              }
            } else {
              const directResult = await db.get("SELECT * FROM pickem_games WHERE id = ?", [gameId]);
              console.log(`[Admin Game Deletion] Direct SQLite result:`, directResult ? 'Found' : 'Not found');
              if (directResult) {
                game = directResult;
                console.log(`[Admin Game Deletion] Found game via direct access: ${game.game_name}`);
              }
            }
          } catch (directError) {
            console.error(`[Admin Game Deletion] Direct database access also failed:`, directError);
          }
          
          if (!game) {
            // For debugging, let's also try to list all games to see what's available
            try {
              const allGames = await gameService.getAllGames();
              console.log(`[Admin Game Deletion] Total games in database: ${allGames.length}`);
              console.log(`[Admin Game Deletion] Available game IDs:`, allGames.map(g => g.id).slice(0, 5));
            } catch (listError) {
              console.error(`[Admin Game Deletion] Error listing games:`, listError);
            }
            
            return res.status(404).json({ error: "Game not found" });
          }
        }
      } catch (error) {
        console.error(`[Admin Game Deletion] Error getting game info:`, error);
        console.error(`[Admin Game Deletion] Error stack:`, error.stack);
        return res.status(404).json({ error: "Game not found" });
      }

      // Use the service layer deleteGame method which handles both SQLite and DynamoDB correctly
      console.log(`[Admin Game Deletion] Proceeding with deletion of game: ${game.game_name || 'Unknown'}`);
      await gameService.deleteGame(gameId);

      console.log(`[Admin Game Deletion] Game ${gameId} deleted successfully`);
      res.json({
        message: `Game "${game.game_name || game.name || 'Unknown Game'}" deleted successfully`,
      });
    } catch (error) {
      console.error("Admin delete game error:", error);
      console.error("Admin delete game error stack:", error.stack);
      
      if (error.message === 'Game not found') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({
        error: "Internal server error",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
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

      const userService = DatabaseServiceFactory.getUserService();
      await userService.updateAdminStatus(userId, isAdmin);

      res.json({ message: "User admin status updated successfully" });
    } catch (error) {
      console.error("Update user admin error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Manually verify user email (admin only)
router.put(
  "/users/:userId/verify-email",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Get user info before verification
      const userService = DatabaseServiceFactory.getUserService();
      const user = await userService.getUserBasicInfo(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Update email_verified status
      await userService.updateEmailVerified(userId, true);

      res.json({
        message: `Email verified for ${user.first_name} ${user.last_name} (${user.email})`,
      });
    } catch (error) {
      console.error("Verify user email error:", error);
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
      const userService = DatabaseServiceFactory.getUserService();
      const user = await userService.getUserBasicInfo(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Delete related records manually to handle foreign key constraints
      if (db.getType() === 'dynamodb') {
        // For DynamoDB, use scans to find and delete records
        
        // Delete picks
        const picksResult = await db.provider._dynamoScan('picks', { user_id: userId });
        if (picksResult.Items) {
          for (const pick of picksResult.Items) {
            await db.provider._dynamoDelete('picks', { id: pick.id });
          }
        }
        
        // Delete weekly standings
        const standingsResult = await db.provider._dynamoScan('weekly_standings', { user_id: userId });
        if (standingsResult.Items) {
          for (const standing of standingsResult.Items) {
            await db.provider._dynamoDelete('weekly_standings', { id: standing.id });
          }
        }
        
        // Delete game invitations
        const invitationService = DatabaseServiceFactory.getInvitationService();
        await invitationService.deleteInvitationsByUser(userId, user.email);
        
        // Remove from game participants
        const participantsResult = await db.provider._dynamoScan('game_participants', { user_id: userId });
        if (participantsResult.Items) {
          for (const participant of participantsResult.Items) {
            await db.provider._dynamoDelete('game_participants', { id: participant.id });
          }
        }
        
        // Update games where this user was commissioner (set to the requesting admin)
        const gamesResult = await db.provider._dynamoScan('pickem_games', { commissioner_id: userId });
        if (gamesResult.Items) {
          for (const game of gamesResult.Items) {
            await db.provider._dynamoUpdate('pickem_games', { id: game.id }, { commissioner_id: req.user.id });
          }
        }
      } else {
        // For SQLite, use direct SQL for now until service methods are available
        await db.run("DELETE FROM picks WHERE user_id = ?", [userId]);
        await db.run("DELETE FROM weekly_standings WHERE user_id = ?", [userId]);
        
        const invitationService = DatabaseServiceFactory.getInvitationService();
        await invitationService.deleteInvitationsByUser(userId, user.email);
        
        await db.run("DELETE FROM game_participants WHERE user_id = ?", [userId]);
        await db.run("UPDATE pickem_games SET commissioner_id = ? WHERE commissioner_id = ?", [req.user.id, userId]);
      }
      
      // Finally delete the user
      await userService.deleteUser(userId);

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
    const seasonService = DatabaseServiceFactory.getSeasonService();
    const seasons = await seasonService.getAllSeasonsWithCounts();
    
    res.json({ seasons });
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

    const seasonService = DatabaseServiceFactory.getSeasonService();
    
    // Check if season already exists
    const existingSeason = await seasonService.getSeasonByYear(year.toString());
    if (existingSeason) {
      return res.status(409).json({ error: "Season already exists" });
    }

    // Create season with proper object structure
    const newSeason = await seasonService.createSeason({
      season: year.toString(),
      isCurrent: false
    });

    res.status(201).json({
      message: "Season created successfully",
      season: newSeason,
    });
  } catch (error) {
    console.error("Create season error:", error);
    if (error.message === 'Season already exists') {
      return res.status(409).json({ error: error.message });
    }
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

      const seasonService = DatabaseServiceFactory.getSeasonService();
      const gameService = DatabaseServiceFactory.getGameService();

      // Get season info before deletion using the service
      console.log(`[Admin] Looking up season with ID: ${seasonId}`);
      const season = await seasonService.getSeasonById(seasonId);
      
      console.log(`[Admin] Season lookup result:`, season);
      
      if (!season) {
        console.log(`[Admin] Season not found for ID: ${seasonId}`);
        return res.status(404).json({ error: "Season not found" });
      }

      // Check if season has any active pickem games using the service
      console.log(`[Admin] Checking for associated pickem games for season: ${seasonId}`);
      const gameCount = await gameService.getGameCountBySeason(seasonId);

      console.log(`[Admin] Game count result: ${gameCount}`);

      if (gameCount > 0) {
        console.log(`[Admin] Cannot delete season - has ${gameCount} associated games`);
        return res.status(400).json({
          error: `Cannot delete season ${season.season || season.year} - it has ${gameCount} associated pick'em games. Delete the games first.`
        });
      }

      // Use the service layer to delete the season (which handles football games too)
      console.log(`[Admin] Deleting season using service layer`);
      await seasonService.deleteSeason(seasonId);

      console.log(`[Admin] Season ${season.season || season.year} deleted successfully`);
      res.json({
        message: `Season ${season.season || season.year} deleted successfully`,
      });
    } catch (error) {
      console.error("[Admin] Delete season error:", error);
      console.error("[Admin] Error stack:", error.stack);
      
      // Handle specific service errors
      if (error.message === 'Season not found') {
        return res.status(404).json({ error: error.message });
      } else if (error.message.includes('Cannot delete season that has associated games')) {
        return res.status(400).json({ error: error.message });
      }
      
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

      const seasonService = DatabaseServiceFactory.getSeasonService();
      const season = await seasonService.getSeasonById(seasonId);
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      await seasonService.updateSeasonCurrentStatus(seasonId, isActive);

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

      const seasonService = DatabaseServiceFactory.getSeasonService();
      const season = await seasonService.getSeasonById(seasonId);
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      // This would integrate with ESPN API to sync games
      // For now, return success with count
      const gameCount = await seasonService.getFootballGameCount(seasonId);

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

      const seasonService = DatabaseServiceFactory.getSeasonService();
      const season = await seasonService.getSeasonById(seasonId);
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

      const gameService = DatabaseServiceFactory.getGameService();
      const game = await gameService.getGameByIdForAdmin(gameId);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      await gameService.updateGameActiveStatus(gameId, isActive);

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

      const nflDataService = DatabaseServiceFactory.getNFLDataService();
      const game = await nflDataService.getFootballGameById(gameId);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      await nflDataService.updateGameStartTime(gameId, start_time);

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

      const seasonService = DatabaseServiceFactory.getSeasonService();
      const season = await seasonService.getSeasonById(seasonId);
      
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      await seasonService.setCurrentSeason(seasonId);

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

      const seasonService = DatabaseServiceFactory.getSeasonService();
      const season = await seasonService.getSeasonById(seasonId);
      
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      await seasonService.updateSeasonCurrentStatus(seasonId, false);

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

      const nflDataService = DatabaseServiceFactory.getNFLDataService();
      const team = await nflDataService.getTeamById(teamId);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }

      await nflDataService.updateTeam(teamId, {
        team_city,
        team_name,
        team_primary_color,
        team_secondary_color,
        team_logo
      });

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

      const gameService = DatabaseServiceFactory.getGameService();
      const game = await gameService.getGameByIdForAdmin(gameId);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const seasonService = DatabaseServiceFactory.getSeasonService();
      const season = await seasonService.getSeasonById(seasonId);
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      await gameService.updateGameSeason(gameId, seasonId);

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
  // Generate a random initialization vector
  const iv = crypto.randomBytes(16);
  
  // Create a hash of the encryption key to ensure it's exactly 32 bytes for AES-256
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  // Prepend the IV to the encrypted data (both in hex)
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  try {
    // Try new format first (with IV)
    const parts = encryptedText.split(':');
    if (parts.length === 2) {
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      // Create a hash of the encryption key to ensure it's exactly 32 bytes for AES-256
      const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
      
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }
  } catch (error) {
    // If new format fails, try legacy format
    console.warn('New format decryption failed, attempting legacy format:', error.message);
  }
  
  try {
    // Fallback to legacy format for backward compatibility
    console.warn('Attempting to decrypt legacy format data. Consider re-saving settings to update to new format.');
    
    // This is a simplified fallback - in a real scenario you'd want to
    // create a proper migration strategy
    throw new Error('Legacy encrypted data detected. Please re-save your settings to update to the new secure format.');
  } catch (legacyError) {
    throw new Error(`Unable to decrypt data. This may be due to changed encryption format. Please re-enter your settings. Details: ${legacyError.message}`);
  }
}

// Get all settings by category
router.get(
  "/settings/:category",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { category } = req.params;

      const systemSettingsService = DatabaseServiceFactory.getSystemSettingsService();
      const settings = await systemSettingsService.getSettingsByCategory(category);

      // Decrypt encrypted values for display (but mask passwords)
      const processedSettings = settings.map((setting) => {
        let displayValue = setting.value;
        
        if (setting.encrypted) {
          try {
            const decryptedValue = decrypt(setting.value);
            
            // For passwords, show masked value but include original length hint
            if (setting.key.toLowerCase().includes("pass")) {
              displayValue = "••••••••"; // Always show 8 dots for UI consistency
              // Add metadata to help frontend identify this as a masked password
              return {
                ...setting,
                value: displayValue,
                _isPasswordMask: true,
                _originalLength: decryptedValue.length
              };
            } else {
              displayValue = decryptedValue;
            }
          } catch (error) {
            console.error(`Failed to decrypt setting ${setting.key}:`, error.message);
            displayValue = "[Decryption Failed - Please Re-enter]";
          }
        }
        
        return {
          ...setting,
          value: displayValue
        };
      });

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
        
        // Skip saving if this is a masked password that hasn't been changed
        if (encrypted && setting.key && setting.key.toLowerCase().includes("pass") && value === "••••••••") {
          console.log(`Skipping update for masked password field: ${key}`);
          continue;
        }
        
        console.log(`Updating setting ${key}: encrypted=${encrypted}, valueLength=${value ? value.length : 0}`);

        const settingId = `${category}_${key}`;
        const processedValue = encrypted ? encrypt(value) : value;

        // Get database type first for comprehensive failsafe logic
        const dbType = db.getType();
        console.log(`[COMPREHENSIVE FAILSAFE] Database type: ${dbType}`);
        
        // UNIVERSAL FAILSAFE: For DynamoDB environment, ALWAYS use DynamoDB service to avoid SQL errors
        if (dbType === 'dynamodb') {
          console.log('[UNIVERSAL FAILSAFE] DynamoDB detected - forcing DynamoDB service to prevent SQL errors');
          
          try {
            // Import and use DynamoDB service directly
            const { default: DynamoDBSystemSettingsService } = await import('../services/database/dynamodb/DynamoDBSystemSettingsService.js');
            const dynamoService = new DynamoDBSystemSettingsService();
            console.log('[UNIVERSAL FAILSAFE] Using DynamoDB service directly for setting:', key);
            
            await dynamoService.updateSetting(category, key, processedValue, encrypted, description);
            console.log(`[UNIVERSAL FAILSAFE] Successfully updated setting ${key} using DynamoDB service`);
            
          } catch (dynamoError) {
            console.error(`[UNIVERSAL FAILSAFE] DynamoDB service failed for setting ${key}:`, dynamoError);
            throw dynamoError;
          }
          
        } else {
          // For SQLite, use the factory service normally
          console.log('[STANDARD PATH] SQLite detected - using factory service');
          
          // Clear service cache to ensure we get the correct service for current database type
          DatabaseServiceFactory.clearCache();
          
          const systemSettingsService = DatabaseServiceFactory.getSystemSettingsService();
          console.log('[STANDARD PATH] Selected Service:', systemSettingsService.constructor.name);
          
          try {
            await systemSettingsService.updateSetting(category, key, processedValue, encrypted, description);
            console.log(`[STANDARD PATH] Successfully updated setting ${key} using factory service`);
          } catch (serviceError) {
            console.error(`[STANDARD PATH] Factory service failed for setting ${key}:`, serviceError);
            throw serviceError;
          }
        }
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
    // Define isAwsSes outside try block for error handling access
    let isAwsSes = false;
    
    try {
      let { host, port, user, pass, from, testEmail } = req.body;

      if (!host || !user || !pass || !from) {
        return res
          .status(400)
          .json({ error: "All SMTP fields are required for testing" });
      }
      
      // Determine test email address
      const targetEmail = testEmail && testEmail.trim()
        ? testEmail.trim()
        : req.user.email;
      
      // Enhanced debug logging to clearly distinguish between admin email and target email
      console.log("=== SMTP Test Email Configuration ===");
      console.log("Admin Email (req.user.email):", req.user.email);
      console.log("Provided Test Email:", testEmail || "None provided");
      console.log("Target Email (where test will be sent):", targetEmail);
      console.log("=====================================");
      
      // Validate email format
      if (!targetEmail || !targetEmail.includes('@')) {
        return res.status(400).json({
          error: `Invalid test email address: ${targetEmail}. Please provide a valid email address in the 'Test Email' field.`
        });
      }
      
      // Check if password is masked - if so, load real password from database
      if (pass === "••••••••") {
        console.log("Detected masked password, loading real password from database...");
        
        try {
          const systemSettingsService = DatabaseServiceFactory.getSystemSettingsService();
          const settings = await systemSettingsService.getSettingsByCategory('smtp');
          
          const smtpConfig = {};
          settings.forEach((setting) => {
            smtpConfig[setting.key] = setting.encrypted
              ? decrypt(setting.value)
              : setting.value;
          });
          
          if (smtpConfig.pass) {
            pass = smtpConfig.pass;
            console.log("Successfully loaded real password from database, length:", pass.length);
          } else {
            return res.status(400).json({
              error: "No password found in saved settings. Please re-enter your SMTP password."
            });
          }
        } catch (dbError) {
          console.error("Failed to load password from database:", dbError);
          return res.status(400).json({
            error: "Could not load saved password. Please re-enter your SMTP password."
          });
        }
      }

      const { default: nodemailer } = await import("nodemailer");
      
      // Detect if this looks like AWS SES
      isAwsSes = host.includes('email-smtp') && host.includes('amazonaws.com');
      
      // Enhanced debugging info
      console.log("SMTP Test Configuration:");
      console.log("- Host:", host);
      console.log("- Port:", parseInt(port) || 587);
      console.log("- User:", user);
      console.log("- From:", from);
      console.log("- Password length:", pass.length);
      console.log("- Password first 10 chars:", pass.substring(0, 10) + "...");
      console.log("- AWS SES detected:", isAwsSes);
      console.log("- Using real password from database:", pass !== req.body.pass);
      
      // AWS SES specific validation
      if (isAwsSes) {
        console.log("AWS SES Validation:");
        console.log("- Expected username format: AKIA... (should start with AKIA)");
        console.log("- Actual username starts with:", user.substring(0, 4));
        console.log("- Expected password length: 40+ characters");
        console.log("- Actual password length:", pass.length);
        
        if (!user.startsWith('AKIA')) {
          console.warn("⚠️  WARNING: AWS SES username should start with 'AKIA'");
        }
        
        if (pass.length < 30) {
          console.warn("⚠️  WARNING: AWS SES password seems too short. Expected 40+ characters, got", pass.length);
          console.warn("This suggests the password may be truncated or incorrectly saved.");
        }
      }

      const portNum = parseInt(port) || 587;
      
      // Try multiple configurations
      const configurations = [
        {
          name: "Standard TLS (port 587)",
          config: {
            host: host,
            port: portNum,
            secure: portNum === 465, // true for 465, false for other ports
            auth: {
              user: user,
              pass: pass,
            },
            tls: {
              rejectUnauthorized: false // Allow self-signed certificates
            }
          }
        }
      ];

      // Add AWS SES specific configuration if detected
      if (isAwsSes) {
        console.log("AWS SES detected - adding SES-specific configurations");
        configurations.push({
          name: "AWS SES Optimized",
          config: {
            host: host,
            port: portNum,
            secure: portNum === 465,
            auth: {
              user: user,
              pass: pass,
            },
            tls: {
              rejectUnauthorized: true, // AWS SES has valid certificates
              ciphers: 'SSLv3' // AWS SES compatibility
            },
            connectionTimeout: 10000, // 10 seconds
            greetingTimeout: 5000,
            socketTimeout: 10000
          }
        });
      } else {
        // Add alternative config for non-SES providers
        configurations.push({
          name: "Alternative with explicit TLS",
          config: {
            host: host,
            port: portNum,
            secure: portNum === 465,
            requireTLS: true,
            auth: {
              user: user,
              pass: pass,
            },
            tls: {
              rejectUnauthorized: false
            }
          }
        });
      }

      let lastError = null;
      
      for (const config of configurations) {
        try {
          console.log(`\nTrying configuration: ${config.name}`);
          const testTransporter = nodemailer.createTransport(config.config);

          // Verify connection
          console.log("Verifying SMTP connection...");
          await testTransporter.verify();
          console.log("SMTP connection verified successfully!");

          // Send test email
          console.log("Sending test email...");
          const result = await testTransporter.sendMail({
            from: from,
            to: targetEmail,
            subject: "SMTP Test - NFL Pick'em",
            text: "This is a test email to verify your SMTP settings are working correctly.",
            html: `
            <div style="font-family: Arial, sans-serif;">
              <h2>🏈 SMTP Test Successful!</h2>
              <p>Your SMTP settings are working correctly.</p>
              <p>This test email was sent from your NFL Pick'em application.</p>
              <p><small>Configuration: ${config.name}</small></p>
            </div>
          `,
          });

          console.log("✅ Test email sent successfully!");
          console.log("Target Email:", targetEmail);
          console.log("Message ID:", result.messageId);
          console.log("Admin performing test:", req.user.email);
          
          return res.json({
            success: true,
            message: `SMTP test successful with ${config.name}! Test email sent to ${targetEmail}. Check your email for the test message.`,
            configuration: config.name,
            messageId: result.messageId,
            testEmailSentTo: targetEmail
          });
          
        } catch (configError) {
          console.log(`Configuration "${config.name}" failed:`, configError.message);
          lastError = configError;
          continue;
        }
      }

      // If we get here, all configurations failed
      throw lastError;

    } catch (error) {
      console.error("SMTP test error details:", {
        message: error.message,
        code: error.code,
        response: error.response,
        responseCode: error.responseCode,
        command: error.command
      });
      
      let helpfulMessage = `SMTP test failed: ${error.message}`;
      
      // Provide specific guidance based on error type
      if (error.code === 'EAUTH') {
        helpfulMessage += "\n\nAuthentication failed. Please check:\n";
        
        if (isAwsSes) {
          helpfulMessage += "• AWS SES SMTP credentials are correct (NOT your AWS Access Keys)\n";
          helpfulMessage += "• SMTP username should look like: AKIA... (20 characters)\n";
          helpfulMessage += "• SMTP password should be the generated SMTP password (NOT your AWS secret)\n";
          helpfulMessage += "• SMTP password should be 40+ characters (yours is only " + (req.body.pass ? req.body.pass.length : 'unknown') + ")\n";
          helpfulMessage += "• Your 'from' email is verified in AWS SES\n";
          helpfulMessage += "• Your AWS SES is out of sandbox mode (if sending to unverified emails)\n";
          helpfulMessage += "• AWS SES region matches your SMTP endpoint\n";
          helpfulMessage += "\n⚠️  Password appears to be truncated or incorrectly saved - please re-enter it.";
        } else {
          helpfulMessage += "• Username and password are correct\n";
          helpfulMessage += "• For Gmail: Use App Password instead of regular password\n";
          helpfulMessage += "• For Outlook: Enable 'Less secure app access' or use App Password\n";
          helpfulMessage += "• Check if 2FA is enabled and requires App Password";
        }
      } else if (error.code === 'ECONNECTION') {
        helpfulMessage += "\n\nConnection failed. Please check:\n";
        
        if (isAwsSes) {
          helpfulMessage += "• AWS SES SMTP endpoint is correct (e.g., email-smtp.us-east-1.amazonaws.com)\n";
          helpfulMessage += "• Region in endpoint matches your SES setup\n";
          helpfulMessage += "• Port 587 (TLS) or 465 (SSL) - 587 is recommended for SES\n";
          helpfulMessage += "• Network/firewall allows SMTP connections to AWS";
        } else {
          helpfulMessage += "• SMTP server hostname is correct\n";
          helpfulMessage += "• Port number is correct (587 for TLS, 465 for SSL)\n";
          helpfulMessage += "• Network/firewall allows SMTP connections";
        }
      } else if (error.code === 'ETIMEDOUT') {
        helpfulMessage += "\n\nConnection timed out. Please check:\n";
        helpfulMessage += "• SMTP server is accessible\n";
        helpfulMessage += "• Firewall/network settings";
        
        if (isAwsSes) {
          helpfulMessage += "\n• AWS SES region endpoint is correct";
        }
      }
      
      res.status(400).json({
        success: false,
        error: helpfulMessage,
        details: {
          code: error.code,
          response: error.response,
          responseCode: error.responseCode,
          passwordLength: req.body.pass ? req.body.pass.length : 'unknown'
        }
      });
    }
  }
);

// Invite user to game (admin only)
router.post("/invite-user", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email, gameId } = req.body;

    if (!email || !gameId) {
      return res.status(400).json({ error: "Email and game ID are required" });
    }

    const normalizedEmail = email.toLowerCase();

    // Get game information
    const gameService = DatabaseServiceFactory.getGameService();
    const game = await gameService.getGameByIdForAdmin(gameId);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Get admin user information for invitation
    const userService = DatabaseServiceFactory.getUserService();
    const inviter = await userService.getUserBasicInfo(req.user.id);

    // Check if user already exists
    const existingUser = await userService.getUserByEmail(normalizedEmail);

    if (existingUser) {
      // User exists - add them directly to the game

      // Check if user is already in the game
      let existingParticipant;
      if (db.getType() === 'dynamodb') {
        // For DynamoDB, get all participants using scan
        const participantsResult = await db.provider._dynamoScan('game_participants', { game_id: gameId });
        const allParticipants = participantsResult.Items || [];
        existingParticipant = allParticipants.find(p => p.user_id === existingUser.id);
      } else {
        // For SQLite, use service layer
        existingParticipant = await gameService.getParticipant(gameId, existingUser.id);
      }

      if (existingParticipant) {
        return res
          .status(409)
          .json({ error: "User is already in this game" });
      }

      // Add user as player
      await gameService.addParticipant(gameId, existingUser.id, 'player');

      res.json({
        message: `Successfully added ${existingUser.email} to the game "${game.game_name}"`,
        type: "direct_add",
        player: {
          id: existingUser.id,
          email: existingUser.email,
        },
      });
    } else {
      // User doesn't exist - send invitation

      // Check if invitation already exists and create new one
      const invitationService = DatabaseServiceFactory.getInvitationService();
      const existingInvitation = await invitationService.checkExistingInvitation(gameId, normalizedEmail);

      if (existingInvitation) {
        return res
          .status(409)
          .json({ error: "Invitation already sent to this email for this game" });
      }

      // Create invitation
      const crypto = await import("crypto");
      const inviteToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

      await invitationService.createInvitation({
        gameId,
        email: normalizedEmail,
        invitedByUserId: req.user.id,
        inviteToken,
        expiresAt: expiresAt.toISOString()
      });

      // Send invitation email
      const emailResult = await emailService.sendGameInvitation(
        normalizedEmail,
        `${inviter.first_name} ${inviter.last_name}`,
        game.game_name,
        inviteToken
      );

      if (!emailResult.success) {
        console.error("Failed to send invitation email:", emailResult.error);
        // Still return success since the invitation was saved to database
      }

      res.json({
        message: `Invitation sent to ${normalizedEmail} for game "${game.game_name}". They'll receive an email to join the game.`,
        type: "invitation_sent",
        email: normalizedEmail,
      });
    }
  } catch (error) {
    console.error("Admin invite user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Invite admin user (admin only)
router.post("/invite-admin", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase();

    // Get admin user information for invitation
    const userService = DatabaseServiceFactory.getUserService();
    const inviter = await userService.getUserBasicInfo(req.user.id);

    // Check if user already exists
    const existingUser = await userService.getUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ error: "User with this email already exists" });
    }

    // Check if admin invitation already exists
    const invitationService = DatabaseServiceFactory.getInvitationService();
    const existingInvitation = await invitationService.checkExistingAdminInvitation(normalizedEmail);
    if (existingInvitation) {
      return res.status(409).json({
        error: "Admin invitation already sent to this email"
      });
    }

    // Create admin invitation
    const crypto = await import("crypto");
    const { v4: uuidv4 } = await import("uuid");
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    const invitation = await invitationService.createAdminInvitation({
      email: normalizedEmail,
      invitedByUserId: req.user.id,
      inviteToken,
      expiresAt: expiresAt.toISOString()
    });

    // Send invitation email
    const emailResult = await emailService.sendAdminInvitation(
      normalizedEmail,
      `${inviter.first_name} ${inviter.last_name}`,
      inviteToken
    );

    if (!emailResult.success) {
      console.error("Failed to send admin invitation email:", emailResult.error);
      // Still return success since the invitation was saved to database
    }

    res.json({
      message: `Admin invitation sent to ${normalizedEmail}. They'll receive an email to create their admin account.`,
      type: "admin_invitation_sent",
      email: normalizedEmail,
    });
  } catch (error) {
    console.error("Admin invite user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Send password reset email for a user (admin only)
router.post("/users/:userId/reset-password", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user info
    const userService = DatabaseServiceFactory.getUserService();
    const user = await userService.getUserBasicInfo(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate reset token
    const { v4: uuidv4 } = await import("uuid");
    const resetToken = uuidv4();
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour from now

    await userService.setPasswordResetToken(userId, resetToken, resetExpires);

    // Send reset email
    const emailResult = await emailService.sendPasswordReset(
      user.email,
      `${user.first_name} ${user.last_name}`,
      resetToken
    );

    if (!emailResult.success) {
      console.error("Failed to send password reset email:", emailResult.error);
      return res.status(500).json({
        error: "Failed to send password reset email. Please check email configuration."
      });
    }

    res.json({
      message: `Password reset email sent to ${user.email}`,
      email: user.email,
    });
  } catch (error) {
    console.error("Admin password reset error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get default team colors from special DEFAULT team record
router.get("/default-colors", authenticateToken, requireAdmin, async (req, res) => {
  try {
    let defaultTeam;
    
    const nflDataService = DatabaseServiceFactory.getNFLDataService();
    defaultTeam = await nflDataService.getDefaultTeam();
    
    if (!defaultTeam) {
      // Create default team record if it doesn't exist
      const { v4: uuidv4 } = await import("uuid");
      const defaultTeamId = uuidv4();
      const defaultColors = {
        id: defaultTeamId,
        team_code: 'DEFAULT',
        team_name: 'NFL Default',
        team_city: 'League',
        team_conference: 'SYSTEM',
        team_division: 'DEFAULT',
        team_primary_color: '#013369',
        team_secondary_color: '#d50a0a',
        team_logo: '/logos/NFL.svg'
      };
      
      await nflDataService.createDefaultTeam(defaultColors);
      
      defaultTeam = defaultColors;
    }
    
    res.json({
      defaultPrimaryColor: defaultTeam.team_primary_color || '#013369',
      defaultSecondaryColor: defaultTeam.team_secondary_color || '#d50a0a'
    });
  } catch (error) {
    console.error("Get default colors error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Set default team colors by updating the special DEFAULT team record
router.put("/default-colors", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { defaultPrimaryColor, defaultSecondaryColor } = req.body;
    
    if (!defaultPrimaryColor || !defaultSecondaryColor) {
      return res.status(400).json({ error: "Both primary and secondary colors are required" });
    }
    
    const nflDataService = DatabaseServiceFactory.getNFLDataService();
    const defaultTeam = await nflDataService.getDefaultTeam();
    
    if (!defaultTeam) {
      return res.status(404).json({ error: "Default team record not found" });
    }
    
    await nflDataService.updateDefaultTeamColors(defaultPrimaryColor, defaultSecondaryColor);
    
    res.json({
      message: "Default colors updated successfully",
      defaultPrimaryColor,
      defaultSecondaryColor
    });
  } catch (error) {
    console.error("Set default colors error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get the DEFAULT team record for use when users have no favorite team
router.get("/default-team", authenticateToken, async (req, res) => {
  try {
    const nflDataService = DatabaseServiceFactory.getNFLDataService();
    let defaultTeam = await nflDataService.getDefaultTeam();
    
    if (!defaultTeam) {
      // Create default team record if it doesn't exist
      const { v4: uuidv4 } = await import("uuid");
      const defaultTeamId = uuidv4();
      const defaultColors = {
        id: defaultTeamId,
        team_code: 'DEFAULT',
        team_name: 'NFL Default',
        team_city: 'League',
        team_conference: 'SYSTEM',
        team_division: 'DEFAULT',
        team_primary_color: '#013369',
        team_secondary_color: '#d50a0a',
        team_logo: '/logos/NFL.svg'
      };
      
      await nflDataService.createDefaultTeam(defaultColors);
      defaultTeam = defaultColors;
    }
    
    res.json({ defaultTeam });
  } catch (error) {
    console.error("Get default team error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
