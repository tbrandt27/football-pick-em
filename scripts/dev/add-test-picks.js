import DatabaseServiceFactory from '../../server/services/database/DatabaseServiceFactory.js';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Ensure DynamoDB configuration is set
process.env.DATABASE_TYPE = 'dynamodb';
process.env.USE_LOCALSTACK = 'true';
process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.DYNAMODB_TABLE_PREFIX = 'football_pickem_';

async function addTestPicks() {
  console.log('🔧 Adding test picks for Local Weekly Test game...');
  
  try {
    // Import and initialize database provider first
    const { default: DatabaseProviderFactory } = await import('../../server/providers/DatabaseProviderFactory.js');
    await DatabaseProviderFactory.initialize();
    
    // Initialize services
    const gameService = DatabaseServiceFactory.getGameService();
    const nflDataService = DatabaseServiceFactory.getNFLDataService();
    const pickService = DatabaseServiceFactory.getPickService();
    const userService = DatabaseServiceFactory.getUserService();
    
    // Find the Local Weekly Test game
    const games = await gameService.getAllGames();
    const testGame = games.find(g => g.game_name === 'Local Weekly Test');
    
    if (!testGame) {
      console.error('❌ Local Weekly Test game not found');
      return;
    }
    
    console.log('✅ Found Local Weekly Test game:', testGame.id);
    
    // Get current season
    const currentSeason = await nflDataService.getCurrentSeason();
    if (!currentSeason) {
      console.error('❌ No current season found');
      return;
    }
    
    console.log('✅ Found current season:', currentSeason.id);
    
    // Get games for week 1
    const week1Games = await nflDataService.getGamesBySeasonAndWeek(currentSeason.id, 1);
    console.log(`✅ Found ${week1Games.length} games for week 1`);
    
    // Get the admin user (should be the test user)
    const users = await userService.getAllUsers();
    const adminUser = users.find(u => u.is_admin);
    
    if (!adminUser) {
      console.error('❌ No admin user found');
      return;
    }
    
    console.log('✅ Found admin user:', adminUser.email);
    
    // Create picks for the first 8 games
    const gamesToPickFrom = week1Games.slice(0, 8);
    let picksCreated = 0;
    
    for (const game of gamesToPickFrom) {
      try {
        // Randomly pick home or away team
        const pickTeamId = Math.random() > 0.5 ? game.home_team_id : game.away_team_id;
        const tiebreaker = gamesToPickFrom.indexOf(game) === 0 ? 45 : null; // First game gets tiebreaker
        
        const pickData = {
          game_id: testGame.id,
          user_id: adminUser.id,
          football_game_id: game.id,
          pick_team_id: pickTeamId,
          tiebreaker: tiebreaker,
          season_id: currentSeason.id,
          week: 1
        };
        
        await pickService.createPick(pickData);
        picksCreated++;
        
        const teamName = pickTeamId === game.home_team_id ? 
          `${game.home_team_city} ${game.home_team_name}` : 
          `${game.away_team_city} ${game.away_team_name}`;
        
        console.log(`✅ Created pick for ${teamName} in game vs ${pickTeamId === game.home_team_id ? `${game.away_team_city} ${game.away_team_name}` : `${game.home_team_city} ${game.home_team_name}`}`);
        
      } catch (error) {
        console.error(`❌ Failed to create pick for game ${game.id}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Successfully created ${picksCreated} test picks!`);
    
    // Now let's mark a couple games as completed with scores to test the refresh logic
    console.log('\n🔧 Marking some games as completed with scores...');
    
    // Mark first 3 games as completed
    const gamesToComplete = gamesToPickFrom.slice(0, 3);
    
    for (const game of gamesToComplete) {
      try {
        // Create random final scores
        const homeScore = Math.floor(Math.random() * 35) + 10; // 10-45 points
        const awayScore = Math.floor(Math.random() * 35) + 10; // 10-45 points
        
        const updateData = {
          home_score: homeScore,
          away_score: awayScore,
          status: 'STATUS_FINAL',
          scores_updated_at: new Date().toISOString()
        };
        
        await nflDataService.updateGame(game.id, updateData);
        
        console.log(`✅ Completed game: ${game.away_team_city} ${game.away_team_name} (${awayScore}) @ ${game.home_team_city} ${game.home_team_name} (${homeScore})`);
        
      } catch (error) {
        console.error(`❌ Failed to complete game ${game.id}:`, error.message);
      }
    }
    
    console.log('\n🔧 Running pick calculator to mark correct/incorrect picks...');
    
    // Import and run pick calculator
    const { default: pickCalculator } = await import('../../server/services/pickCalculator.js');
    const result = await pickCalculator.calculatePicks(currentSeason.id, 1);
    
    console.log(`✅ Pick calculation completed: ${result.updatedPicks} picks updated for ${result.completedGames} completed games`);
    
    console.log('\n🎉 Test data setup complete! You can now test the WeeklyGameView with real picks and completed games.');
    
  } catch (error) {
    console.error('❌ Failed to add test picks:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the function
addTestPicks();