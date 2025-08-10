# AWS App Runner Deployment Checklist

Use this checklist to ensure a successful deployment of the NFL Pick'em application to AWS App Runner.

## Pre-Deployment Checklist

### 1. Repository Preparation

- [ ] All deployment files are committed to your repository
  - [ ] `Dockerfile`
  - [ ] `apprunner.yaml`
  - [ ] `scripts/start.sh`
  - [ ] `scripts/init-db.js`
  - [ ] `.dockerignore`
  - [ ] `DEPLOYMENT.md`
- [ ] Repository is accessible to AWS App Runner (GitHub/GitLab/Bitbucket)

### 2. Security Keys Generation

- [ ] Generate JWT_SECRET: `openssl rand -base64 32`
- [ ] Generate SETTINGS_ENCRYPTION_KEY: `openssl rand -base64 24`
- [ ] Store keys securely (you'll need them for environment variables)

### 3. SMTP Configuration (Optional)

- [ ] SMTP service configured (Gmail, SendGrid, etc.)
- [ ] App passwords generated if using Gmail
- [ ] SMTP credentials ready

## Deployment Checklist

### 1. AWS App Runner Service Creation

- [ ] Open AWS App Runner Console
- [ ] Create new service
- [ ] Connect to source repository
- [ ] Select correct branch (main/master)
- [ ] Choose "Use a configuration file" (apprunner.yaml)

### 2. Service Configuration

- [ ] Service name: `football-pickem` (or your choice)
- [ ] CPU: 1 vCPU (minimum)
- [ ] Memory: 2 GB (minimum)

### 3. Environment Variables Setup

**Required Variables:**

- [ ] `NODE_ENV=production`
- [ ] `PORT=8080`
- [ ] `FRONTEND_PORT=8080`
- [ ] `BACKEND_PORT=3001`
- [ ] `DATABASE_PATH=/app/data/database.sqlite`
- [ ] `JWT_SECRET=<your-generated-secret>`
- [ ] `SETTINGS_ENCRYPTION_KEY=<your-generated-key>`

**Application URLs (set after getting App Runner URL):**

- [ ] `CLIENT_URL=https://your-app-name.region.awsapprunner.com`
- [ ] `FRONTEND_URL=https://your-app-name.region.awsapprunner.com`

**Optional Admin Configuration:**

- [ ] `ADMIN_EMAIL=admin@nflpickem.com`
- [ ] `ADMIN_PASSWORD=<secure-password>`

**Optional SMTP Configuration:**

- [ ] `SMTP_HOST=smtp.gmail.com`
- [ ] `SMTP_PORT=587`
- [ ] `SMTP_USER=<your-email>`
- [ ] `SMTP_PASS=<your-app-password>`
- [ ] `FROM_EMAIL=<your-email>`

### 4. Deploy and Verify

- [ ] Click "Create & deploy"
- [ ] Wait for deployment to complete (5-10 minutes)
- [ ] Verify service is running in App Runner console

## Post-Deployment Checklist

### 1. Update Environment Variables

- [ ] Get the App Runner URL from the console
- [ ] Update `CLIENT_URL` environment variable
- [ ] Update `FRONTEND_URL` environment variable
- [ ] Restart service if needed

### 2. Application Setup

- [ ] Access the application URL
- [ ] Verify the application loads correctly
- [ ] Login with admin credentials
- [ ] Access Admin Dashboard

### 3. Configure Application

- [ ] Go to Admin → Settings
- [ ] Configure SMTP settings (if not set via environment variables)
- [ ] Test email functionality
- [ ] Go to Admin → Seasons
- [ ] Verify current season is set
- [ ] Use "Sync Full Schedule" to import NFL games from ESPN

### 4. Create First Game

- [ ] Create a test Pick'em game
- [ ] Invite test users
- [ ] Verify email invitations work
- [ ] Test pick submission functionality

### 5. Production Readiness

- [ ] Set up monitoring/alerting
- [ ] Configure custom domain (optional)
- [ ] Set up database backup strategy
- [ ] Document admin credentials securely
- [ ] Plan for scaling if needed

## Troubleshooting Checklist

If deployment fails:

- [ ] Check App Runner logs for error messages
- [ ] Verify all required environment variables are set
- [ ] Ensure JWT_SECRET and SETTINGS_ENCRYPTION_KEY are properly set
- [ ] Check repository permissions and branch selection
- [ ] Verify Dockerfile syntax

If application doesn't start:

- [ ] Check health check endpoint: `/api/health`
- [ ] Verify database initialization completed
- [ ] Check file permissions for startup script
- [ ] Review application logs for specific errors

If database issues occur:

- [ ] Verify DATABASE_PATH is writable
- [ ] Check database initialization logs
- [ ] Ensure SQLite dependencies are installed

## Performance Optimization

After successful deployment:

- [ ] Monitor CPU and memory usage
- [ ] Adjust instance size if needed
- [ ] Consider migrating to RDS for production workloads
- [ ] Set up CloudWatch monitoring
- [ ] Configure auto-scaling policies

## Security Review

- [ ] Verify HTTPS is enabled (default with App Runner)
- [ ] Ensure no secrets are committed to repository
- [ ] Review CORS configuration
- [ ] Set up proper backup procedures
- [ ] Plan for regular security updates

## Maintenance Schedule

- [ ] Set up automated backups
- [ ] Plan for dependency updates
- [ ] Schedule regular security reviews
- [ ] Monitor application performance
- [ ] Plan for NFL season data updates

---

**Note:** Keep this checklist handy for future deployments and updates. Each checkbox represents a critical step in the deployment process.
