import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db from './server/models/database.js';
import { seedTeams } from './server/utils/seedTeams.js';

async function setupDatabase() {
  console.log('🗃️  Setting up Football Pickem database...\n');

  try {
    // 1. Seed NFL teams
    console.log('📋 Seeding NFL teams...');
    await seedTeams();
    console.log('✅ NFL teams seeded successfully\n');

    // 2. Create default season
    console.log('🏈 Creating default season...');
    const currentYear = new Date().getFullYear().toString();
    
    // Import DatabaseServiceFactory to use proper season service
    const { default: DatabaseServiceFactory } = await import('./server/services/database/DatabaseServiceFactory.js');
    const seasonService = DatabaseServiceFactory.getSeasonService();
    
    try {
      // Check if season already exists using the service layer
      const existingSeason = await seasonService.getSeasonByYear(currentYear);
      
      if (!existingSeason) {
        // Use the season service to create the season (with duplicate prevention)
        const newSeason = await seasonService.createSeason({
          season: currentYear,
          isCurrent: true
        });
        
        console.log(`✅ Created ${currentYear} season as current season (ID: ${newSeason.id})\n`);
      } else {
        console.log(`ℹ️  Season ${currentYear} already exists\n`);
      }
    } catch (error) {
      if (error.message.includes('Season already exists')) {
        console.log(`ℹ️  Season ${currentYear} already exists\n`);
      } else {
        console.error(`❌ Failed to create season: ${error.message}\n`);
        throw error;
      }
    }

    // 3. Create admin user
    console.log('👤 Creating admin user...');
    
    const adminEmail = 'admin@nflpickem.com';
    const adminPassword = 'admin123';
    
    const existingAdmin = await db.get('SELECT id FROM users WHERE email = ?', [adminEmail]);
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      const adminId = uuidv4();
      
      await db.run(`
        INSERT INTO users (
          id, email, password, first_name, last_name, is_admin, email_verified
        ) VALUES (?, ?, ?, ?, ?, 1, 1)
      `, [adminId, adminEmail, hashedPassword, 'Admin', 'User']);
      
      console.log('✅ Admin user created successfully');
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Password: ${adminPassword}`);
      console.log('   🚨 CHANGE THIS PASSWORD AFTER FIRST LOGIN!\n');
    } else {
      console.log('ℹ️  Admin user already exists\n');
    }

    // 4. Display summary
    const [userCount, teamCount, seasonCount] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM users'),
      db.get('SELECT COUNT(*) as count FROM football_teams'),
      db.get('SELECT COUNT(*) as count FROM seasons')
    ]);

    console.log('📊 Database Summary:');
    console.log(`   Users: ${userCount.count}`);
    console.log(`   NFL Teams: ${teamCount.count}`);
    console.log(`   Seasons: ${seasonCount.count}\n`);

    console.log('🎉 Database setup complete!');
    console.log('\nNext steps:');
    console.log('1. Run "npm run dev" to start the application');
    console.log('2. Login as admin to set up the current season games');
    console.log('3. Use Admin Dashboard to sync with ESPN API');
    console.log('4. Create your first Pickem game!\n');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run setup
setupDatabase();