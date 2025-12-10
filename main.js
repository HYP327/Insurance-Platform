#!/usr/bin/env node
const { program } = require('commander');
const chalk = require('chalk');

program
  .option('-c, --controller', 'Start storage controller')
  .option('-n, --node', 'Start storage node')
  .option('--id <id>', 'Node ID')
  .option('--port <port>', 'Node port', '5001')
  .option('--owner <owner>', 'Node owner (user email)')
  .option('--storageLimit <bytes>', 'Storage limit in bytes for node')
  .option('-u, --user', 'Start user dashboard')
  .option('-a, --admin', 'Start admin dashboard')
  .option('--auth', 'Start authentication server')
  .option('--all', 'Start all services (controller, auth, admin, user)')
  .parse(process.argv);

const options = program.opts();

console.log(chalk.cyan(`
╔══════════════════════════════════════════╗
║    ☁️  Cloud Storage System              ║
╚══════════════════════════════════════════╝
`));

if (options.all) {
  console.log(chalk.green('🚀 Starting all services...'));
  
  console.log(chalk.yellow('→ Storage Controller on port 6000'));
  require('./controller').startController();
  
  setTimeout(() => {
    console.log(chalk.yellow('→ Authentication Server on port 4000'));
    require('./auth/auth').startAuthServer();
  }, 2000);
  
  setTimeout(() => {
    console.log(chalk.yellow('→ User Dashboard on port 3000'));
    require('./dashboard/user_dashboard').startUserDashboard();
  }, 4000);
  
  setTimeout(() => {
    console.log(chalk.yellow('→ Admin Dashboard on port 4001'));
    require('./dashboard/admin_dashboard').startAdminDashboard();
  }, 6000);
  
} else if (options.controller) {
  console.log(chalk.yellow('Starting Storage Controller...'));
  require('./controller').startController();
  
} else if (options.node) {
  if (!options.id) {
    console.error(chalk.red('Node ID required! Use --id <node_id>'));
    process.exit(1);
  }
  console.log(chalk.green(`Starting Storage Node ${options.id}...`));
  const { startNode } = require('./node');
  // controllerHost should be hostname (e.g. 'localhost'), not a full URL
  const controllerHost = 'localhost';
  const controllerPort = 6000;
  const storageLimit = options.storageLimit ? Number(options.storageLimit) : undefined;
  startNode(options.id, controllerHost, controllerPort, 'localhost', options.port, options.owner, storageLimit);
  
} else if (options.user) {
  console.log(chalk.blue('Starting User Dashboard...'));
  require('./dashboard/user_dashboard').startUserDashboard();
  
} else if (options.admin) {
  console.log(chalk.magenta('Starting Admin Dashboard...'));
  require('./dashboard/admin_dashboard').startAdminDashboard();
  
} else if (options.auth) {
  console.log(chalk.yellow('Starting Authentication Server...'));
  require('./auth/auth').startAuthServer();
  
} else {
  console.log(chalk.cyan(`
Usage:
  ${chalk.yellow('Controller:')} node main.js --controller
  ${chalk.yellow('Node:')} node main.js --node --id <node_id> --port <port>
  ${chalk.yellow('User Dashboard:')} node main.js --user
  ${chalk.yellow('Admin Dashboard:')} node main.js --admin
  ${chalk.yellow('Auth Server:')} node main.js --auth
  ${chalk.yellow('All Services:')} node main.js --all
  
Examples:
  node main.js --controller
  node main.js --node --id node1 --port 5001
  node main.js --node --id node2 --port 5002
  node main.js --user
  node main.js --admin
  node main.js --auth
  node main.js --all
  
Access Points:
  ${chalk.blue('User Dashboard:')} http://localhost:3000
  ${chalk.blue('Admin Dashboard:')} http://localhost:4001
  ${chalk.blue('Auth Server:')} http://localhost:4000/login
  ${chalk.blue('Controller API:')} http://localhost:6000
  
Features:
  • File upload with chunking (1MB chunks)
  • Cross-node file visibility
  • File download with chunk reassembly
  • Storage node monitoring
  • Real-time admin dashboard
  `));
}