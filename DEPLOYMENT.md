# AWS App Runner Deployment Guide

This guide will help you deploy the NFL Pick'em application to AWS App Runner.

## Prerequisites

- AWS Account with appropriate permissions
- AWS CLI configured (optional, but recommended)
- Git repository (GitHub, GitLab, or Bitbucket)

## Deployment Steps

### 1. Prepare Your Repository

Ensure your repository contains all the deployment files created:

- `Dockerfile` - Container configuration
- `apprunner.yaml` - App Runner configuration
- `scripts/start.sh` - Production startup script
- `scripts/init-db.js` - Database initialization
- `.dockerignore` - Docker build optimization
- `.env.production.template` - Environment variables template

### 2. Generate Security Keys

Before deployment, generate secure keys for your application:

```bash
# Generate JWT Secret (32+ characters)
openssl rand -base64 32

# Generate Settings Encryption Key (24 characters for 32-byte key)
openssl rand -base64 24
```

Save these keys - you'll need them for environment variables.

### 3. Deploy to AWS App Runner

#### Option A: Using AWS Console

1. **Open AWS App Runner Console**

   - Go to [AWS App Runner Console](https://console.aws.amazon.com/apprunner/)
   - Click "Create service"

2. **Configure Source**

   - Choose "Source code repository"
   - Connect your GitHub/GitLab/Bitbucket account
   - Select your repository
   - Choose branch (usually `main` or `master`)
   - Select "Use a configuration file" and specify `apprunner.yaml`

3. **Configure Service Settings**

   - Service name: `football-pickem` (or your preferred name)
   - Virtual CPU: 1 vCPU (can be adjusted based on load)
   - Memory: 2 GB (recommended minimum)

4. **Set Environment Variables**
   Add these environment variables in the App Runner console:

   **Required Variables:**

   ```
   NODE_ENV=production
   PORT=8080
   FRONTEND_PORT=8080
   BACKEND_PORT=3001
   DATABASE_PATH=/app/data/database.sqlite
   JWT_SECRET=<your-generated-jwt-secret>
   SETTINGS_ENCRYPTION_KEY=<your-generated-encryption-key>
   ```

   **Application URLs (update after deployment):**

   ```
   CLIENT_URL=https://your-app-name.region.awsapprunner.com
   FRONTEND_URL=https://your-app-name.region.awsapprunner.com
   ```

   **Optional Admin Configuration:**

   ```
   ADMIN_EMAIL=admin@nflpickem.com
   ADMIN_PASSWORD=your-secure-admin-password
   ```

   **Optional SMTP Configuration:**

   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   FROM_EMAIL=your-email@gmail.com
   ```

5. **Deploy**
   - Review settings and click "Create & deploy"
   - Wait for deployment to complete (usually 5-10 minutes)

#### Option B: Using AWS CLI

1. **Create apprunner.yaml with your values**

   ```bash
   cp apprunner.yaml apprunner-production.yaml
   # Edit apprunner-production.yaml with your specific values
   ```

2. **Create service using CLI**
   ```bash
   aws apprunner create-service \
     --service-name football-pickem \
     --source-configuration '{
       "ImageRepository": {
         "ImageIdentifier": "your-account.dkr.ecr.region.amazonaws.com/football-pickem:latest",
         "ImageConfiguration": {
           "Port": "8080"
         },
         "ImageRepositoryType": "ECR"
       },
       "AutoDeploymentsEnabled": true
     }' \
     --instance-configuration '{
       "Cpu": "1 vCPU",
       "Memory": "2 GB"
     }'
   ```

### 4. Post-Deployment Configuration

1. **Update Environment Variables**

   - Once deployed, get your App Runner URL
   - Update `CLIENT_URL` and `FRONTEND_URL` with the actual URL

2. **Access Admin Panel**

   - Navigate to `https://your-app-url.com`
   - Login with admin credentials
   - Go to Admin → Settings to configure SMTP (if not set via environment variables)

3. **Set Up NFL Data**
   - In Admin Dashboard, use "Sync Full Schedule" to import games from ESPN
   - Create your first Pick'em game

### 5. Database Persistence

**Important:** App Runner containers are ephemeral. For production use, consider:

1. **AWS RDS** (Recommended for production)

   - Migrate from SQLite to PostgreSQL or MySQL
   - Update database configuration in your application

2. **EFS Mount** (Alternative)
   - Mount an EFS volume to `/app/data` for SQLite persistence
   - Configure in App Runner service settings

### 6. Custom Domain (Optional)

1. **Add Custom Domain**

   - In App Runner console, go to "Custom domains"
   - Add your domain name
   - Update DNS records as instructed

2. **Update Environment Variables**
   - Update `CLIENT_URL` and `FRONTEND_URL` to use your custom domain

## Monitoring and Maintenance

### Logs

- View logs in AWS App Runner console
- Use CloudWatch for detailed monitoring

### Updates

- Push changes to your repository
- App Runner will automatically redeploy (if auto-deploy is enabled)

### Scaling

- App Runner automatically scales based on traffic
- Adjust CPU/Memory in service configuration if needed

### Backup

- Database backups are handled automatically if using RDS
- For SQLite, implement custom backup solution

## Troubleshooting

### Common Issues

1. **Application won't start**

   - Check environment variables are set correctly
   - Verify JWT_SECRET and SETTINGS_ENCRYPTION_KEY are set
   - Check logs for specific error messages

2. **Database errors**

   - Ensure DATABASE_PATH is writable
   - Check if database initialization completed successfully

3. **SMTP/Email issues**

   - Verify SMTP credentials in environment variables or admin settings
   - Check firewall rules for SMTP ports

4. **Performance issues**
   - Increase CPU/Memory allocation
   - Consider migrating to RDS for better database performance

### Health Checks

The application includes a health check endpoint at `/api/health` that App Runner uses to monitor service health.

## Security Considerations

1. **Environment Variables**

   - Never commit secrets to your repository
   - Use App Runner's environment variable encryption

2. **Database Security**

   - For production, use RDS with proper security groups
   - Enable encryption at rest

3. **Network Security**

   - App Runner provides HTTPS by default
   - Configure proper CORS settings

4. **Regular Updates**
   - Keep dependencies updated
   - Monitor for security vulnerabilities

## Cost Optimization

1. **Right-sizing**

   - Start with 1 vCPU / 2 GB RAM
   - Monitor usage and adjust as needed

2. **Auto-scaling**

   - App Runner scales to zero when not in use
   - Only pay for actual usage

3. **Database**
   - Consider RDS with appropriate instance size
   - Use read replicas if needed for high traffic

## Support

For issues specific to this application:

1. Check the application logs in App Runner console
2. Verify all environment variables are set correctly
3. Ensure the database is properly initialized

For AWS App Runner issues:

- Consult [AWS App Runner Documentation](https://docs.aws.amazon.com/apprunner/)
- Contact AWS Support if needed
