import { v4 as uuidv4 } from 'uuid';
import db from '../models/database.js';

const footballTeams = [
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

export async function seedTeams() {
  console.log('Seeding NFL teams...');
  
  try {
    // Check if we're using DynamoDB and use native DynamoDB operations if so
    if (db.getType && db.getType() === 'dynamodb') {
      return await seedTeamsDynamoDB();
    }
    
    // SQLite/traditional SQL path
    for (const team of footballTeams) {
      const existingTeam = await db.get('SELECT id FROM football_teams WHERE team_code = ?', [team.code]);
      
      if (!existingTeam) {
        const logoPath = `/logos/${team.code}.svg`;
        
        await db.run(`
          INSERT INTO football_teams (
            id, team_code, team_name, team_city, team_conference,
            team_division, team_logo, team_primary_color, team_secondary_color
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uuidv4(),
          team.code,
          team.name,
          team.city,
          team.conference,
          team.division,
          logoPath,
          team.primaryColor,
          team.secondaryColor
        ]);
        
        console.log(`Added ${team.city} ${team.name} with logo ${logoFilename}`);
      } else {
        // Update existing team with missing data (colors, logos, conference info)
        await updateExistingTeam(existingTeam.id, team);
      }
    }
    
    console.log('NFL teams seeding completed');
  } catch (error) {
    console.error('Error seeding teams:', error);
    throw error;
  }
}

// DynamoDB-native seeding function to avoid SQL parsing issues
async function seedTeamsDynamoDB() {
  console.log('Seeding NFL teams for DynamoDB...');
  
  try {
    for (const team of footballTeams) {
      // Check if team already exists using multiple approaches for maximum reliability
      let existingTeam = null;
      
      // Method 1: Try scan with filter
      try {
        const scanResult = await db._dynamoScan('football_teams', { team_code: team.code });
        if (scanResult && scanResult.Items && scanResult.Items.length > 0) {
          existingTeam = scanResult.Items[0];
          console.log(`[DynamoDB] Found existing team ${team.code} via filtered scan`);
        }
      } catch (scanError) {
        console.log(`[DynamoDB] Filtered scan failed for ${team.code}:`, scanError.message);
      }
      
      // Method 2: If not found, try scanning all teams and filter in memory
      if (!existingTeam) {
        try {
          const allTeamsResult = await db._dynamoScan('football_teams');
          if (allTeamsResult && allTeamsResult.Items) {
            existingTeam = allTeamsResult.Items.find(t => t.team_code === team.code);
            if (existingTeam) {
              console.log(`[DynamoDB] Found existing team ${team.code} via fallback scan`);
            }
          }
        } catch (fallbackError) {
          console.log(`[DynamoDB] Fallback scan also failed for ${team.code}:`, fallbackError.message);
        }
      }
      
      // Method 3: Double-check with a small delay and retry (eventual consistency)
      if (!existingTeam) {
        console.log(`[DynamoDB] No team found for ${team.code}, waiting and retrying...`);
        await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay
        
        try {
          const retryResult = await db._dynamoScan('football_teams');
          if (retryResult && retryResult.Items) {
            existingTeam = retryResult.Items.find(t => t.team_code === team.code);
            if (existingTeam) {
              console.log(`[DynamoDB] Found existing team ${team.code} via retry scan`);
            }
          }
        } catch (retryError) {
          console.log(`[DynamoDB] Retry scan failed for ${team.code}:`, retryError.message);
        }
      }
      
      if (!existingTeam) {
        const logoPath = `/logos/${team.code}.svg`;
        
        // Create team item with proper structure for DynamoDB
        const teamItem = {
          id: uuidv4(),
          team_code: team.code,
          team_name: team.name,
          team_city: team.city,
          team_conference: team.conference,
          team_division: team.division,
          team_logo: logoPath,
          team_primary_color: team.primaryColor,
          team_secondary_color: team.secondaryColor,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        console.log(`[DynamoDB] Creating team ${team.code}:`, teamItem);
        
        // Use native DynamoDB PUT operation
        await db._dynamoPut('football_teams', teamItem);
        
        console.log(`Added ${team.city} ${team.name} with logo ${logoFilename}`);
      } else {
        console.log(`Team ${team.code} already exists (ID: ${existingTeam.id}), skipping`);
        
        // Update existing team with missing data if needed
        try {
          await updateExistingTeamDynamoDB(existingTeam, team);
        } catch (updateError) {
          console.error(`Failed to update existing team ${team.code}:`, updateError);
        }
      }
    }
    
    console.log('DynamoDB NFL teams seeding completed');
  } catch (error) {
    console.error('Error seeding teams in DynamoDB:', error);
    throw error;
  }
}

async function updateExistingTeam(teamId, teamData) {
  try {
    // Get current team data
    const currentTeam = await db.get('SELECT * FROM football_teams WHERE id = ?', [teamId]);
    
    if (!currentTeam) {
      console.log(`Team with id ${teamId} not found for update`);
      return;
    }
    
    const logoPath = `/logos/${teamData.code}.svg`;
    
    // Update any missing fields
    const updates = {};
    
    if (!currentTeam.team_conference || currentTeam.team_conference === 'undefined' || currentTeam.team_conference === 'Unknown') {
      updates.team_conference = teamData.conference;
    }
    if (!currentTeam.team_division || currentTeam.team_division === 'undefined' || currentTeam.team_division === 'Unknown') {
      updates.team_division = teamData.division;
    }
    if (!currentTeam.team_logo) {
      updates.team_logo = logoPath;
    }
    if (!currentTeam.team_primary_color) {
      updates.team_primary_color = teamData.primaryColor;
    }
    if (!currentTeam.team_secondary_color) {
      updates.team_secondary_color = teamData.secondaryColor;
    }
    if (!currentTeam.team_city || currentTeam.team_city === 'undefined') {
      updates.team_city = teamData.city;
    }
    if (!currentTeam.team_name || currentTeam.team_name === 'undefined') {
      updates.team_name = teamData.name;
    }
    
    // Only update if there are fields to update
    if (Object.keys(updates).length > 0) {
      const updateFields = Object.keys(updates).map(field => `${field} = ?`).join(', ');
      const updateValues = Object.values(updates);
      
      await db.run(
        `UPDATE football_teams SET ${updateFields}, updated_at = datetime('now') WHERE id = ?`,
        [...updateValues, teamId]
      );
      
      console.log(`Updated ${teamData.code} with missing fields:`, Object.keys(updates));
    } else {
      console.log(`${teamData.code} already has all required data`);
    }
  } catch (error) {
    console.error(`Error updating existing team ${teamData.code}:`, error);
  }
}

export async function updateTeamLogos() {
  console.log('Updating team logos...');
  
  try {
    const teams = await db.all('SELECT id, team_code FROM football_teams WHERE team_logo IS NULL OR team_logo = ""');
    
    for (const team of teams) {
      const logoPath = `/logos/${team.team_code}.svg`;
      
      await db.run('UPDATE football_teams SET team_logo = ? WHERE id = ?', [logoPath, team.id]);
      console.log(`Updated ${team.team_code} with logo ${team.team_code}.svg`);
    }
    
    console.log('Team logos update completed');
  } catch (error) {
    console.error('Error updating team logos:', error);
  }
}



// Helper function to update existing DynamoDB teams
async function updateExistingTeamDynamoDB(existingTeam, teamData) {
  try {
    const logoPath = `/logos/${teamData.code}.svg`;
    
    // Check what fields need updating
    const updates = {};
    
    if (!existingTeam.team_conference || existingTeam.team_conference === 'undefined' || existingTeam.team_conference === 'Unknown') {
      updates.team_conference = teamData.conference;
    }
    if (!existingTeam.team_division || existingTeam.team_division === 'undefined' || existingTeam.team_division === 'Unknown') {
      updates.team_division = teamData.division;
    }
    if (!existingTeam.team_logo) {
      updates.team_logo = logoPath;
    }
    if (!existingTeam.team_primary_color) {
      updates.team_primary_color = teamData.primaryColor;
    }
    if (!existingTeam.team_secondary_color) {
      updates.team_secondary_color = teamData.secondaryColor;
    }
    if (!existingTeam.team_city || existingTeam.team_city === 'undefined') {
      updates.team_city = teamData.city;
    }
    if (!existingTeam.team_name || existingTeam.team_name === 'undefined') {
      updates.team_name = teamData.name;
    }
    
    // Only update if there are fields to update
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      await db._dynamoUpdate('football_teams', { id: existingTeam.id }, updates);
      console.log(`Updated ${teamData.code} with missing fields:`, Object.keys(updates));
    } else {
      console.log(`${teamData.code} already has all required data`);
    }
  } catch (error) {
    console.error(`Error updating existing DynamoDB team ${teamData.code}:`, error);
  }
}

// Run seeding if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedTeams().then(() => {
    db.close();
  });
}