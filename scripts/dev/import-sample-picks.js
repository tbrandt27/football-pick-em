import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';
import { v4 as uuidv4 } from 'uuid';
import DatabaseServiceFactory from '../../server/services/database/DatabaseServiceFactory.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Ensure DynamoDB configuration is set for localstack
process.env.DATABASE_TYPE = 'dynamodb';
process.env.USE_LOCALSTACK = 'true';
process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.DYNAMODB_TABLE_PREFIX = 'football_pickem_';

/**
 * Import sample pick data from CSV into localstack DynamoDB
 */
async function importSamplePicks() {
  console.log('🚀 Starting import of sample pick data to localstack DynamoDB...');
  
  try {
    // Import and initialize database singleton
    const { default: db } = await import('../../server/models/database.js');
    await db.initialize();
    
    // Get services
    const userService = DatabaseServiceFactory.getUserService();
    const gameService = DatabaseServiceFactory.getGameService();
    const pickService = DatabaseServiceFactory.getPickService();
    const nflDataService = DatabaseServiceFactory.getNFLDataService();
    
    // Find an existing football game to use for sample data
    console.log('🔍 Looking for existing football games...');
    
    const currentSeason = await nflDataService.getCurrentSeason();
    if (!currentSeason) {
      throw new Error('No current season found. Please set up NFL data first.');
    }
    
    console.log(`✅ Found current season: ${currentSeason.id}`);
    
    const week1Games = await nflDataService.getGamesBySeasonAndWeek(currentSeason.id, 1);
    if (week1Games.length === 0) {
      throw new Error('No week 1 games found. Please set up NFL game data first.');
    }
    
    // Use the first available game
    const footballGame = week1Games[0];
    console.log(`✅ Using football game: ${footballGame.away_team_city} ${footballGame.away_team_name} @ ${footballGame.home_team_city} ${footballGame.home_team_name}`);
    
    // Find an existing pickem game to associate picks with
    const games = await gameService.getAllGames();
    if (games.length === 0) {
      throw new Error('No pickem games found. Please create a game first.');
    }
    
    const pickeamGame = games[0]; // Use the first available game
    console.log(`✅ Using pickem game: ${pickeamGame.game_name}`);
    
    // Create sample user and pick preferences
    const sampleUsers = [
      {
        id: 'user-001',
        email: 'john.smith@example.com',
        first_name: 'John',
        last_name: 'Smith',
        preferences: { homeTeamBias: 0.7, tiebreakerRange: [35, 50] }
      },
      {
        id: 'user-002',
        email: 'sarah.johnson@example.com',
        first_name: 'Sarah',
        last_name: 'Johnson',
        preferences: { homeTeamBias: 0.3, tiebreakerRange: [20, 40] }
      },
      {
        id: 'user-003',
        email: 'mike.davis@example.com',
        first_name: 'Mike',
        last_name: 'Davis',
        preferences: { homeTeamBias: 0.6, tiebreakerRange: [30, 45] }
      },
      {
        id: 'user-004',
        email: 'emily.wilson@example.com',
        first_name: 'Emily',
        last_name: 'Wilson',
        preferences: { homeTeamBias: 0.8, tiebreakerRange: [25, 35] }
      },
      {
        id: 'user-005',
        email: 'david.brown@example.com',
        first_name: 'David',
        last_name: 'Brown',
        preferences: { homeTeamBias: 0.4, tiebreakerRange: [40, 55] }
      },
      {
        id: 'user-006',
        email: 'lisa.garcia@example.com',
        first_name: 'Lisa',
        last_name: 'Garcia',
        preferences: { homeTeamBias: 0.5, tiebreakerRange: [28, 42] }
      }
    ];
    
    // Track created entities
    const createdUsers = new Map();
    const createdPicks = [];
    
    console.log('\n👥 Creating users...');
    
    // Create users in database
    for (const userData of sampleUsers) {
      try {
        // Check if user already exists
        const existingUser = await userService.getUserById(userData.id);
        
        if (existingUser) {
          console.log(`👤 User ${userData.email} already exists, skipping creation`);
          createdUsers.set(userData.id, existingUser);
        } else {
          // Create new user with a default password
          const newUser = await userService.createUser({
            id: userData.id,
            email: userData.email,
            password: 'TempPassword123!', // Default password for demo users
            first_name: userData.first_name,
            last_name: userData.last_name,
            is_admin: false
          });
          
          console.log(`✅ Created user: ${userData.email} (${userData.first_name} ${userData.last_name})`);
          createdUsers.set(userData.id, newUser);
        }
      } catch (error) {
        console.error(`❌ Failed to create user ${userData.email}:`, error.message);
      }
    }
    
    console.log('\n👥 Adding users as game participants...');
    
    // Add all users as participants to the pickem game
    const addedParticipants = [];
    for (const userData of sampleUsers) {
      try {
        const user = createdUsers.get(userData.id);
        if (user) {
          await gameService.addParticipant(pickeamGame.id, userData.id, 'player');
          addedParticipants.push(user);
          console.log(`✅ Added ${user.first_name} ${user.last_name} as participant`);
        }
      } catch (error) {
        console.error(`❌ Failed to add participant ${userData.email}:`, error.message);
      }
    }

    console.log('\n🎯 Creating picks for ALL week 1 games...');
    console.log(`📊 Creating picks for ${week1Games.length} games across ${sampleUsers.length} users = ${week1Games.length * sampleUsers.length} total picks`);
    
    let totalPicksCreated = 0;
    
    // Create picks for each user for ALL week 1 games
    for (const userData of sampleUsers) {
      const user = createdUsers.get(userData.id);
      const userName = user ? `${user.first_name} ${user.last_name}` : userData.id;
      
      console.log(`\n🏈 Creating picks for ${userName}:`);
      
      for (let gameIndex = 0; gameIndex < week1Games.length; gameIndex++) {
        const game = week1Games[gameIndex];
        
        try {
          // Use user preferences to determine pick
          const homeTeamBias = userData.preferences.homeTeamBias;
          const pickHome = Math.random() < homeTeamBias;
          const pickTeamId = pickHome ? game.home_team_id : game.away_team_id;
          
          // Generate tiebreaker for first game only (if within range)
          let tiebreaker = null;
          if (gameIndex === 0 && userData.preferences.tiebreakerRange) {
            const [min, max] = userData.preferences.tiebreakerRange;
            tiebreaker = Math.floor(Math.random() * (max - min + 1)) + min;
          }
          
          // Create the pick
          const createdPick = await pickService.createOrUpdatePick({
            userId: userData.id,
            gameId: pickeamGame.id,
            footballGameId: game.id,
            pickTeamId: pickTeamId,
            tiebreaker: tiebreaker
          });
          
          // Simulate some correct/incorrect picks (60% correct rate)
          const isCorrect = Math.random() < 0.6 ? 1 : 0;
          await pickService.updatePickCorrectness(createdPick.id, isCorrect);
          
          createdPicks.push({
            user_id: userData.id,
            game_id: pickeamGame.id,
            football_game_id: game.id,
            pick_team_id: pickTeamId,
            tiebreaker: tiebreaker,
            is_correct: isCorrect
          });
          
          totalPicksCreated++;
          
          const teamName = pickHome ?
            `${game.home_team_city} ${game.home_team_name}` :
            `${game.away_team_city} ${game.away_team_name}`;
          const correctnessText = isCorrect === 1 ? '✓' : '✗';
          const tiebreakerText = tiebreaker ? ` (TB: ${tiebreaker})` : '';
          const vsText = pickHome ?
            `vs ${game.away_team_city} ${game.away_team_name}` :
            `@ ${game.home_team_city} ${game.home_team_name}`;
          
          console.log(`  ✅ ${teamName} ${vsText} ${correctnessText}${tiebreakerText}`);
          
        } catch (error) {
          console.error(`  ❌ Failed to create pick for game ${game.id}:`, error.message);
        }
      }
    }
    
    console.log('\n📊 Import Summary:');
    console.log(`👥 Users created/verified: ${createdUsers.size}`);
    console.log(`👫 Game participants added: ${addedParticipants.length}`);
    console.log(`🎯 Total picks created: ${totalPicksCreated}`);
    console.log(`🏈 Week 1 games covered: ${week1Games.length}`);
    console.log(`🎮 Pickem Game: ${pickeamGame.game_name}`);
    console.log(`🎮 Game ID: ${pickeamGame.id}`);
    console.log(`📅 Season: ${currentSeason.id}`);
    console.log(`📆 Week: 1`);
    
    // Show sample of created picks by game
    console.log('\n🏈 Sample picks by game:');
    const picksByGame = {};
    createdPicks.forEach(pick => {
      if (!picksByGame[pick.football_game_id]) {
        picksByGame[pick.football_game_id] = [];
      }
      picksByGame[pick.football_game_id].push(pick);
    });
    
    for (const game of week1Games.slice(0, 3)) { // Show first 3 games
      const gamePicks = picksByGame[game.id] || [];
      const correctPicks = gamePicks.filter(p => p.is_correct === 1).length;
      const incorrectPicks = gamePicks.filter(p => p.is_correct === 0).length;
      
      console.log(`  ${game.away_team_city} ${game.away_team_name} @ ${game.home_team_city} ${game.home_team_name}: ${gamePicks.length} picks (${correctPicks} ✓, ${incorrectPicks} ✗)`);
    }
    
    if (week1Games.length > 3) {
      console.log(`  ... and ${week1Games.length - 3} more games`);
    }
    
    console.log('\n🎉 Sample data import completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('1. Verify the data in your DynamoDB tables');
    console.log('2. Test the pick functionality in your application');
    console.log('3. Run pick calculations if needed');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}


// Run the import
importSamplePicks();