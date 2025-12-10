const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

console.log(chalk.cyan('🚀 Setting up Cloud Storage System...\n'));

// Check if package.json exists
if (!fs.existsSync('package.json')) {
  console.log(chalk.yellow('Creating package.json...'));
  const packageJson = {
    name: "cloud-storage",
    version: "1.0.0",
    description: "Distributed Cloud Storage System",
    main: "main.js",
    scripts: {
      "start": "node main.js",
      "controller": "node main.js --controller",
      "node": "node main.js --node --id vm1",
      "login": "node login.js",
      "register": "node register.js",
      "user-dashboard": "node dashboard/user_dashboard.js",
      "admin-dashboard": "node dashboard/admin_dashboard.js",
      "setup": "node setup.js"
    },
    dependencies: {}
  };
  
  fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
}

// Install dependencies
console.log(chalk.yellow('📦 Installing dependencies...'));
try {
  const dependencies = [
    'express',
    'multer',
    'chalk',
    'bcryptjs',
    'dotenv',
    'uuid',
    'commander',
    'inquirer',
    'nodemailer',
    'ws'
  ];

  dependencies.forEach(dep => {
    console.log(chalk.blue(`Installing ${dep}...`));
    execSync(`npm install ${dep}`, { stdio: 'inherit' });
  });

  console.log(chalk.green('✅ Dependencies installed successfully!\n'));
} catch (error) {
  console.log(chalk.red('❌ Error installing dependencies:'), error.message);
  console.log(chalk.yellow('Trying alternative method...'));
  
  try {
    execSync('npm install express multer chalk bcryptjs dotenv uuid commander inquirer nodemailer ws', { stdio: 'inherit' });
    console.log(chalk.green('✅ Dependencies installed successfully!\n'));
  } catch (err) {
    console.log(chalk.red('Failed to install dependencies. Please install manually:'));
    console.log(chalk.white('npm install express multer chalk bcryptjs dotenv uuid commander inquirer nodemailer ws\n'));
  }
}

// Create necessary directories
console.log(chalk.yellow('📁 Creating directory structure...'));
const directories = [
  'proto',
  'data',
  'node_storage',
  'uploads',
  'logs',
  'utils',
  'dashboard',
  'public'
];

directories.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(chalk.green(`  Created: ${dir}/`));
  }
});

// Create .env file
console.log(chalk.yellow('\n⚙️  Creating configuration files...'));
const envContent = `# Cloud Storage Configuration
NODE_ENV=development
CONTROLLER_PORT=6000
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
`;

if (!fs.existsSync('.env')) {
  fs.writeFileSync('.env', envContent);
  console.log(chalk.green('  Created: .env'));
  console.log(chalk.yellow('  ⚠️  Please update .env with your email credentials'));
} else {
  console.log(chalk.blue('  .env already exists'));
}

// Create storage.proto file
const protoContent = `syntax = "proto3";

package cloud;

message NodeInfo {
  string id = 1;
  string address = 2;
  int32 port = 3;
}

message Response {
  string message = 1;
}

message FileAnnouncement {
  string id = 1;
  string address = 2;
  int32 port = 3;
  string filename = 4;
  int64 size = 5;
}

message FileName {
  string filename = 1;
}

message NodeLocation {
  string id = 1;
  string address = 2;
  int32 port = 3;
}

message NodeLocationList {
  repeated NodeLocation nodes = 1;
}

message FileList {
  repeated string filenames = 1;
}

service StorageController {
  rpc RegisterNode(NodeInfo) returns (Response);
  rpc Heartbeat(NodeInfo) returns (Response);
  rpc AnnounceFile(FileAnnouncement) returns (Response);
  rpc GetFileLocations(FileName) returns (NodeLocationList);
  rpc ListFiles(NodeInfo) returns (FileList);
}`;

const protoPath = path.join(__dirname, 'proto/storage.proto');
if (!fs.existsSync(protoPath)) {
  fs.writeFileSync(protoPath, protoContent);
  console.log(chalk.green('  Created: proto/storage.proto'));
}

// Create data files
const dataFiles = {
  'data/users.json': '{}',
  'data/sessions.json': '{}',
  'data/otps.json': '{}',
  'data/email_config.json': JSON.stringify({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER || 'your-email@gmail.com',
      pass: process.env.EMAIL_PASS || 'your-app-password'
    },
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER
  }, null, 2)
};

Object.entries(dataFiles).forEach(([filePath, content]) => {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, content);
    console.log(chalk.green(`  Created: ${filePath}`));
  }
});

// Update user_dashboard.js to not require multer immediately
const userDashboardPath = path.join(__dirname, 'dashboard/user_dashboard.js');
if (fs.existsSync(userDashboardPath)) {
  let content = fs.readFileSync(userDashboardPath, 'utf8');
  
  // Check if multer is imported at the top
  if (content.includes("const multer = require('multer')")) {
    // Replace with conditional require
    content = content.replace(
      "const multer = require('multer')",
      "let multer;\ntry {\n  multer = require('multer');\n} catch (e) {\n  console.log('Multer not installed. File uploads will be disabled.');\n  multer = null;\n}"
    );
    
    // Also update the upload variable
    content = content.replace(
      "const upload = multer({ dest: 'uploads/' });",
      "const upload = multer ? multer({ dest: 'uploads/' }) : null;"
    );
    
    fs.writeFileSync(userDashboardPath, content);
    console.log(chalk.yellow('  Updated user_dashboard.js for optional multer'));
  }
}

console.log(chalk.cyan('\n🎉 Setup completed!'));
console.log(chalk.yellow('\nNext steps:'));
console.log('1. Update .env file with your email credentials');
console.log('2. Start the system:');
console.log('   - Controller: npm run controller');
console.log('   - Node: npm run node');
console.log('   - User Dashboard: npm run user-dashboard');
console.log('   - Admin Dashboard: npm run admin-dashboard');
console.log('\nOr run the setup again: npm run setup');