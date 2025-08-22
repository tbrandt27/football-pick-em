import 'dotenv/config';
import db from './server/models/database.js';
import espnApi from './server/services/espnApi.js';

console.log('🏈 Testing ESPN API sync directly...');

async function testSync() {
    try {
        // Wait for database to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('✅ Database ready');
        
        // Get current season
        const currentSeason = await db.get('SELECT * FROM seasons WHERE is_current = 1');
        console.log('📅 Current season:', currentSeason);
        
        if (!currentSeason) {
            console.log('❌ No current season found');
            return;
        }
        
        // Test updating NFL games
        console.log('🔄 Testing ESPN sync...');
        const result = await espnApi.updateNFLGames(currentSeason.id);
        console.log('✅ ESPN sync result:', result);
        
        // Check games count
        const gameCount = await db.get('SELECT COUNT(*) as count FROM football_games');
        console.log('📊 Total games in database:', gameCount.count);
        
    } catch (error) {
        console.error('❌ ESPN sync failed:', error);
        console.error('Stack trace:', error.stack);
    } finally {
        await db.close();
    }
}

testSync();