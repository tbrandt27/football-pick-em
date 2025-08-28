import nodemailer from "nodemailer";
import db from "../models/database.js";
import crypto from "crypto";

// Encryption key for sensitive settings (should match admin.js)
const ENCRYPTION_KEY =
  process.env.SETTINGS_ENCRYPTION_KEY ||
  "football-pickem-default-key-32-chars!";

function decrypt(encryptedText) {
  try {
    // Handle both old and new encryption formats
    if (encryptedText.includes(':')) {
      // New format with IV: iv:encryptedData
      const [ivHex, encrypted] = encryptedText.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } else {
      // Legacy format - return as-is for now to avoid breaking existing data
      console.warn('Legacy encryption format detected. Consider re-encrypting this data.');
      return encryptedText;
    }
  } catch (error) {
    console.error('Failed to decrypt value:', error.message);
    // Return the original text if decryption fails (might be unencrypted)
    return encryptedText;
  }
}

class EmailService {
  constructor() {
    this.transporter = null;
    this.smtpSettings = null;
    this.initializeTransporter();
  }

  async loadSmtpSettings() {
    try {
      const dbProvider = db.provider; // Use singleton database provider
      const dbType = db.getType();
      
      let settings = [];
      
      if (dbType === 'dynamodb') {
        // For DynamoDB, scan system_settings table
        const result = await dbProvider._dynamoScan('system_settings', { category: 'smtp' });
        settings = result.Items || [];
      } else {
        // For SQLite, check if system_settings table exists first
        try {
          const tableExists = await dbProvider.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='system_settings'
          `);
          
          if (tableExists) {
            settings = await dbProvider.all(`
              SELECT key, value, encrypted
              FROM system_settings
              WHERE category = 'smtp'
              ORDER BY key
            `);
          } else {
            console.log("system_settings table does not exist, using environment variables for SMTP");
            return null;
          }
        } catch (tableError) {
          console.log("Could not check for system_settings table:", tableError.message);
          return null;
        }
      }

      const smtpConfig = {};
      settings.forEach((setting) => {
        smtpConfig[setting.key] = setting.encrypted
          ? decrypt(setting.value)
          : setting.value;
      });

      this.smtpSettings = smtpConfig;
      return smtpConfig;
    } catch (error) {
      console.error("Failed to load SMTP settings:", error);
      return null;
    }
  }

  async initializeTransporter() {
    // First try to load settings from database
    const dbSettings = await this.loadSmtpSettings();

    // For development, use a test account or local SMTP
    // For production, you would use your actual email service
    if (
      process.env.NODE_ENV === "production" ||
      (dbSettings && dbSettings.host)
    ) {
      // Use database settings if available, otherwise fall back to environment variables
      const smtpConfig =
        dbSettings && dbSettings.host
          ? {
              host: dbSettings.host,
              port: parseInt(dbSettings.port) || 587,
              secure: false,
              auth: {
                user: dbSettings.user,
                pass: dbSettings.pass,
              },
            }
          : {
              host: process.env.SMTP_HOST,
              port: process.env.SMTP_PORT || 587,
              secure: false,
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              },
            };

      this.transporter = nodemailer.createTransport(smtpConfig);
    } else {
      // Development: Log emails to console
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: "unix",
        buffer: true,
      });
    }
  }

  // Method to refresh transporter when settings are updated
  async refreshTransporter() {
    await this.initializeTransporter();
  }

  async sendGameInvitation(toEmail, inviterName, gameName, inviteToken) {
    const inviteUrl = `${
      process.env.CLIENT_URL || "http://localhost:4321"
    }/register?token=${inviteToken}`;

    const fromEmail =
      this.smtpSettings && this.smtpSettings.from
        ? this.smtpSettings.from
        : process.env.FROM_EMAIL || "noreply@footballpickem.app";

    const mailOptions = {
      from: fromEmail,
      to: toEmail,
      subject: `You're invited to join "${gameName}" NFL Pick'em Game!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">🏈 NFL Pick'em Game Invitation</h2>
          
          <p>Hi there!</p>
          
          <p><strong>${inviterName}</strong> has invited you to join the NFL Pick'em game: <strong>"${gameName}"</strong></p>
          
          <p>To accept this invitation and start making your picks:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" 
               style="background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
              Accept Invitation & Register
            </a>
          </div>
          
          <p>This invitation link will expire in 7 days.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          
          <p style="color: #6b7280; font-size: 14px;">
            If you're not interested in joining this game, you can safely ignore this email.
          </p>
        </div>
      `,
      text: `
        NFL Pick'em Game Invitation
        
        Hi there!
        
        ${inviterName} has invited you to join the NFL Pick'em game: "${gameName}"
        
        To accept this invitation and start making your picks, visit:
        ${inviteUrl}
        
        This invitation link will expire in 7 days.
        
        If you're not interested in joining this game, you can safely ignore this email.
      `,
    };

    try {
      if (process.env.NODE_ENV === "production") {
        const result = await this.transporter.sendMail(mailOptions);
        console.log("Invitation email sent:", result.messageId);
        return { success: true, messageId: result.messageId };
      } else {
        // Development: Log email to console
        console.log("\n=== EMAIL INVITATION (Development Mode) ===");
        console.log("To:", toEmail);
        console.log("Subject:", mailOptions.subject);
        console.log("Invite URL:", inviteUrl);
        console.log("==========================================\n");
        return { success: true, messageId: "dev-mode" };
      }
    } catch (error) {
      console.error("Failed to send invitation email:", error);
      return { success: false, error: error.message };
    }
  }

  async sendAdminInvitation(toEmail, inviterName, inviteToken) {
    const inviteUrl = `${
      process.env.CLIENT_URL || "http://localhost:4321"
    }/register?token=${inviteToken}`;

    const fromEmail =
      this.smtpSettings && this.smtpSettings.from
        ? this.smtpSettings.from
        : process.env.FROM_EMAIL || "noreply@footballpickem.app";

    const mailOptions = {
      from: fromEmail,
      to: toEmail,
      subject: `You're invited to be an Admin for NFL Pick'em!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">🏈 NFL Pick'em Admin Invitation</h2>
          
          <p>Hi there!</p>
          
          <p><strong>${inviterName}</strong> has invited you to become an administrator for NFL Pick'em.</p>
          
          <p>As an admin, you'll have access to:</p>
          <ul>
            <li>Manage all users and games</li>
            <li>Create and configure pick'em games</li>
            <li>Invite other users and admins</li>
            <li>View comprehensive statistics and reports</li>
          </ul>
          
          <p>To accept this invitation and create your admin account:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}"
               style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
              Accept Admin Invitation & Register
            </a>
          </div>
          
          <p>This invitation link will expire in 7 days.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          
          <p style="color: #6b7280; font-size: 14px;">
            If you're not interested in this admin role, you can safely ignore this email.
          </p>
        </div>
      `,
      text: `
        NFL Pick'em Admin Invitation
        
        Hi there!
        
        ${inviterName} has invited you to become an administrator for NFL Pick'em.
        
        As an admin, you'll have access to manage users, games, and system settings.
        
        To accept this invitation and create your admin account, visit:
        ${inviteUrl}
        
        This invitation link will expire in 7 days.
        
        If you're not interested in this admin role, you can safely ignore this email.
      `,
    };

    try {
      if (process.env.NODE_ENV === "production") {
        const result = await this.transporter.sendMail(mailOptions);
        console.log("Admin invitation email sent:", result.messageId);
        return { success: true, messageId: result.messageId };
      } else {
        // Development: Log email to console
        console.log("\n=== ADMIN INVITATION EMAIL (Development Mode) ===");
        console.log("To:", toEmail);
        console.log("Subject:", mailOptions.subject);
        console.log("Invite URL:", inviteUrl);
        console.log("===============================================\n");
        return { success: true, messageId: "dev-mode" };
      }
    } catch (error) {
      console.error("Failed to send admin invitation email:", error);
      return { success: false, error: error.message };
    }
  }

  async sendPasswordReset(toEmail, userName, resetToken) {
    const resetUrl = `${
      process.env.CLIENT_URL || "http://localhost:4321"
    }/reset-password?token=${resetToken}`;

    const fromEmail =
      this.smtpSettings && this.smtpSettings.from
        ? this.smtpSettings.from
        : process.env.FROM_EMAIL || "noreply@footballpickem.app";

    const mailOptions = {
      from: fromEmail,
      to: toEmail,
      subject: `Password Reset Request - NFL Pick'em`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">🔒 Password Reset Request</h2>
          
          <p>Hi ${userName},</p>
          
          <p>An administrator has initiated a password reset for your NFL Pick'em account.</p>
          
          <p>To set a new password for your account, click the button below:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}"
               style="background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
              Reset Your Password
            </a>
          </div>
          
          <p>Or copy and paste this link into your browser:</p>
          <p style="background-color: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all;">
            ${resetUrl}
          </p>
          
          <p><strong>This link will expire in 1 hour.</strong></p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          
          <p style="color: #6b7280; font-size: 14px;">
            If you didn't request this password reset, you can safely ignore this email. Your password will not be changed.
          </p>
          
          <p style="color: #6b7280; font-size: 14px;">
            For security reasons, this password reset was initiated by an administrator.
          </p>
        </div>
      `,
      text: `
        Password Reset Request - NFL Pick'em
        
        Hi ${userName},
        
        An administrator has initiated a password reset for your NFL Pick'em account.
        
        To set a new password for your account, visit:
        ${resetUrl}
        
        This link will expire in 1 hour.
        
        If you didn't request this password reset, you can safely ignore this email. Your password will not be changed.
        
        For security reasons, this password reset was initiated by an administrator.
      `,
    };

    try {
      if (process.env.NODE_ENV === "production") {
        const result = await this.transporter.sendMail(mailOptions);
        console.log("Password reset email sent:", result.messageId);
        return { success: true, messageId: result.messageId };
      } else {
        // Development: Log email to console
        console.log("\n=== PASSWORD RESET EMAIL (Development Mode) ===");
        console.log("To:", toEmail);
        console.log("Subject:", mailOptions.subject);
        console.log("Reset URL:", resetUrl);
        console.log("===============================================\n");
        return { success: true, messageId: "dev-mode" };
      }
    } catch (error) {
      console.error("Failed to send password reset email:", error);
      return { success: false, error: error.message };
    }
  }
}

export default new EmailService();
