const WebSocket = require('ws');
const express = require('express');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');

class StorageController {
  constructor(port = 6000) {
    this.port = port;
    this.registeredNodes = new Map();
    this.fileLocations = new Map();
    this.adminClients = new Set();
    
    // Initialize Express app
    this.app = express();
    this.app.use(express.json());
    
    this.setupExpress();
    this.setupWebSocket();
    this.startHeartbeatChecker();
  }
  
  setupExpress() {
    // REST API endpoints
    
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
    
    // Register a new node
    this.app.post('/api/register', (req, res) => {
      const { id, address, port, owner, storage } = req.body;
      const now = new Date().toISOString();
      
      // Store owner and storage info if provided (useful for linking nodes to users)
      this.registeredNodes.set(id, {
        address,
        port: port || 5001,
        online: true,
        lastSeen: now,
        owner: owner || null,
        storage: storage ? { total: storage.total || 0, used: storage.used || 0 } : { total: 0, used: 0 }
      });
      
      console.log(chalk.green(`[Controller] Node ${id} registered at ${address}:${port}`));
      
      this.broadcastToAdmins({
        type: 'node_registered',
        node: { id, address, port, online: true, lastSeen: now, owner: owner || null, storage: this.registeredNodes.get(id).storage }
      });
      
      res.json({ success: true, message: `Node ${id} registered successfully` });
    });
    
    // Heartbeat from node
    this.app.post('/api/heartbeat', (req, res) => {
      const { id } = req.body;
      const node = this.registeredNodes.get(id);
      
      if (node) {
        node.lastSeen = new Date().toISOString();
        node.online = true;
        console.log(chalk.cyan(`[Controller] Heartbeat from ${id}`));
      }
      
      res.json({ success: true, message: 'Heartbeat received' });
    });
    
    // Announce a file
    this.app.post('/api/announce', async (req, res) => {
      const { id, address, port, filename, size } = req.body;
      const now = new Date().toISOString();
      
      if (!this.registeredNodes.has(id)) {
        return res.status(400).json({ success: false, message: 'Node not registered' });
      }

      const isNewFile = !this.fileLocations.has(filename);

      if (isNewFile) {
        this.fileLocations.set(filename, {
          owners: new Set(),
          uploadTime: now,
          size: size || 0,
          replicated: false
        });
      }
      
      const fileInfo = this.fileLocations.get(filename);
      const alreadyOwner = fileInfo.owners.has(id);
      fileInfo.owners.add(id);

      // If this node wasn't already an owner, increment used storage for that node
      // (covers cases where the filename existed on other nodes)
      if (!alreadyOwner && size && this.registeredNodes.has(id)) {
        const node = this.registeredNodes.get(id);
        if (!node.storage) node.storage = { total: 0, used: 0 };
        node.storage.used = (node.storage.used || 0) + Number(size);

        // Also update the user's usedStorage in data/users.json
        if (node.owner) {
          try {
            const usersFilePath = path.join(__dirname, 'data', 'users.json');
            const usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
            if (usersData[node.owner]) {
              usersData[node.owner].usedStorage = (usersData[node.owner].usedStorage || 0) + Number(size);
              await fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 2));
              console.log(chalk.cyan(`[Controller] Updated ${node.owner} usedStorage to ${usersData[node.owner].usedStorage} bytes`));
            }
          } catch (err) {
            console.log(chalk.yellow(`[Controller] Could not update users.json: ${err.message}`));
          }
        }
      }

      console.log(chalk.yellow(`[Controller] Node ${id} announced file ${filename} (${size} bytes)`));
      
      this.broadcastToAdmins({
        type: 'file_announced',
        filename,
        node: id,
        size
      });

      res.json({
        success: true,
        message: `File ${filename} announced`,
        replicationNodes: [] // For now, empty array
      });
    });
    
    // Get file locations
    this.app.get('/api/locations/:filename', (req, res) => {
      const { filename } = req.params;
      const nodes = [];
      
      if (this.fileLocations.has(filename)) {
        const fileInfo = this.fileLocations.get(filename);
        for (const ownerId of fileInfo.owners) {
          const node = this.registeredNodes.get(ownerId);
          if (node && node.online) {
            nodes.push({ id: ownerId, address: node.address, port: node.port });
          }
        }
      }
      
      res.json({ success: true, nodes });
    });

    // De-announce a file (remove owner and decrement storage)
    this.app.post('/api/deannounce', async (req, res) => {
      const { id, filename, size } = req.body;

      if (!this.registeredNodes.has(id)) {
        return res.status(400).json({ success: false, message: 'Node not registered' });
      }

      if (!this.fileLocations.has(filename)) {
        return res.json({ success: true, message: 'File not tracked' });
      }

      const fileInfo = this.fileLocations.get(filename);
      if (fileInfo.owners.has(id)) {
        fileInfo.owners.delete(id);

        // Decrement node used storage if size provided
        if (size && this.registeredNodes.has(id)) {
          const node = this.registeredNodes.get(id);
          if (!node.storage) node.storage = { total: 0, used: 0 };
          node.storage.used = Math.max(0, (node.storage.used || 0) - Number(size));

          // Update users.json if owner exists
          if (node.owner) {
            try {
              const usersFilePath = path.join(__dirname, 'data', 'users.json');
              const usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
              if (usersData[node.owner]) {
                usersData[node.owner].usedStorage = Math.max(0, (usersData[node.owner].usedStorage || 0) - Number(size));
                await fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 2));
                console.log(chalk.cyan(`[Controller] Reduced ${node.owner} usedStorage to ${usersData[node.owner].usedStorage} bytes`));
              }
            } catch (err) {
              console.log(chalk.yellow(`[Controller] Could not update users.json on deannounce: ${err.message}`));
            }
          }
        }

        // If no more owners, remove file tracking
        if (fileInfo.owners.size === 0) {
          this.fileLocations.delete(filename);
        }
      }

      res.json({ success: true, message: `File ${filename} deannounced for ${id}` });
    });
    
    // List all nodes
    this.app.get('/api/nodes', (req, res) => {
      const nodes = Array.from(this.registeredNodes.entries()).map(([id, data]) => ({
        id,
        address: data.address,
        port: data.port,
        online: data.online,
        lastSeen: data.lastSeen,
        owner: data.owner || null,
        storage: data.storage || { total: 0, used: 0 }
      }));
      res.json({ success: true, nodes });
    });
    
    // List all files
    this.app.get('/api/files', (req, res) => {
      const files = Array.from(this.fileLocations.keys());
      res.json({ success: true, files });
    });
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        nodes: this.registeredNodes.size,
        files: this.fileLocations.size
      });
    });
    
    // Default route
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Cloud Storage Controller',
        version: '1.0.0',
        endpoints: [
          'POST /api/register - Register a node',
          'POST /api/heartbeat - Send heartbeat',
          'POST /api/announce - Announce a file',
          'GET /api/nodes - List all nodes',
          'GET /api/files - List all files',
          'GET /api/locations/:filename - Get file locations'
        ]
      });
    });
  }
  
  setupWebSocket() {
    // Try to bind WebSocket server starting at 8081, fall back if port is in use
    const startPort = 8081;
    let bound = false;
    let port = startPort;
    for (; port < startPort + 10; port++) {
      try {
        this.wss = new WebSocket.Server({ port });
        bound = true;
        break;
      } catch (err) {
        if (err && err.code === 'EADDRINUSE') {
          console.log(chalk.yellow(`[Controller] WebSocket port ${port} in use, trying ${port + 1}...`));
          continue;
        }
        console.error(chalk.red('[Controller] WebSocket setup error:', err.message));
        break;
      }
    }

    if (!bound) {
      console.error(chalk.red('[Controller] Could not start WebSocket server on ports 8081-8090. Admin real-time updates disabled.'));
      return;
    }

    this.wssPort = port;
    console.log(chalk.cyan(`Admin WebSocket running on port ${this.wssPort}`));

    this.wss.on('connection', (ws) => {
      this.adminClients.add(ws);
      console.log(chalk.magenta('[Admin] New dashboard connected'));
      
      // Send initial state
      const nodes = Array.from(this.registeredNodes.entries()).map(([id, data]) => ({
        id,
        address: data.address,
        port: data.port,
        online: data.online,
        lastSeen: data.lastSeen,
        owner: data.owner || null,
        storage: data.storage || { total: 0, used: 0 }
      }));
      
      const files = Array.from(this.fileLocations.entries()).map(([filename, info]) => ({
        filename,
        owners: Array.from(info.owners),
        size: info.size,
        uploadTime: info.uploadTime
      }));
      
      ws.send(JSON.stringify({
        type: 'initial_state',
        nodes,
        files
      }));
      
      ws.on('close', () => {
        this.adminClients.delete(ws);
        console.log(chalk.magenta('[Admin] Dashboard disconnected'));
      });
      
      ws.on('error', (error) => {
        console.error(chalk.red('[Admin] WebSocket error:', error.message));
      });
    });
    
    console.log(chalk.blue('📡 Admin WebSocket running on port 8081'));
  }
  
  broadcastToAdmins(data) {
    const message = JSON.stringify(data);
    this.adminClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
  
  startHeartbeatChecker() {
    setInterval(() => {
      const now = Date.now();
      let changed = false;
      
      for (const [id, node] of this.registeredNodes) {
        const lastSeen = new Date(node.lastSeen).getTime();
        // Personal nodes (with owner) stay online indefinitely; only actual storage nodes timeout
        const isPersonalNode = !!node.owner;
        if (node.online && !isPersonalNode && (now - lastSeen) > 30000) { // 30 seconds timeout for real nodes only
          node.online = false;
          changed = true;
          console.log(chalk.red(`[Controller] Node ${id} marked OFFLINE (no heartbeat)`));
          
          this.broadcastToAdmins({
            type: 'node_offline',
            nodeId: id
          });
        }
      }
      
      // Clean up files with no online owners
      if (changed) {
        for (const [filename, fileInfo] of this.fileLocations) {
          let hasOnlineOwner = false;
          for (const ownerId of fileInfo.owners) {
            const node = this.registeredNodes.get(ownerId);
            if (node && node.online) {
              hasOnlineOwner = true;
              break;
            }
          }
          
          if (!hasOnlineOwner) {
            console.log(chalk.yellow(`[Controller] File ${filename} has no online owners, removing from index`));
            this.fileLocations.delete(filename);
            
            this.broadcastToAdmins({
              type: 'file_removed',
              filename
            });
          }
        }
      }
    }, 10000); // Check every 10 seconds
  }
  
  start() {
    this.app.listen(this.port, () => {
      console.log(chalk.green(`📦 Storage Controller running on http://localhost:${this.port}`));
    });
  }
}

function startController(host = 'localhost', port = 6000) {
  const controller = new StorageController(port);
  controller.start();
}

module.exports = { startController };