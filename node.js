const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const readline = require('readline');
const chalk = require('chalk');
const express = require('express');
const multer = require('multer');
const axios = require('axios');

// Load protobuf
const PROTO_PATH = path.join(__dirname, 'proto/storage.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const proto = grpc.loadPackageDefinition(packageDefinition).cloud;

class StorageNode {
  constructor(id, controllerHost, controllerPort, host, port, owner = null, storageLimit = null) {
    this.id = id;
    this.controllerHost = controllerHost;
    this.controllerPort = controllerPort;
    this.host = host;
    this.port = port;
    this.owner = owner;
    
    // Local storage
    this.localFiles = new Map();
    this.storagePath = `./node_storage/${id}`;
    this.chunkSize = 1024 * 1024; // 1MB chunk size
    // If storageLimit provided use it, otherwise default to 1GB for non-user nodes
    if (storageLimit && !isNaN(Number(storageLimit))) {
      this.totalStorage = Number(storageLimit);
    } else if (this.owner) {
      // default per-user storage: 5GB
      this.totalStorage = 5 * 1024 * 1024 * 1024;
    } else {
      this.totalStorage = 1024 * 1024 * 1024; // 1GB
    }
    this.usedStorage = 0;
    
    // Initialize
    this.initStorage();
  }

  async initStorage() {
    await fs.mkdir(this.storagePath, { recursive: true });
    console.log(chalk.green(`Node ${this.id} storage at ${this.storagePath}`));
  }

  async connectToController() {
    try {
      // Register node via REST API
      const response = await axios.post(`http://${this.controllerHost}:${this.controllerPort}/api/register`, {
        id: this.id,
        address: this.host,
        port: this.port,
        owner: this.owner,
        storage: { total: this.totalStorage, used: this.usedStorage }
      });
      
      console.log(chalk.green(`[Node ${this.id}] Registered with controller: ${response.data.message}`));
      
      // Start heartbeat to keep node online
      setInterval(async () => {
        try {
          await axios.post(`http://${this.controllerHost}:${this.controllerPort}/api/heartbeat`, {
            id: this.id
          }, { timeout: 2000 });
        } catch (err) {
          console.log(chalk.yellow(`[Node ${this.id}] Heartbeat failed: ${err.message}`));
        }
      }, 5000);
      
      return true;
    } catch (error) {
      console.error(chalk.red(`[Node ${this.id}] Failed to register with controller: ${error.message}`));
      // Retry registration after 5 seconds
      setTimeout(() => this.connectToController(), 5000);
      return false;
    }
  }

  startHttpServer() {
    const app = express();
    const upload = multer({ dest: path.join(this.storagePath, 'uploads') });

    app.post('/upload', upload.single('file'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const filename = req.file.originalname || req.file.filename;
        const srcPath = req.file.path;
        const destPath = path.join(this.storagePath, filename);

        // Move file to node storage path (rename)
        await fs.rename(srcPath, destPath);
        const stats = await fs.stat(destPath);
        const fileSize = stats.size;

        this.usedStorage += fileSize;
        this.localFiles.set(filename, { path: destPath, size: fileSize });

        console.log(chalk.yellow(`Node ${this.id} stored file ${filename} (${fileSize} bytes)`));

        // Calculate chunks
        const chunkCount = Math.ceil(fileSize / this.chunkSize);

        // Announce to controller via REST API
        try {
          const announceResponse = await axios.post(`http://${this.controllerHost}:${this.controllerPort}/api/announce`, {
            id: this.id,
            address: this.host,
            port: this.port,
            filename,
            size: fileSize,
            chunks: chunkCount
          }, { timeout: 2000 });
          console.log(chalk.green(`File ${filename} announced to controller (${chunkCount} chunks)`));
        } catch (err) {
          console.log(chalk.yellow(`Could not announce file to controller: ${err.message}`));
        }

        res.json({ success: true, message: 'File uploaded to node', filename, size: fileSize, chunks: chunkCount });
      } catch (err) {
        console.error(chalk.red('HTTP upload error:', err.message));
        res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
      }
    });

    // Replicate endpoint for receiving distributed files from other nodes/dashboards
    app.post('/api/replicate', upload.single('file'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, message: 'No file to replicate' });
        }

        const filename = req.body.originalFilename || req.file.originalname || req.file.filename;
        const srcPath = req.file.path;
        const destPath = path.join(this.storagePath, filename);

        // Move file to node storage
        await fs.rename(srcPath, destPath);
        const stats = await fs.stat(destPath);
        const fileSize = stats.size;

        this.usedStorage += fileSize;
        this.localFiles.set(filename, { path: destPath, size: fileSize });

        console.log(chalk.cyan(`Node ${this.id} received replicated file ${filename} (${fileSize} bytes)`));

        // Announce replicated file to controller
        try {
          await axios.post(`http://${this.controllerHost}:${this.controllerPort}/api/announce`, {
            id: this.id,
            address: this.host,
            port: this.port,
            filename,
            size: fileSize
          }, { timeout: 2000 });
          console.log(chalk.green(`Replicated file ${filename} announced to controller`));
        } catch (err) {
          console.log(chalk.yellow(`Could not announce replicated file to controller: ${err.message}`));
        }

        res.json({ success: true, message: 'File replicated', filename, size: fileSize });
      } catch (err) {
        console.error(chalk.red('Replication error:', err.message));
        res.status(500).json({ success: false, message: 'Replication failed', error: err.message });
      }
    });

    app.listen(this.port, this.host, () => {
      console.log(chalk.green(`HTTP upload server running for node ${this.id} at http://${this.host}:${this.port}`));
    });
  }

  async uploadFile(filename, filePath) {
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    
    // Check local storage
    if (this.usedStorage + fileSize > this.totalStorage) {
      throw new Error('Insufficient storage space');
    }

    // Copy to local storage
    const destPath = path.join(this.storagePath, filename);
    await fs.copyFile(filePath, destPath);
    this.usedStorage += fileSize;
    this.localFiles.set(filename, { path: destPath, size: fileSize });

    console.log(chalk.yellow(`File ${filename} stored locally (${fileSize} bytes)`));

    // Announce to controller via REST API
    try {
      const announceResponse = await axios.post(`http://${this.controllerHost}:${this.controllerPort}/api/announce`, {
        id: this.id,
        address: this.host,
        port: this.port,
        filename,
        size: fileSize
      }, { timeout: 2000 });
      console.log(chalk.green(`File ${filename} announced to controller`));
    } catch (err) {
      console.log(chalk.yellow(`Could not announce file to controller: ${err.message}`));
    }
  }

  async downloadFile(filename, targetNode) {
    return new Promise((resolve, reject) => {
      const peerClient = new proto.NodeFileService(
        `${targetNode.address}:${targetNode.port}`,
        grpc.credentials.createInsecure()
      );

      peerClient.DownloadFile({ filename }, async (error, response) => {
        if (error) {
          reject(new Error(`Download failed: ${error.message}`));
          return;
        }

        // Save locally
        const destPath = path.join(this.storagePath, filename);
        await fs.writeFile(destPath, Buffer.from(response.content));
        
        this.usedStorage += response.size || 0;
        this.localFiles.set(filename, { path: destPath, size: response.size || 0 });
        
        resolve(destPath);
      });
    });
  }

  startCLI() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const prompt = () => {
      rl.question(chalk.blue(`[Node ${this.id}] $ `), async (input) => {
        const [command, ...args] = input.trim().split(' ');
        
        switch (command) {
          case 'upload':
            if (args.length < 2) {
              console.log('Usage: upload <local_path> <filename>');
            } else {
              await this.uploadFile(args[1], args[0]);
            }
            break;
            
          case 'download':
            if (args.length < 1) {
              console.log('Usage: download <filename>');
            } else {
              // Get file locations from controller
              const controller = await this.connectToController();
              controller.GetFileLocations({ filename: args[0] }, async (error, response) => {
                if (error || response.nodes.length === 0) {
                  console.log(chalk.red('File not found or no nodes available'));
                  return;
                }
                
                // Download from first available node
                await this.downloadFile(args[0], response.nodes[0]);
                console.log(chalk.green(`Downloaded ${args[0]}`));
              });
            }
            break;
            
          case 'ls':
            console.log('Local files:', Array.from(this.localFiles.keys()).join(', '));
            break;
            
          case 'storage':
            console.log(`Used: ${this.formatBytes(this.usedStorage)} / ${this.formatBytes(this.totalStorage)}`);
            console.log(`Free: ${this.formatBytes(this.totalStorage - this.usedStorage)}`);
            break;
            
          case 'exit':
            console.log(chalk.yellow('Shutting down...'));
            rl.close();
            process.exit(0);
            return;
            
          default:
            console.log(`
Available commands:
  upload <local_path> <filename>  - Upload a file
  download <filename>             - Download a file
  ls                              - List local files
  storage                         - Show storage usage
  exit                            - Exit node
            `);
        }
        
        prompt();
      });
    };

    prompt();
  }

  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

function startNode(id, controllerHost, controllerPort, host, port, owner = null, storageLimit = null) {
  const node = new StorageNode(id, controllerHost, controllerPort, host, port, owner, storageLimit);
  node.connectToController().then(() => {
    console.log(chalk.green(`Node ${id} ready!`));
    console.log(chalk.cyan(`Connected to controller at ${controllerHost}:${controllerPort}`));
    try {
      node.startHttpServer();
    } catch (err) {
      console.error(chalk.yellow(`Failed to start HTTP upload server: ${err.message}`));
    }
    node.startCLI();
  }).catch(error => {
    console.error(chalk.red(`Failed to start node: ${error.message}`));
  });
}

module.exports = { startNode };