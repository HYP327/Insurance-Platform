const { spawn } = require('child_process');
const path = require('path');
const chalk = require('chalk');
const fs = require('fs').promises;
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

// Map to track running node processes
const activeNodes = new Map();

/**
 * Start a storage node for a user
 * @param {string} email - User email
 * @param {number} port - Port for the node (default 5001)
 * @returns {Promise<Object>} - { nodeId, port, process, pid }
 */
async function startNodeForUser(email, port = 5001) {
  try {
    const safeEmail = email.replace(/[^a-z0-9]/gi, '_');
    const nodeId = `node_${safeEmail}`;
    
    // Check if node is already running
    if (activeNodes.has(nodeId)) {
      console.log(chalk.yellow(`Node ${nodeId} is already running`));
      return activeNodes.get(nodeId);
    }

    // Ensure node storage folder exists
    const userFolder = path.join(__dirname, '../node_storage', safeEmail);
    await fs.mkdir(userFolder, { recursive: true });

    // Determine storage limit for this user (default 5GB)
    let storageLimit = 5 * 1024 * 1024 * 1024;
    try {
      const raw = await fs.readFile(USERS_FILE, 'utf8');
      const users = raw ? JSON.parse(raw) : {};
      if (users[email] && users[email].storageLimit) {
        storageLimit = users[email].storageLimit;
      }
    } catch (err) {
      // ignore, use default
    }

    // Spawn node process
    const nodeProcess = spawn('node', [
      path.join(__dirname, '../main.js'),
      '--node',
      '--id', nodeId,
      '--port', port.toString(),
      '--owner', email,
      '--storageLimit', storageLimit.toString()
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      cwd: path.join(__dirname, '..')
    });

    // Handle process errors
    nodeProcess.on('error', (err) => {
      console.error(chalk.red(`Failed to start node ${nodeId}: ${err.message}`));
      activeNodes.delete(nodeId);
    });

    nodeProcess.on('exit', (code) => {
      console.log(chalk.yellow(`Node ${nodeId} exited with code ${code}`));
      activeNodes.delete(nodeId);
    });

    // Store in active nodes map
    const nodeInfo = {
      nodeId,
      email,
      port,
      process: nodeProcess,
      pid: nodeProcess.pid,
      startedAt: new Date().toISOString()
    };

    activeNodes.set(nodeId, nodeInfo);

    console.log(chalk.green(`✓ Storage node ${nodeId} started on port ${port} (PID: ${nodeProcess.pid})`));

    return nodeInfo;
  } catch (err) {
    console.error(chalk.red(`Error starting node for ${email}: ${err.message}`));
    throw err;
  }
}

/**
 * Stop a storage node
 * @param {string} nodeId - Node ID
 */
function stopNode(nodeId) {
  try {
    const nodeInfo = activeNodes.get(nodeId);
    if (!nodeInfo) {
      console.log(chalk.yellow(`Node ${nodeId} not found in active nodes`));
      return false;
    }

    if (nodeInfo.process && !nodeInfo.process.killed) {
      nodeInfo.process.kill();
      console.log(chalk.yellow(`Stopped node ${nodeId}`));
    }

    activeNodes.delete(nodeId);
    return true;
  } catch (err) {
    console.error(chalk.red(`Error stopping node ${nodeId}: ${err.message}`));
    return false;
  }
}

/**
 * Get all active nodes
 */
function getActiveNodes() {
  return Array.from(activeNodes.values());
}

/**
 * Get node info by email
 */
function getNodeByEmail(email) {
  const safeEmail = email.replace(/[^a-z0-9]/gi, '_');
  const nodeId = `node_${safeEmail}`;
  return activeNodes.get(nodeId) || null;
}

module.exports = { 
  startNodeForUser, 
  stopNode, 
  getActiveNodes, 
  getNodeByEmail 
};
