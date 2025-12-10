const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

const OTP_FILE = path.join(__dirname, '../data/otps.json');
const EMAIL_CONFIG_FILE = path.join(__dirname, '../data/email_config.json');

// In-memory OTP store (for demo, use Redis in production)
const otpStore = new Map();
const otpExpiry = 10 * 60 * 1000; // 10 minutes

// Initialize email configuration
async function initEmail() {
  try {
    await fs.mkdir(path.dirname(OTP_FILE), { recursive: true });
    await fs.mkdir(path.dirname(EMAIL_CONFIG_FILE), { recursive: true });
    
    // Create default config if doesn't exist
    try {
      await fs.access(EMAIL_CONFIG_FILE);
    } catch {
      const defaultConfig = {
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER || 'your-email@gmail.com',
          pass: process.env.EMAIL_PASS || 'your-app-password'
        },
        from: process.env.EMAIL_FROM || 'your-email@gmail.com'
      };
      
      await fs.writeFile(EMAIL_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
      console.log(chalk.yellow('Created default email config. Please update with your credentials.'));
    }
    
    console.log(chalk.green('Email system initialized'));
  } catch (error) {
    console.error(chalk.red(`Email init error: ${error.message}`));
  }
}

// Load email configuration
async function loadEmailConfig() {
  try {
    const configData = await fs.readFile(EMAIL_CONFIG_FILE, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error(chalk.red(`Error loading email config: ${error.message}`));
    
    // Return environment variables as fallback
    return {
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER
    };
  }
}

// Create email transporter
async function createTransporter() {
  const config = await loadEmailConfig();
  
  if (!config.auth.user || !config.auth.pass) {
    console.error(chalk.red('Email credentials not configured!'));
    console.log(chalk.yellow('Please set EMAIL_USER and EMAIL_PASS environment variables or update email_config.json'));
    return null;
  }
  
  return nodemailer.createTransport({
    service: config.service,
    auth: config.auth
  });
}

// Generate OTP
function generateOTP(length = 6) {
  const digits = '0123456789';
  let otp = '';
  
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  
  return otp;
}

// Store OTP
function storeOTP(email, otp) {
  const expiryTime = Date.now() + otpExpiry;
  otpStore.set(email, { otp, expiryTime });
  
  // Also save to file for persistence
  saveOTPToFile(email, otp, expiryTime);
  
  console.log(chalk.cyan(`OTP stored for ${email}: ${otp} (expires: ${new Date(expiryTime).toLocaleTimeString()})`));
  return otp;
}

// Save OTP to file
async function saveOTPToFile(email, otp, expiryTime) {
  try {
    let otps = {};
    try {
      const data = await fs.readFile(OTP_FILE, 'utf8');
      otps = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet
    }
    
    otps[email] = { otp, expiryTime, createdAt: new Date().toISOString() };
    await fs.writeFile(OTP_FILE, JSON.stringify(otps, null, 2));
  } catch (error) {
    console.error(chalk.red(`Error saving OTP to file: ${error.message}`));
  }
}

// Verify OTP
function verifyOTP(email, otp) {
  const stored = otpStore.get(email);
  
  if (!stored) {
    console.log(chalk.yellow(`No OTP found for ${email}`));
    return false;
  }
  
  if (Date.now() > stored.expiryTime) {
    otpStore.delete(email);
    console.log(chalk.yellow(`OTP expired for ${email}`));
    return false;
  }
  
  const isValid = stored.otp === otp;
  
  if (isValid) {
    otpStore.delete(email);
    console.log(chalk.green(`OTP verified for ${email}`));
  } else {
    console.log(chalk.yellow(`Invalid OTP for ${email}`));
  }
  
  return isValid;
}

// Send OTP email
async function sendOTP(email) {
  try {
    const transporter = await createTransporter();
    if (!transporter) {
      return null;
    }
    
    const otp = generateOTP();
    storeOTP(email, otp);
    
    const config = await loadEmailConfig();
    
    const mailOptions = {
      from: config.from,
      to: email,
      subject: 'Your OTP Code - Cloud Storage System',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #4361ee;">Cloud Storage System</h2>
          <p>Your One-Time Password (OTP) for authentication:</p>
          <div style="background: #f8f9fa; padding: 15px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #4361ee; margin: 20px 0; border-radius: 5px;">
            ${otp}
          </div>
          <p>This OTP is valid for 10 minutes. Do not share it with anyone.</p>
          <p>If you didn't request this OTP, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            This is an automated message from Cloud Storage System.
          </p>
        </div>
      `
    };
    
    console.log(chalk.cyan(`Sending OTP email to ${email}...`));
    
    const info = await transporter.sendMail(mailOptions);
    console.log(chalk.green(`OTP email sent: ${info.messageId}`));
    
    return otp;
  } catch (error) {
    console.error(chalk.red(`Error sending OTP email: ${error.message}`));
    return null;
  }
}

// Send general notification
async function sendNotification(email, subject, message) {
  try {
    const transporter = await createTransporter();
    if (!transporter) {
      return false;
    }
    
    const config = await loadEmailConfig();
    
    const mailOptions = {
      from: config.from,
      to: email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #4361ee;">Cloud Storage System</h2>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            ${message}
          </div>
          <p style="color: #666; font-size: 12px;">
            This is an automated message from Cloud Storage System.
          </p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    console.log(chalk.green(`Notification sent to ${email}: ${subject}`));
    return true;
  } catch (error) {
    console.error(chalk.red(`Error sending notification: ${error.message}`));
    return false;
  }
}

// Clean up expired OTPs
async function cleanupExpiredOTPs() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [email, data] of otpStore.entries()) {
    if (now > data.expiryTime) {
      otpStore.delete(email);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(chalk.yellow(`Cleaned up ${cleaned} expired OTPs`));
  }
  
  // Also clean up file
  try {
    const data = await fs.readFile(OTP_FILE, 'utf8');
    const otps = JSON.parse(data);
    const updatedOtps = {};
    
    for (const [email, otpData] of Object.entries(otps)) {
      if (now < otpData.expiryTime) {
        updatedOtps[email] = otpData;
      }
    }
    
    await fs.writeFile(OTP_FILE, JSON.stringify(updatedOtps, null, 2));
  } catch (error) {
    // File might not exist
  }
}

// Periodic cleanup
setInterval(cleanupExpiredOTPs, 60 * 60 * 1000); // Every hour

// Initialize on module load
initEmail();

module.exports = {
  sendOTP,
  verifyOTP,
  sendNotification,
  generateOTP,
  storeOTP,
  cleanupExpiredOTPs
};