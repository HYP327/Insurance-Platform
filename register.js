const readline = require('readline');
const chalk = require('chalk');
const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const path = require('path');
const { sendOTP, verifyOTP } = require('./utils/email');
const { hashPassword } = require('./utils/auth');
const { startNodeForUser } = require('./utils/nodeManager');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const USERS_FILE = path.join(__dirname, 'data/users.json');

async function loadUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function saveUser(email, userData) {
  const users = await loadUsers();
  users[email] = userData;
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

async function register() {
  console.log(chalk.cyan('\n📝 Cloud Storage Registration\n'));
  
  // Get user details
  rl.question('Full Name: ', async (name) => {
    rl.question('Email: ', async (email) => {
      // Validate email
      if (!email.includes('@') || !email.includes('.')) {
        console.log(chalk.red('Invalid email address!'));
        rl.close();
        return;
      }
      
      // Check if user already exists
      const users = await loadUsers();
      if (users[email]) {
        console.log(chalk.red('User already registered!'));
        rl.close();
        return;
      }
      
      rl.question('Password: ', { hideEcho: true }, async (password) => {
        if (password.length < 6) {
          console.log(chalk.red('Password must be at least 6 characters!'));
          rl.close();
          return;
        }
        
        console.log(chalk.yellow('\nSending OTP to your email...'));
        
        // Send OTP
        const otp = await sendOTP(email);
        if (!otp) {
          console.log(chalk.red('Failed to send OTP'));
          rl.close();
          return;
        }
        
        console.log(chalk.green('✓ OTP sent to your email'));
        console.log(chalk.yellow(`(Debug: OTP is ${otp})`)); // Remove in production
        
        rl.question('Enter OTP: ', async (enteredOTP) => {
          // Verify OTP
          if (!verifyOTP(email, enteredOTP)) {
            console.log(chalk.red('Invalid OTP!'));
            rl.close();
            return;
          }
          
          // Hash password and save user
          const hashedPassword = await hashPassword(password);
          await saveUser(email, {
            name,
            email,
            password: hashedPassword,
            createdAt: new Date().toISOString(),
            storageLimit: 1073741824, // 1GB default
            usedStorage: 0,
            files: []
          });

          // Create user folder in node_storage
          const safeEmail = email.replace(/[^a-z0-9]/gi, '_');
          const userFolder = path.join(__dirname, 'node_storage', safeEmail);
          try {
            await fs.mkdir(userFolder, { recursive: true });
            console.log(chalk.green(`User storage folder created: node_storage/${safeEmail}`));
          } catch (err) {
            console.log(chalk.red(`Failed to create user folder: ${err.message}`));
          }

          // Automatically start a storage node for this new user
          try {
            await startNodeForUser(email, 5001);
            console.log(chalk.green(`Storage node auto-started for user ${email}`));
          } catch (err) {
            console.log(chalk.yellow(`Could not auto-start node: ${err.message}`));
          }

          console.log(chalk.green('\n✓ Registration successful!'));
          console.log(chalk.cyan(`\nWelcome ${name}!`));
          console.log('\nNext steps:');
          console.log('1. Login: node login.js');
          console.log('2. Start user dashboard');

          rl.close();
        });
      });
    });
  });
}

register();