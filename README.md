# NFL Pick'em Application

A full-stack web application for managing NFL pick'em games with friends, colleagues, or leagues. Built with Astro, React, Node.js, and SQLite.

## 🏈 Features

### User Features

- **User Registration & Authentication** - Secure login system with JWT tokens
- **Game Creation** - Create weekly or survivor-style pick'em games
- **Pick Management** - Make picks for each NFL game with tiebreaker support
- **Real-time Scoring** - Automatic score updates from ESPN API
- **Leaderboards** - Track performance across weeks and seasons
- **Copy Picks** - Duplicate picks across multiple games
- **Responsive Design** - Works on desktop and mobile devices

### Admin Features

- **Admin Dashboard** - Comprehensive management interface
- **User Management** - Manage user accounts and permissions
- **Game Management** - Oversee all pick'em games and participants
- **Season Management** - Create and manage NFL seasons
- **SMTP Configuration** - Configure email settings for invitations
- **ESPN Integration** - Sync NFL schedules and scores
- **Automated Scheduler** - Automatic score updates during game days

### Technical Features

- **RESTful API** - Express.js backend with organized routes
- **Database** - SQLite with automated migrations
- **Email System** - Invitation emails with SMTP configuration
- **Cron Jobs** - Automated score updates and pick calculations
- **Security** - Encrypted sensitive data, input validation, CORS protection

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd football-pickem
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up the database and create admin user**

   ```bash
   npm run setup
   ```

   This will:

   - Create SQLite database with all tables
   - Seed NFL teams data
   - Create the current season
   - Create an admin user (credentials will be displayed)

4. **Start the development server**

   ```bash
   npm run dev
   ```

   This starts both frontend (port 4321) and backend (port 3001) servers.

5. **Access the application**
   - Frontend: http://localhost:4321
   - Backend API: http://localhost:3001/api

## 📁 Project Structure

```
football-pickem/
├── src/                          # Frontend (Astro + React)
│   ├── components/              # React components
│   │   ├── AdminDashboard.tsx   # Admin management interface
│   │   ├── Dashboard.tsx        # User dashboard
│   │   ├── GameViewRouter.tsx   # Routes between Weekly and Survivor game views
│   │   ├── WeeklyGameView.tsx   # Weekly pick game interface
│   │   ├── SurvivorGameView.tsx # Survivor game interface
│   │   ├── GamesManager.tsx     # Admin game management
│   │   └── ...
│   ├── layouts/                 # Astro layouts
│   ├── pages/                   # Astro pages/routes
│   ├── stores/                  # Nanostores for state management
│   └── utils/                   # Utilities and API client
├── server/                      # Backend (Node.js + Express)
│   ├── routes/                  # API route handlers
│   │   ├── admin.js            # Admin-only endpoints
│   │   ├── auth.js             # Authentication
│   │   ├── games.js            # Game management
│   │   ├── picks.js            # Pick management
│   │   └── ...
│   ├── services/               # Business logic services
│   │   ├── espnApi.js          # ESPN API integration
│   │   ├── emailService.js     # Email functionality
│   │   ├── scheduler.js        # Automated tasks
│   │   └── ...
│   ├── models/                 # Database models
│   ├── middleware/             # Express middleware
│   └── utils/                  # Utility functions
├── public/                     # Static assets
│   └── logos/                  # NFL team logos
├── database.sqlite             # SQLite database (created on setup)
├── setup.js                    # Database setup script
└── package.json
```

## 🧪 Testing the Application

To test the application functionality:

1. **Create Test Users:** Use the registration feature to create multiple user accounts
2. **Set up Games:** Create pick'em games using the admin dashboard
3. **Import NFL Data:** Use the ESPN sync feature to import current NFL schedules
4. **Make Test Picks:** Login with different users and make picks for upcoming games

### Admin Access

After running `npm run setup`, you'll have an admin account with credentials displayed during setup.

### What You Can Test

- **Pick Making:** Create users and make picks for upcoming NFL games
- **Leaderboards:** View standings and user performance across weeks
- **Stats Tracking:** See win percentages, correct picks, and rankings
- **Game Management:** Create new games, invite players, manage settings
- **Admin Functions:** Manage users, sync schedules, calculate picks
- **Responsive Design:** Test on different screen sizes
- **Copy Picks:** Test copying picks between multiple games

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_PATH=./database.sqlite

# JWT Secret (generate a secure random string)
JWT_SECRET=your-super-secret-jwt-key-here

# SMTP Configuration (optional - can be configured via admin panel)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=your-email@gmail.com

# Application URL
CLIENT_URL=http://localhost:4321

# Settings Encryption Key (for admin SMTP settings)
SETTINGS_ENCRYPTION_KEY=your-32-character-encryption-key

# Server Port
PORT=3001
```

### SMTP Setup

You can configure SMTP settings either:

1. **Via Environment Variables** - Set the SMTP\_\* variables above
2. **Via Admin Panel** - Login as admin and go to Settings to configure SMTP

For Gmail:

- Use your Gmail address as SMTP_USER
- Generate an App Password (not your regular password)
- Enable 2-factor authentication first

## 📊 Admin Setup

After running `npm run setup`, you'll have an admin account. Use the admin dashboard to:

1. **Configure Current Season**

   - Go to Admin → Seasons
   - Set the current NFL season as active

2. **Sync NFL Data**

   - Go to Admin Dashboard
   - Use "Sync Full Schedule" to import games from ESPN
   - Enable the automatic scheduler for live updates

3. **Configure SMTP** (Optional)

   - Go to Admin → Settings
   - Configure email settings for game invitations

4. **Create Your First Game**
   - Use "Create Game" to set up a pick'em pool
   - Invite players via email

## 🎮 Usage

### For Players

1. **Register/Login** - Create an account or login
2. **Join Games** - Accept invitations or find public games
3. **Make Picks** - Select winning teams for each week
4. **Set Tiebreakers** - Choose total points for tiebreaker games
5. **Track Progress** - View leaderboards and your performance

### For Game Commissioners

1. **Create Games** - Set up weekly or survivor pools
2. **Invite Players** - Send email invitations
3. **Manage Participants** - Add/remove players
4. **Monitor Progress** - View all picks and standings

### For Administrators

1. **User Management** - Manage all user accounts
2. **System Configuration** - SMTP, seasons, teams
3. **Data Management** - ESPN sync, score updates
4. **Game Oversight** - View and manage all games

## 🔄 Deployment

### AWS App Runner (Recommended)

The application is optimized for deployment on AWS App Runner with containerization support.

**Quick Deploy:**

1. Push your code to GitHub/GitLab/Bitbucket
2. Follow the [Deployment Guide](DEPLOYMENT.md)
3. Use the [Deployment Checklist](DEPLOYMENT_CHECKLIST.md)

**Key Files:**

- [`Dockerfile`](Dockerfile) - Container configuration
- [`apprunner.yaml`](apprunner.yaml) - App Runner configuration
- [`scripts/start.sh`](scripts/start.sh) - Production startup script
- [`.env.production.template`](.env.production.template) - Environment variables template

### Traditional Server Deployment

For traditional server deployment, see the detailed instructions below.

### Prerequisites for Production

- **Server Requirements:**

  - Node.js 18+ (LTS recommended)
  - 2GB+ RAM
  - 10GB+ disk space
  - Ubuntu 20.04+ or similar Linux distribution

- **Domain & SSL:**

  - Domain name pointing to your server
  - SSL certificate (Let's Encrypt recommended)

- **Email Service (Optional):**
  - SMTP credentials for sending invitations
  - Gmail, SendGrid, or similar service

### Production Environment Setup

1. **Create Production Environment File**

   ```bash
   # Create .env file with production values
   cat > .env << EOF
   # Database
   DATABASE_PATH=./database.sqlite

   # JWT Secret (generate a secure random string)
   JWT_SECRET=$(openssl rand -base64 32)

   # SMTP Configuration (optional)
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   FROM_EMAIL=your-email@gmail.com

   # Application URL
   CLIENT_URL=https://yourdomain.com

   # Settings Encryption Key (32 characters)
   SETTINGS_ENCRYPTION_KEY=$(openssl rand -base64 24)

   # Server Configuration
   NODE_ENV=production
   PORT=3001
   EOF
   ```

2. **Install Dependencies**

   ```bash
   npm ci --only=production
   ```

3. **Build the Application**

   ```bash
   npm run build
   ```

4. **Initialize Database**

   ```bash
   npm run setup
   ```

   **Important:** Save the admin credentials displayed during setup!

### Deployment Options

#### Option 1: PM2 Process Manager (Recommended)

1. **Install PM2**

   ```bash
   npm install -g pm2
   ```

2. **Create PM2 Ecosystem File**

   ```bash
   cat > ecosystem.config.js << EOF
   module.exports = {
     apps: [
       {
         name: 'football-pickem-api',
         script: 'server/index.js',
         env: {
           NODE_ENV: 'production',
           PORT: 3001
         },
         instances: 1,
         autorestart: true,
         watch: false,
         max_memory_restart: '1G',
         error_file: './logs/api-error.log',
         out_file: './logs/api-out.log',
         log_file: './logs/api-combined.log'
       },
       {
         name: 'football-pickem-web',
         script: 'npm',
         args: 'run preview',
         env: {
           NODE_ENV: 'production',
           PORT: 4321
         },
         instances: 1,
         autorestart: true,
         watch: false,
         max_memory_restart: '512M',
         error_file: './logs/web-error.log',
         out_file: './logs/web-out.log',
         log_file: './logs/web-combined.log'
       }
     ]
   };
   EOF
   ```

3. **Start Services**

   ```bash
   # Create logs directory
   mkdir -p logs

   # Start both services
   pm2 start ecosystem.config.js

   # Save PM2 configuration
   pm2 save

   # Setup PM2 to start on boot
   pm2 startup
   ```

4. **Monitor Services**

   ```bash
   # View status
   pm2 status

   # View logs
   pm2 logs

   # Restart services
   pm2 restart all
   ```

#### Option 2: Docker Deployment

1. **Create Dockerfile**

   ```dockerfile
   FROM node:18-alpine

   WORKDIR /app

   # Copy package files
   COPY package*.json ./
   RUN npm ci --only=production

   # Copy application code
   COPY . .

   # Build frontend
   RUN npm run build

   # Create non-root user
   RUN addgroup -g 1001 -S nodejs
   RUN adduser -S nextjs -u 1001

   # Set permissions
   RUN chown -R nextjs:nodejs /app
   USER nextjs

   EXPOSE 3001 4321

   # Start both services
   CMD ["sh", "-c", "npm run preview & node server/index.js"]
   ```

2. **Create docker-compose.yml**

   ```yaml
   version: "3.8"
   services:
     football-pickem:
       build: .
       ports:
         - "3001:3001"
         - "4321:4321"
       environment:
         - NODE_ENV=production
         - DATABASE_PATH=/app/data/database.sqlite
         - CLIENT_URL=https://yourdomain.com
       volumes:
         - ./data:/app/data
         - ./logs:/app/logs
       restart: unless-stopped
   ```

3. **Deploy with Docker**

   ```bash
   # Build and start
   docker-compose up -d

   # View logs
   docker-compose logs -f
   ```

### Nginx Reverse Proxy Setup

1. **Install Nginx**

   ```bash
   sudo apt update
   sudo apt install nginx
   ```

2. **Create Nginx Configuration**

   ```bash
   sudo tee /etc/nginx/sites-available/football-pickem << EOF
   server {
       listen 80;
       server_name yourdomain.com www.yourdomain.com;

       # Redirect HTTP to HTTPS
       return 301 https://\$server_name\$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name yourdomain.com www.yourdomain.com;

       # SSL Configuration (Let's Encrypt)
       ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

       # Security headers
       add_header X-Frame-Options DENY;
       add_header X-Content-Type-Options nosniff;
       add_header X-XSS-Protection "1; mode=block";

       # Frontend
       location / {
           proxy_pass http://localhost:4321;
           proxy_set_header Host \$host;
           proxy_set_header X-Real-IP \$remote_addr;
           proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto \$scheme;
       }

       # API
       location /api/ {
           proxy_pass http://localhost:3001;
           proxy_set_header Host \$host;
           proxy_set_header X-Real-IP \$remote_addr;
           proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto \$scheme;
       }

       # Static assets with caching
       location /logos/ {
           alias /path/to/football-pickem/public/logos/;
           expires 1y;
           add_header Cache-Control "public, immutable";
       }

       # Gzip compression
       gzip on;
       gzip_vary on;
       gzip_min_length 1024;
       gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
   }
   EOF
   ```

3. **Enable Site and SSL**

   ```bash
   # Enable site
   sudo ln -s /etc/nginx/sites-available/football-pickem /etc/nginx/sites-enabled/

   # Test configuration
   sudo nginx -t

   # Install Certbot for Let's Encrypt
   sudo apt install certbot python3-certbot-nginx

   # Get SSL certificate
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

   # Restart Nginx
   sudo systemctl restart nginx
   ```

### Database Backup & Maintenance

1. **Automated Backup Script**

   ```bash
   cat > backup.sh << EOF
   #!/bin/bash

   # Configuration
   DB_PATH="./database.sqlite"
   BACKUP_DIR="./backups"
   DATE=\$(date +%Y%m%d_%H%M%S)

   # Create backup directory
   mkdir -p \$BACKUP_DIR

   # Create backup
   sqlite3 \$DB_PATH ".backup \$BACKUP_DIR/database_\$DATE.sqlite"

   # Keep only last 30 backups
   find \$BACKUP_DIR -name "database_*.sqlite" -type f -mtime +30 -delete

   echo "Backup completed: database_\$DATE.sqlite"
   EOF

   chmod +x backup.sh
   ```

2. **Setup Cron Job for Daily Backups**
   ```bash
   # Add to crontab
   (crontab -l 2>/dev/null; echo "0 2 * * * /path/to/football-pickem/backup.sh") | crontab -
   ```

### Monitoring & Logging

1. **Log Rotation Setup**

   ```bash
   sudo tee /etc/logrotate.d/football-pickem << EOF
   /path/to/football-pickem/logs/*.log {
       daily
       missingok
       rotate 30
       compress
       delaycompress
       notifempty
       copytruncate
   }
   EOF
   ```

2. **System Monitoring**

   ```bash
   # Check application status
   pm2 status

   # Monitor system resources
   htop

   # Check disk space
   df -h

   # View application logs
   pm2 logs --lines 100
   ```

### Security Considerations

1. **Firewall Setup**

   ```bash
   # Enable UFW
   sudo ufw enable

   # Allow SSH, HTTP, and HTTPS
   sudo ufw allow ssh
   sudo ufw allow 80
   sudo ufw allow 443

   # Block direct access to application ports
   sudo ufw deny 3001
   sudo ufw deny 4321
   ```

2. **Regular Updates**

   ```bash
   # Update system packages
   sudo apt update && sudo apt upgrade

   # Update Node.js dependencies
   npm audit fix

   # Update PM2
   npm install -g pm2@latest
   pm2 update
   ```

### Troubleshooting

**Common Issues:**

1. **Application won't start:**

   ```bash
   # Check logs
   pm2 logs

   # Verify environment variables
   cat .env

   # Check database permissions
   ls -la database.sqlite
   ```

2. **Database connection errors:**

   ```bash
   # Verify database exists and is readable
   sqlite3 database.sqlite ".tables"

   # Re-run setup if needed
   npm run setup
   ```

3. **SMTP/Email issues:**

   ```bash
   # Test SMTP settings in admin panel
   # Check firewall rules for SMTP ports
   # Verify email credentials
   ```

4. **Performance issues:**

   ```bash
   # Monitor system resources
   htop

   # Check PM2 memory usage
   pm2 monit

   # Restart services
   pm2 restart all
   ```

### Scaling Considerations

For high-traffic deployments:

1. **Load Balancing:** Use multiple PM2 instances
2. **Database:** Consider PostgreSQL for better performance
3. **Caching:** Implement Redis for session storage
4. **CDN:** Use CloudFlare or similar for static assets
5. **Monitoring:** Implement application monitoring (New Relic, DataDog)

## 🛠️ Development

### Available Scripts

| Command                | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | Start both frontend and backend in development mode |
| `npm run dev:frontend` | Start only the Astro dev server (port 4321)         |
| `npm run dev:backend`  | Start only the Express server (port 3001)           |
| `npm run build`        | Build the frontend for production                   |
| `npm run preview`      | Preview the production build                        |
| `npm run setup`        | Set up database and create admin user               |

### Key Technologies

- **Frontend**: Astro + React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + SQLite
- **Authentication**: JWT tokens
- **State Management**: Nanostores
- **Styling**: Tailwind CSS + Heroicons
- **Email**: Nodemailer
- **Scheduling**: node-cron
- **External APIs**: ESPN API for NFL data

### Database Schema

The application uses SQLite with the following main tables:

- `users` - User accounts and profiles
- `pickem_games` - Pick'em games/pools
- `game_participants` - User participation in games
- `nfl_teams` - NFL team information
- `seasons` - NFL seasons
- `nfl_games` - NFL game schedule and scores
- `picks` - User picks for games
- `game_invitations` - Email invitations
- `system_settings` - Admin configuration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support or questions:

1. Check the admin dashboard for system status
2. Review the server logs for error messages
3. Ensure your database has been set up correctly
4. Verify SMTP configuration if email isn't working

## 🎉 Acknowledgments

- ESPN for providing NFL data API
- NFL teams for logos and brand assets
- Astro and React communities for excellent documentation
- All contributors to this project
