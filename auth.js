const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

const USERS_FILE = path.join(__dirname, '../data/users.json');
const SESSIONS_FILE = path.join(__dirname, '../data/sessions.json');

// Initialize data files
async function initAuth() {
  try {
    await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
    await fs.mkdir(path.dirname(SESSIONS_FILE), { recursive: true });
    
    // Create empty files if they don't exist
    try {
      await fs.access(USERS_FILE);
    } catch {
      await fs.writeFile(USERS_FILE, JSON.stringify({}));
    }
    
    try {
      await fs.access(SESSIONS_FILE);
    } catch {
      await fs.writeFile(SESSIONS_FILE, JSON.stringify({}));
    }
    
    console.log(chalk.green('Authentication system initialized'));
  } catch (error) {
    console.error(chalk.red(`Auth init error: ${error.message}`));
  }
}

// Hash password
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Verify password
async function verifyPassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

// Authenticate user
async function authenticateUser(email, password) {
  try {
    const usersData = await fs.readFile(USERS_FILE, 'utf8');
    const users = JSON.parse(usersData);
    
    const user = users[email];
    if (!user) {
      console.log(chalk.yellow(`User not found: ${email}`));
      return false;
    }
    
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      console.log(chalk.yellow(`Invalid password for: ${email}`));
      return false;
    }
    
    console.log(chalk.green(`Authentication successful for: ${email}`));
    return user;
  } catch (error) {
    console.error(chalk.red(`Authentication error: ${error.message}`));
    return false;
  }
}

// Create session
async function createSession(userId, userData) {
  try {
    const sessionsData = await fs.readFile(SESSIONS_FILE, 'utf8');
    const sessions = JSON.parse(sessionsData);
    
    const sessionId = crypto.randomBytes(32).toString('hex');
    const session = {
      userId,
      userData,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      ip: '127.0.0.1' // In real app, get from request
    };
    
    sessions[sessionId] = session;
    await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
    
    console.log(chalk.green(`Session created: ${sessionId}`));
    return sessionId;
  } catch (error) {
    console.error(chalk.red(`Session creation error: ${error.message}`));
    return null;
  }
}

// Validate session
async function validateSession(sessionId) {
  try {
    const sessionsData = await fs.readFile(SESSIONS_FILE, 'utf8');
    const sessions = JSON.parse(sessionsData);
    
    const session = sessions[sessionId];
    if (!session) {
      return false;
    }
    
    // Check if session expired
    if (new Date(session.expiresAt) < new Date()) {
      delete sessions[sessionId];
      await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
      return false;
    }
    
    // Update expiry
    session.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
    
    return session.userData;
  } catch (error) {
    console.error(chalk.red(`Session validation error: ${error.message}`));
    return false;
  }
}

// Delete session (logout)
async function deleteSession(sessionId) {
  try {
    const sessionsData = await fs.readFile(SESSIONS_FILE, 'utf8');
    const sessions = JSON.parse(sessionsData);
    
    if (sessions[sessionId]) {
      delete sessions[sessionId];
      await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
      console.log(chalk.green(`Session deleted: ${sessionId}`));
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(chalk.red(`Session deletion error: ${error.message}`));
    return false;
  }
}

// Get user by email
async function getUser(email) {
  try {
    const usersData = await fs.readFile(USERS_FILE, 'utf8');
    const users = JSON.parse(usersData);
    return users[email] || null;
  } catch (error) {
    console.error(chalk.red(`Get user error: ${error.message}`));
    return null;
  }
}

// Update user storage usage
async function updateUserStorage(email, fileSize, operation = 'add') {
  try {
    const usersData = await fs.readFile(USERS_FILE, 'utf8');
    const users = JSON.parse(usersData);
    
    const user = users[email];
    if (!user) {
      throw new Error('User not found');
    }
    
    if (operation === 'add') {
      user.usedStorage = (user.usedStorage || 0) + fileSize;
    } else if (operation === 'subtract') {
      user.usedStorage = Math.max(0, (user.usedStorage || 0) - fileSize);
    }
    
    // Check storage limit
    if (user.usedStorage > user.storageLimit) {
      throw new Error('Storage limit exceeded');
    }
    
    users[email] = user;
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    
    console.log(chalk.cyan(`User ${email} storage updated: ${user.usedStorage}/${user.storageLimit}`));
    return user;
  } catch (error) {
    console.error(chalk.red(`Update storage error: ${error.message}`));
    throw error;
  }
}

// Initialize on module load
initAuth();

module.exports = {
  hashPassword,
  verifyPassword,
  authenticateUser,
  createSession,
  validateSession,
  deleteSession,
  getUser,
  updateUserStorage
};