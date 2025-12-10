const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const chalk = require('chalk');
const { startNodeForUser } = require('../utils/nodeManager');
const { generateOTP, storeOTP, verifyOTP } = require('../utils/email');

const app = express();
const PORT = 4000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Simple CORS + credentials support for dashboard origins
app.use((req, res, next) => {
  const allowed = [
    'http://localhost:3000', // user dashboard
    'http://localhost:4001', // admin dashboard
    'http://localhost:4000'
  ];
  const origin = req.headers.origin;
  if (allowed.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Session management
app.use(session({
  secret: 'cloud-storage-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: false // Set to true in production with HTTPS
  }
}));

// Paths
const USERS_FILE = path.join(__dirname, '../data/users.json');
const ADMIN_EMAIL = 'admin@gmail.com'; // Default admin

// Initialize data
async function initAuth() {
  try {
    await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
    
    // Check if users file exists; create if missing and ensure default admin exists
    let users = {};
    try {
      await fs.access(USERS_FILE);
      const raw = await fs.readFile(USERS_FILE, 'utf8');
      users = raw ? JSON.parse(raw) : {};
    } catch {
      // File missing -> start with empty users
      users = {};
    }

    // If admin user missing, create it
    if (!users[ADMIN_EMAIL]) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      users[ADMIN_EMAIL] = {
        email: ADMIN_EMAIL,
        password: hashedPassword,
        name: 'System Administrator',
        role: 'admin',
        createdAt: new Date().toISOString(),
        storageLimit: 10 * 1024 * 1024 * 1024, // 10GB
        usedStorage: 0
        ,
        verified: true
      };
      await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
      console.log(chalk.green('✅ Created default admin user'));
    }
    
    console.log(chalk.green('✅ Authentication system initialized'));
  } catch (error) {
    console.error(chalk.red('❌ Auth init error:', error.message));
  }
}

// Login page
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Register page
app.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'register.html'));
});

// Login API
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    // Read users
    const usersData = await fs.readFile(USERS_FILE, 'utf8');
    const users = JSON.parse(usersData);
    const user = users[email];

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Create session
    req.session.user = {
      email: user.email,
      name: user.name,
      role: user.role,
      storageLimit: user.storageLimit,
      usedStorage: user.usedStorage
    };

    console.log(chalk.green(`✅ User logged in: ${email} (${user.role})`));

    // Try to register a personal node for this user in the storage controller
    (async () => {
      try {
        const nodeId = `node_${email.replace(/[^a-z0-9]/gi, '_')}`;
        await axios.post('http://localhost:6000/api/register', {
          id: nodeId,
          address: 'localhost',
          port: 5001,
          owner: email
        }, { timeout: 2000 });
        console.log(chalk.cyan(`[Auth] Registered personal node ${nodeId} for user ${email}`));
      } catch (err) {
        // If controller isn't running or registration fails, ignore (non-fatal)
        console.log(chalk.yellow(`[Auth] Could not register node for ${email}: ${err.message}`));
      }
    })();

    res.json({ 
      success: true, 
      message: 'Login successful',
      user: req.session.user,
      redirect: user.role === 'admin' ? '/admin' : '/dashboard'
    });

  } catch (error) {
    console.error(chalk.red('❌ Login error:', error.message));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Register API
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;
    
    // Validation
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    
    if (!email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }
    
    // Check if user already exists
    const usersData = await fs.readFile(USERS_FILE, 'utf8');
    const users = JSON.parse(usersData);
    
    if (users[email]) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user (mark as not yet verified)
    users[email] = {
      email,
      name,
      password: hashedPassword,
      role: 'user', // Default role
      createdAt: new Date().toISOString(),
      storageLimit: 5 * 1024 * 1024 * 1024, // 5GB default for users
      usedStorage: 0,
      verified: false
    };

    // Save to file
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));

    console.log(chalk.green(`✅ New user registered: ${email}`));

    // Generate OTP and store it (for terminal-based verification)
    const otp = generateOTP();
    storeOTP(email, otp);
    console.log(chalk.cyan(`[Auth] Registration OTP for ${email}: ${otp} (showing in terminal for local verification)`));

    // Do not auto-start node until verification
    res.json({ 
      success: true, 
      otpSent: true,
      message: 'Registration successful. An OTP has been generated (check server terminal) to verify your account.'
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Registration error:', error.message));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Verify registration OTP and activate account
app.post('/api/verify-registration', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP required' });

    const ok = verifyOTP(email, otp);
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid or expired OTP' });

    // Mark user as verified
    const users = JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
    if (!users[email]) return res.status(400).json({ success: false, message: 'User not found' });

    users[email].verified = true;
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));

    // Start node for user
    (async () => {
      try {
        await startNodeForUser(email, 5001);
        console.log(chalk.green(`[Auth] Storage node auto-started for verified user ${email}`));
      } catch (err) {
        console.log(chalk.yellow(`[Auth] Could not auto-start node for ${email}: ${err.message}`));
      }
    })();

    res.json({ success: true, message: 'Account verified. You can now login.' });
  } catch (error) {
    console.error(chalk.red('❌ Verify-registration error:', error.message));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Check authentication middleware
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied. Admin privileges required.');
  }
  next();
}

// Dashboard route (redirects based on role)
app.get('/dashboard', requireAuth, (req, res) => {
  if (req.session.user.role === 'admin') {
    res.redirect('/admin');
  } else {
    // Serve user dashboard HTML or redirect to user dashboard server
    res.redirect('http://localhost:3000');
  }
});

// Admin dashboard route
app.get('/admin', requireAdmin, (req, res) => {
  // Serve admin dashboard HTML or redirect to admin dashboard server
  res.redirect('http://localhost:4001');
});

// Get current user
app.get('/api/user', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  
  // Get fresh user data from users.json to include updated usedStorage
  try {
    const users = JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
    const freshUser = users[req.session.user.email];
    if (freshUser) {
      // Return fresh data with updated usedStorage
      res.json({ success: true, user: freshUser });
    } else {
      res.json({ success: true, user: req.session.user });
    }
  } catch (err) {
    res.json({ success: true, user: req.session.user });
  }
});

// Start server
async function startAuthServer() {
  await initAuth();
  
  app.listen(PORT, () => {
    console.log(chalk.green(`🔐 Authentication server running on http://localhost:${PORT}`));
    console.log(chalk.cyan(`   Login: http://localhost:${PORT}/login`));
    console.log(chalk.cyan(`   Register: http://localhost:${PORT}/register`));
    console.log(chalk.yellow(`   Default admin: ${ADMIN_EMAIL} / admin123`));
  });
}

module.exports = { startAuthServer, requireAuth, requireAdmin };

// If this file is started directly, launch the auth server
if (require.main === module) {
  startAuthServer().catch(err => {
    console.error('Failed to start auth server:', err);
    process.exit(1);
  });
}

// Dev-only route: view OTPs (for local testing)
app.get('/debug/otps', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ success: false, message: 'Forbidden' });
  try {
    const otpsPath = path.join(__dirname, '..', 'data', 'otps.json');
    const data = await fs.readFile(otpsPath, 'utf8');
    const otps = data ? JSON.parse(data) : {};
    res.json({ success: true, otps });
  } catch (err) {
    res.json({ success: true, otps: {} });
  }
});