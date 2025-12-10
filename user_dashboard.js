const express = require('express');
const multer = require('multer');
const axios = require('axios');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;

const app = express();

// Shared files tracking
const SHARED_FILES_PATH = path.join(__dirname, '..', 'data', 'shared_files.json');

// Load shared files metadata
async function loadSharedFilesMetadata() {
  try {
    const data = await fs.readFile(SHARED_FILES_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { sharedFiles: {} };
  }
}

// Save shared files metadata
async function saveSharedFilesMetadata(data) {
  try {
    await fs.writeFile(SHARED_FILES_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving shared files:', err.message);
  }
}
const PORT = 3000;

// Storage for temp uploads
const upload = multer({ dest: path.join(__dirname, 'temp') });

// Controller URL
const CONTROLLER_URL = 'http://localhost:6000';
const USER_NODE_PORT = 5001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Verify user is logged in (simplified)
async function verifyAuth(req, res, next) {
  try {
    // Try to get user from auth server
    const response = await axios.get('http://localhost:4000/api/user', { 
      headers: {
        'Cookie': req.headers.cookie || ''
      },
      timeout: 2000
    });
    
    if (response.data.success && response.data.user) {
      req.user = response.data.user;
      next();
    } else {
      // If no user data, create a test user (for development)
      console.log(chalk.yellow(`[User Dashboard] No authenticated user, using test user`));
      req.user = { email: 'test@example.com', name: 'Test User' };
      next();
    }
  } catch (error) {
    // If auth server is down, allow test user (for development)
    console.log(chalk.yellow(`[User Dashboard] Auth server unreachable, using test user: ${error.message}`));
    req.user = { email: 'test@example.com', name: 'Test User' };
    next();
  }
}

// Get user's own files
app.get('/api/files', verifyAuth, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const safeEmail = userEmail.replace(/[^a-z0-9]/gi, '_');
    const nodeId = `node_${safeEmail}`;

    // Get node info from controller
    try {
      const nodesRes = await axios.get(`${CONTROLLER_URL}/api/nodes`);
      const nodes = nodesRes.data.nodes || [];
      const userNode = nodes.find(n => n.id === nodeId);

      if (!userNode) {
        return res.json({ success: true, files: [], message: 'No node found for user' });
      }

      // List files on user's node storage folder
      const userStoragePath = path.join(__dirname, '..', 'node_storage', safeEmail);
      try {
        const files = await fs.readdir(userStoragePath);
        const fileDetails = await Promise.all(
          files.map(async (file) => {
            try {
              const filePath = path.join(userStoragePath, file);
              const stat = await fs.stat(filePath);
              return {
                name: file,
                size: stat.size,
                created: stat.birthtime.toISOString(),
                isFile: stat.isFile(),
                owner: userEmail,
                ownerId: safeEmail
              };
            } catch (err) {
              return null;
            }
          })
        );

        const validFiles = fileDetails.filter(f => f && f.isFile);
        res.json({ success: true, files: validFiles });
      } catch (err) {
        res.json({ success: true, files: [] });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all shared (public) files from all users
app.get('/api/files/shared/all', async (req, res) => {
  try {
    const sharedData = await loadSharedFilesMetadata();
    const nodeStoragePath = path.join(__dirname, '..', 'node_storage');
    const publicFiles = [];

    try {
      const userDirs = await fs.readdir(nodeStoragePath);

      for (const userDir of userDirs) {
        const userPath = path.join(nodeStoragePath, userDir);
        try {
          const stat = await fs.stat(userPath);
          if (!stat.isDirectory()) continue;

          const files = await fs.readdir(userPath);
          for (const file of files) {
            try {
              const fileKey = `${userDir}/${file}`;
              const isPublic = sharedData.sharedFiles[fileKey]?.shared === true;

              if (!isPublic) continue; // Skip private files

              const filePath = path.join(userPath, file);
              const fileStat = await fs.stat(filePath);
              if (fileStat.isFile()) {
                publicFiles.push({
                  name: file,
                  size: fileStat.size,
                  created: fileStat.birthtime.toISOString(),
                  owner: userDir,
                  ownerId: userDir,
                  shared: true
                });
              }
            } catch (err) {
              // skip file
            }
          }
        } catch (err) {
          // skip directory
        }
      }

      res.json({ success: true, files: publicFiles });
    } catch (err) {
      res.json({ success: true, files: [] });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload file
app.post('/api/upload', verifyAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const userEmail = req.user.email;
    const safeEmail = userEmail.replace(/[^a-z0-9]/gi, '_');
    const fileName = req.file.originalname || req.file.filename;
    const tempPath = req.file.path;

    // Move file to user's node storage
    const userStoragePath = path.join(__dirname, '..', 'node_storage', safeEmail);
    await fs.mkdir(userStoragePath, { recursive: true });
    const destPath = path.join(userStoragePath, fileName);

    // Check if file exists, rename if necessary
    let finalPath = destPath;
    let counter = 1;
    while (true) {
      try {
        await fs.access(finalPath);
        // File exists, rename it
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        finalPath = path.join(userStoragePath, `${base}(${counter})${ext}`);
        counter++;
      } catch {
        // File doesn't exist, we can use this path
        break;
      }
    }

    await fs.rename(tempPath, finalPath);
    const stat = await fs.stat(finalPath);

    console.log(chalk.green(`[User Dashboard] File uploaded: ${fileName} by ${userEmail} (${stat.size} bytes)`));

    // Announce file to controller
    try {
      const nodeId = `node_${safeEmail}`;
      await axios.post(`${CONTROLLER_URL}/api/announce`, {
        id: nodeId,
        address: 'localhost',
        port: USER_NODE_PORT,
        filename: path.basename(finalPath),
        size: stat.size
      }, { timeout: 2000 });
    } catch (err) {
      console.log(chalk.yellow(`[User Dashboard] Could not announce file to controller: ${err.message}`));
    }

    // Distribute file to other nodes for replication (async, non-blocking)
    (async () => {
      try {
        const nodesRes = await axios.get(`${CONTROLLER_URL}/api/nodes`, { timeout: 3000 });
        const allNodes = nodesRes.data.nodes || [];
        const currentNodeId = `node_${safeEmail}`;
        const otherNodes = allNodes.filter(n => n.id !== currentNodeId && n.online);

        if (otherNodes.length > 0) {
          console.log(chalk.cyan(`[User Dashboard] Replicating ${fileName} to ${otherNodes.length} other node(s)...`));

          // Read the file content
          const fileBuffer = await fs.readFile(finalPath);

          // Send file to each other node
          for (const node of otherNodes) {
            try {
              const FormData = require('form-data');
              const form = new FormData();
              form.append('file', fileBuffer, path.basename(finalPath));
              form.append('originalFilename', path.basename(finalPath));

              await axios.post(
                `http://${node.address}:${node.port}/api/replicate`,
                form,
                {
                  headers: form.getHeaders(),
                  timeout: 5000
                }
              );
              console.log(chalk.cyan(`[User Dashboard] File replicated to node ${node.id}`));
            } catch (err) {
              console.log(chalk.yellow(`[User Dashboard] Could not replicate to ${node.id}: ${err.message}`));
            }
          }

          console.log(chalk.green(`[User Dashboard] Replication of ${fileName} completed`));
        }
      } catch (err) {
        console.log(chalk.yellow(`[User Dashboard] Error during replication: ${err.message}`));
      }
    })();

    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        name: path.basename(finalPath),
        size: stat.size,
        created: stat.birthtime.toISOString()
      }
    });
  } catch (error) {
    console.error(chalk.red('[User Dashboard] Upload error:', error.message));
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download file from any user (shared access)
app.get('/api/download/:ownerId/:filename', async (req, res) => {
  try {
    const { ownerId, filename } = req.params;

    // Prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    }
    if (ownerId.includes('..') || ownerId.includes('/') || ownerId.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Invalid owner ID' });
    }

    const userStoragePath = path.join(__dirname, '..', 'node_storage', ownerId);
    const filePath = path.join(userStoragePath, filename);

    // Verify the file belongs to the claimed owner
    try {
      const realPath = await fs.realpath(filePath);
      const realStoragePath = await fs.realpath(userStoragePath);
      if (!realPath.startsWith(realStoragePath)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } catch {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    res.download(filePath, filename);
  } catch (error) {
    console.error(chalk.red('[User Dashboard] Shared download error:', error.message));
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download file (original user-only version, kept for backward compatibility)
app.get('/api/download/:filename', verifyAuth, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const safeEmail = userEmail.replace(/[^a-z0-9]/gi, '_');
    const filename = req.params.filename;

    // Prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    }

    const userStoragePath = path.join(__dirname, '..', 'node_storage', safeEmail);
    const filePath = path.join(userStoragePath, filename);

    // Verify the file belongs to the user
    const realPath = await fs.realpath(filePath);
    const realStoragePath = await fs.realpath(userStoragePath);
    if (!realPath.startsWith(realStoragePath)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    res.download(filePath, filename);
  } catch (error) {
    console.error(chalk.red('[User Dashboard] Download error:', error.message));
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete file
app.delete('/api/files/:filename', verifyAuth, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const safeEmail = userEmail.replace(/[^a-z0-9]/gi, '_');
    const filename = req.params.filename;

    // Prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    }

    const userStoragePath = path.join(__dirname, '..', 'node_storage', safeEmail);
    const filePath = path.join(userStoragePath, filename);

    // Verify the file belongs to the user
    const realPath = await fs.realpath(filePath);
    const realStoragePath = await fs.realpath(userStoragePath);
    if (!realPath.startsWith(realStoragePath)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Delete file (get size, unlink, then notify controller)
    try {
      const stat = await fs.stat(filePath);
      const fileSize = stat.size;

      await fs.unlink(filePath);
      console.log(chalk.green(`[User Dashboard] File deleted: ${filename} by ${userEmail}`));

      // Get all nodes that have this file
      try {
        const nodesRes = await axios.get(`${CONTROLLER_URL}/api/nodes`, { timeout: 3000 });
        const allNodes = nodesRes.data.nodes || [];

        // Deannounce from all nodes (primary and replicas)
        for (const node of allNodes) {
          try {
            await axios.post(`${CONTROLLER_URL}/api/deannounce`, {
              id: node.id,
              filename: filename,
              size: fileSize
            }, { timeout: 2000 });
            console.log(chalk.cyan(`[User Dashboard] Deannounced ${filename} from ${node.id}`));
          } catch (err) {
            console.log(chalk.yellow(`[User Dashboard] Could not deannounce from ${node.id}: ${err.message}`));
          }
        }
      } catch (err) {
        console.log(chalk.yellow(`[User Dashboard] Could not get nodes list for deannounce: ${err.message}`));
      }

      res.json({ success: true, message: 'File deleted' });
    } catch (err) {
      res.status(404).json({ success: false, message: 'File not found' });
    }
  } catch (error) {
    console.error(chalk.red('[User Dashboard] Delete error:', error.message));
    res.status(500).json({ success: false, error: error.message });
  }
});

// Toggle file public/private status
app.post('/api/files/toggle-share', verifyAuth, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const safeEmail = userEmail.replace(/[^a-z0-9]/gi, '_');
    const { filename } = req.body;

    console.log(chalk.cyan(`[User Dashboard] Toggle share request for ${filename} by ${userEmail}`));

    // Prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      console.log(chalk.red(`[User Dashboard] Invalid filename: ${filename}`));
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    }

    // Verify file belongs to user
    const userStoragePath = path.join(__dirname, '..', 'node_storage', safeEmail);
    const filePath = path.join(userStoragePath, filename);
    
    try {
      const realPath = await fs.realpath(filePath);
      const realStoragePath = await fs.realpath(userStoragePath);
      if (!realPath.startsWith(realStoragePath)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } catch (err) {
      console.error(chalk.yellow(`[User Dashboard] File check failed: ${err.message}`));
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Load shared files metadata
    const sharedData = await loadSharedFilesMetadata();
    const fileKey = `${safeEmail}/${filename}`;

    // Toggle share status
    if (!sharedData.sharedFiles[fileKey]) {
      sharedData.sharedFiles[fileKey] = { shared: false };
    }
    sharedData.sharedFiles[fileKey].shared = !sharedData.sharedFiles[fileKey].shared;
    await saveSharedFilesMetadata(sharedData);

    const isNowShared = sharedData.sharedFiles[fileKey].shared;
    console.log(chalk.blue(`[User Dashboard] File ${filename} ${isNowShared ? 'marked as public' : 'marked as private'} by ${userEmail}`));

    res.json({
      success: true,
      shared: isNowShared,
      message: `File ${isNowShared ? 'is now public' : 'is now private'}`
    });
  } catch (error) {
    console.error(chalk.red('[User Dashboard] Toggle share error:', error.message));
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve user dashboard HTML
app.get('/', (req, res) => {
  res.send(getUserDashboardHTML());
});

// Serve static files (after API routes)
app.use(express.static(path.join(__dirname, 'public')));

function getUserDashboardHTML() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>User Dashboard - Cloud Storage</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #7209b7;
            --secondary: #4361ee;
            --success: #06d6a0;
            --warning: #ffd166;
            --danger: #ef476f;
            --dark: #0f172a;
            --light: #f8fafc;
            --gray: #64748b;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: var(--light);
            min-height: 100vh;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        h1 {
            font-size: 1.8rem;
            background: linear-gradient(to right, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .user-info {
            text-align: right;
            font-size: 0.9rem;
            color: var(--gray);
        }

        .user-info strong {
            color: var(--light);
        }

        .main-content {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }

        .section {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 20px;
            backdrop-filter: blur(10px);
        }

        .section h2 {
            margin-bottom: 15px;
            color: var(--secondary);
            font-size: 1.2rem;
        }

        .upload-area {
            border: 2px dashed rgba(255, 255, 255, 0.3);
            border-radius: 8px;
            padding: 40px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
            background: rgba(114, 9, 183, 0.1);
        }

        .upload-area:hover {
            border-color: var(--primary);
            background: rgba(114, 9, 183, 0.2);
        }

        .upload-area.dragover {
            border-color: var(--primary);
            background: rgba(114, 9, 183, 0.3);
        }

        .upload-area i {
            font-size: 2.5rem;
            color: var(--primary);
            margin-bottom: 10px;
            display: block;
        }

        .upload-area p {
            color: var(--gray);
            font-size: 0.9rem;
        }

        input[type="file"] {
            display: none;
        }

        .files-list {
            display: block;
            max-height: 600px;
            overflow-y: auto;
            border-radius: 5px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .files-table {
            width: 100%;
            border-collapse: collapse;
        }

        .files-table thead {
            background: rgba(0, 0, 0, 0.3);
            position: sticky;
            top: 0;
            z-index: 10;
        }

        .files-table th {
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: var(--secondary);
            border-bottom: 2px solid rgba(255, 255, 255, 0.1);
            font-size: 0.9rem;
        }

        .files-table td {
            padding: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            color: var(--light);
        }

        .files-table tbody tr:hover {
            background: rgba(114, 9, 183, 0.15);
        }

        .file-name-cell {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
        }

        .file-name-cell i {
            color: var(--primary);
        }

        .file-size {
            color: var(--gray);
            font-size: 0.9rem;
        }

        .file-date {
            color: var(--gray);
            font-size: 0.85rem;
        }

        .file-actions-cell {
            display: flex;
            gap: 6px;
        }

        .file-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 5px;
            border-left: 3px solid var(--primary);
        }

        .file-info {
            flex: 1;
        }

        .file-name {
            font-weight: 600;
            margin-bottom: 3px;
        }

        .file-meta {
            font-size: 0.8rem;
            color: var(--gray);
        }

        .file-actions {
            display: flex;
            gap: 8px;
        }

        button {
            padding: 6px 12px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
            font-size: 0.9rem;
        }

        .btn-primary {
            background: var(--primary);
            color: white;
        }

        .btn-primary:hover {
            background: #5a0a9a;
        }

        .btn-success {
            background: var(--success);
            color: #000;
        }

        .btn-success:hover {
            background: #05b896;
        }

        .btn-danger {
            background: var(--danger);
            color: white;
        }

        .btn-danger:hover {
            background: #d63a5a;
        }

        .btn-small {
            padding: 4px 8px;
            font-size: 0.8rem;
        }

        .message {
            padding: 12px;
            border-radius: 5px;
            margin-bottom: 15px;
            display: none;
        }

        .message.success {
            background: rgba(6, 214, 160, 0.2);
            color: var(--success);
            border: 1px solid rgba(6, 214, 160, 0.5);
        }

        .message.error {
            background: rgba(239, 71, 111, 0.2);
            color: var(--danger);
            border: 1px solid rgba(239, 71, 111, 0.5);
        }

        .loading {
            text-align: center;
            padding: 20px;
            color: var(--gray);
        }

        .no-files {
            text-align: center;
            padding: 40px 20px;
            color: var(--gray);
        }

        .progress-bar {
            width: 100%;
            height: 4px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            margin-top: 8px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background: var(--primary);
            transition: width 0.3s ease;
            border-radius: 2px;
        }

        @media (max-width: 768px) {
            .main-content {
                grid-template-columns: 1fr;
            }

            h1 {
                font-size: 1.4rem;
            }

            .upload-area {
                padding: 20px;
            }

            .upload-area i {
                font-size: 1.8rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1><i class="fas fa-cloud"></i> Cloud Storage</h1>
            <div class="user-info" id="user-info">
                <strong>Loading...</strong>
            </div>
        </header>

        <!-- Storage Status Section -->
        <div class="section" style="grid-column: 1 / -1; margin-bottom: 20px;">
            <h2><i class="fas fa-database"></i> Storage Status</h2>
            <div id="storage-status-content" style="display: flex; justify-content: space-between; align-items: center; gap: 20px;">
                <div style="flex: 1;">
                    <div style="margin-bottom: 10px;">
                        <span id="storage-used" style="font-weight: 600; color: var(--secondary);">0 B</span>
                        <span style="color: var(--gray);"> / </span>
                        <span id="storage-total" style="font-weight: 600; color: var(--light);">5 GB</span>
                    </div>
                    <div class="progress-bar" style="height: 8px; margin: 0;">
                        <div class="progress-fill" id="storage-progress-fill" style="width: 0%; background: var(--success); transition: width 0.3s ease;"></div>
                    </div>
                    <div style="margin-top: 8px; font-size: 0.85rem; color: var(--gray);">
                        <span id="storage-remaining" style="color: var(--success);">5 GB</span> available
                    </div>
                </div>
                <div style="text-align: center; padding: 0 20px; border-left: 1px solid rgba(255, 255, 255, 0.1);">
                    <div style="font-size: 2rem; font-weight: 700; color: var(--secondary);" id="storage-percent">0%</div>
                    <div style="font-size: 0.8rem; color: var(--gray);">Used</div>
                </div>
            </div>
        </div>

        <div class="main-content">
            <!-- Upload Section -->
            <div class="section">
                <h2><i class="fas fa-upload"></i> Upload File</h2>
                <div id="message-upload" class="message"></div>
                <div class="upload-area" id="upload-area" ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p>Drag and drop your file here<br><small>or click to browse</small></p>
                </div>
                <input type="file" id="file-input" onchange="handleFileSelect(event)">
                <div id="upload-progress" style="display: none; margin-top: 15px;">
                    <div style="font-size: 0.9rem; margin-bottom: 8px;">Uploading... <span id="progress-percent">0</span>%</div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill" style="width: 0;"></div>
                    </div>
                </div>
            </div>

            <!-- Files List Section -->
            <div class="section">
                <h2><i class="fas fa-folder"></i> My Files</h2>
                <div id="message-files" class="message"></div>
                <div id="loading-files" class="loading" style="display: none;">
                    <i class="fas fa-spinner fa-spin"></i> Loading files...
                </div>
                <div id="no-files" class="no-files" style="display: none;">
                    <i class="fas fa-inbox"></i> No files yet
                </div>
                <div id="files-list" class="files-list" style="display: none;">
                    <table class="files-table">
                        <thead>
                            <tr>
                                <th style="width: 40%;">File Name</th>
                                <th style="width: 20%;">Size</th>
                                <th style="width: 25%;">Date Modified</th>
                                <th style="width: 15%;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="files-tbody"></tbody>
                    </table>
                </div>
            </div>

            <!-- Shared Files Section -->
            <div class="section">
                <h2><i class="fas fa-share-alt"></i> Browse All Files</h2>
                <p style="color: var(--gray); margin-bottom: 15px;">View and download files uploaded by all users</p>
                <div id="message-shared" class="message"></div>
                <div id="loading-shared" class="loading" style="display: none;">
                    <i class="fas fa-spinner fa-spin"></i> Loading shared files...
                </div>
                <div id="no-shared" class="no-shared" style="display: none;">
                    <i class="fas fa-inbox"></i> No shared files available
                </div>
                <div id="shared-files-list" class="files-list" style="display: none;">
                    <table class="files-table">
                        <thead>
                            <tr>
                                <th style="width: 35%;">File Name</th>
                                <th style="width: 15%;">Size</th>
                                <th style="width: 25%;">Owner</th>
                                <th style="width: 15%;">Date</th>
                                <th style="width: 10%;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="shared-files-tbody"></tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Load user info
        async function loadUserInfo() {
            try {
                const response = await fetch('http://localhost:4000/api/user', {
                    credentials: 'include'
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.user) {
                        document.getElementById('user-info').innerHTML = \`
                            <strong>\${data.user.name}</strong><br>
                            <small>\${data.user.email}</small><br>
                            <small>Storage: \${formatBytes(data.user.usedStorage)} / \${formatBytes(data.user.storageLimit)}</small>
                        \`;
                        
                        // Update storage status card
                        updateStorageStatus(data.user.usedStorage, data.user.storageLimit);
                    }
                }
            } catch (error) {
                console.error('Error loading user info:', error);
            }
        }

        // Update storage status display
        function updateStorageStatus(used, total) {
            const percent = total > 0 ? Math.round((used / total) * 100) : 0;
            const remaining = Math.max(0, total - used);

            document.getElementById('storage-used').textContent = formatBytes(used);
            document.getElementById('storage-total').textContent = formatBytes(total);
            document.getElementById('storage-remaining').textContent = formatBytes(remaining);
            document.getElementById('storage-percent').textContent = percent + '%';
            document.getElementById('storage-progress-fill').style.width = percent + '%';

            // Change progress color based on usage
            const progressFill = document.getElementById('storage-progress-fill');
            if (percent >= 90) {
                progressFill.style.background = 'var(--danger)';
            } else if (percent >= 75) {
                progressFill.style.background = 'var(--warning)';
            } else {
                progressFill.style.background = 'var(--success)';
            }
        }

        // Upload handlers
        function handleDragOver(e) {
            e.preventDefault();
            document.getElementById('upload-area').classList.add('dragover');
        }

        function handleDragLeave(e) {
            document.getElementById('upload-area').classList.remove('dragover');
        }

        function handleDrop(e) {
            e.preventDefault();
            document.getElementById('upload-area').classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                uploadFile(files[0]);
            }
        }

        function handleFileSelect(e) {
            if (e.target.files.length > 0) {
                uploadFile(e.target.files[0]);
            }
        }

        function triggerFileInput() {
            document.getElementById('file-input').click();
        }

        document.getElementById('upload-area').addEventListener('click', triggerFileInput);

        async function uploadFile(file) {
            const msgEl = document.getElementById('message-upload');
            const progressDiv = document.getElementById('upload-progress');
            const progressFill = document.getElementById('progress-fill');
            const progressPercent = document.getElementById('progress-percent');

            msgEl.style.display = 'none';
            progressDiv.style.display = 'block';

            const formData = new FormData();
            formData.append('file', file);

            try {
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        progressPercent.textContent = percent;
                        progressFill.style.width = percent + '%';
                    }
                });

                xhr.addEventListener('load', () => {
                    progressDiv.style.display = 'none';
                    if (xhr.status === 200) {
                        const response = JSON.parse(xhr.responseText);
                        if (response.success) {
                            showMessage(msgEl, 'success', '✓ File uploaded successfully');
                            document.getElementById('file-input').value = '';
                            loadFiles();
                        } else {
                            showMessage(msgEl, 'error', '✗ ' + (response.message || 'Upload failed'));
                        }
                    } else {
                        showMessage(msgEl, 'error', '✗ Upload failed');
                    }
                });

                xhr.addEventListener('error', () => {
                    progressDiv.style.display = 'none';
                    showMessage(msgEl, 'error', '✗ Network error');
                });

                xhr.open('POST', '/api/upload');
                xhr.send(formData);
            } catch (error) {
                progressDiv.style.display = 'none';
                showMessage(msgEl, 'error', '✗ ' + error.message);
            }
        }

        // Load files
        async function loadFiles() {
            const loadingEl = document.getElementById('loading-files');
            const noFilesEl = document.getElementById('no-files');
            const filesListEl = document.getElementById('files-list');
            const filesTbodyEl = document.getElementById('files-tbody');

            loadingEl.style.display = 'block';
            noFilesEl.style.display = 'none';
            filesListEl.style.display = 'none';

            try {
                const response = await fetch('/api/files');
                const data = await response.json();

                loadingEl.style.display = 'none';

                // Also refresh user info to get updated storage
                const userResponse = await fetch('http://localhost:4000/api/user', {
                    credentials: 'include'
                });
                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    if (userData.user) {
                        updateStorageStatus(userData.user.usedStorage, userData.user.storageLimit);
                    }
                }

                if (!data.success || !data.files || data.files.length === 0) {
                    noFilesEl.style.display = 'block';
                    return;
                }

                filesTbodyEl.innerHTML = data.files.map((file, index) => {
                    const safeId = 'share-btn-' + index;
                    return \`
                    <tr>
                        <td>
                            <div class="file-name-cell">
                                <i class="fas fa-file"></i>
                                <span title="\${file.name}">\${file.name.length > 40 ? file.name.substring(0, 37) + '...' : file.name}</span>
                            </div>
                        </td>
                        <td class="file-size">\${formatBytes(file.size)}</td>
                        <td class="file-date">\${new Date(file.created).toLocaleString()}</td>
                        <td class="file-actions-cell" style="display: flex; gap: 5px;">
                            <button class="btn-success btn-small" onclick="downloadFile('\${file.name}')" title="Download">
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="btn-info btn-small" id="\${safeId}" data-filename="\${file.name}" onclick="toggleFileShare('\${file.name}', '\${safeId}')" title="Make public/private">
                                <i class="fas fa-lock"></i>
                            </button>
                            <button class="btn-danger btn-small" onclick="deleteFile('\${file.name}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                \`;
                }).join('');

                filesListEl.style.display = 'block';
            } catch (error) {
                loadingEl.style.display = 'none';
                showMessage(document.getElementById('message-files'), 'error', '✗ ' + error.message);
            }
        }

        // Download file
        function downloadFile(filename) {
            window.location.href = '/api/download/' + encodeURIComponent(filename);
        }

        // Download shared file from another user
        function downloadSharedFile(ownerId, filename) {
            window.location.href = '/api/download/' + encodeURIComponent(ownerId) + '/' + encodeURIComponent(filename);
        }

        // Load shared files
        async function loadSharedFiles() {
            const loadingEl = document.getElementById('loading-shared');
            const noFilesEl = document.getElementById('no-shared');
            const filesListEl = document.getElementById('shared-files-list');
            const filesTbodyEl = document.getElementById('shared-files-tbody');

            loadingEl.style.display = 'block';
            noFilesEl.style.display = 'none';
            filesListEl.style.display = 'none';

            try {
                const response = await fetch('/api/files/shared/all');
                const data = await response.json();

                loadingEl.style.display = 'none';

                if (!data.success || !data.files || data.files.length === 0) {
                    noFilesEl.style.display = 'block';
                    return;
                }

                filesTbodyEl.innerHTML = data.files.map(file => \`
                    <tr>
                        <td>
                            <div class="file-name-cell">
                                <i class="fas fa-file"></i>
                                <span title="\${file.name}">\${file.name.length > 35 ? file.name.substring(0, 32) + '...' : file.name}</span>
                            </div>
                        </td>
                        <td class="file-size">\${formatBytes(file.size)}</td>
                        <td class="file-owner" title="\${file.owner}"><small>\${file.owner.substring(0, 20)}</small></td>
                        <td class="file-date"><small>\${new Date(file.created).toLocaleString()}</small></td>
                        <td class="file-actions-cell">
                            <button class="btn-success btn-small" onclick="downloadSharedFile('\${file.ownerId}', '\${file.name}')" title="Download">
                                <i class="fas fa-download"></i>
                            </button>
                        </td>
                    </tr>
                \`).join('');

                filesListEl.style.display = 'block';
            } catch (error) {
                loadingEl.style.display = 'none';
                showMessage(document.getElementById('message-shared'), 'error', '✗ ' + error.message);
            }
        }

        // Delete file
        async function deleteFile(filename) {
            if (!confirm('Are you sure you want to delete ' + filename + '?')) return;

            try {
                const response = await fetch(\`/api/files/\${encodeURIComponent(filename)}\`, {
                    method: 'DELETE'
                });
                const data = await response.json();

                if (data.success) {
                    showMessage(document.getElementById('message-files'), 'success', '✓ File deleted');
                    loadFiles();
                } else {
                    showMessage(document.getElementById('message-files'), 'error', '✗ ' + (data.message || 'Delete failed'));
                }
            } catch (error) {
                showMessage(document.getElementById('message-files'), 'error', '✗ ' + error.message);
            }
        }

        // Toggle file share status
        async function toggleFileShare(filename, buttonId) {
            try {
                const response = await fetch('/api/files/toggle-share', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename })
                });

                const data = await response.json();
                if (data.success) {
                    const btn = document.getElementById(buttonId);
                    if (btn) {
                        if (data.shared) {
                            btn.classList.remove('btn-info');
                            btn.classList.add('btn-warning');
                            btn.innerHTML = '<i class="fas fa-unlock"></i>';
                            btn.title = 'Make private';
                        } else {
                            btn.classList.remove('btn-warning');
                            btn.classList.add('btn-info');
                            btn.innerHTML = '<i class="fas fa-lock"></i>';
                            btn.title = 'Make public';
                        }
                    }
                    showMessage(document.getElementById('message-files'), 'success', '✓ ' + data.message);
                    loadSharedFiles(); // Refresh shared files list
                } else {
                    showMessage(document.getElementById('message-files'), 'error', '✗ ' + (data.message || 'Failed to toggle share'));
                }
            } catch (error) {
                console.error('Toggle share error:', error);
                showMessage(document.getElementById('message-files'), 'error', '✗ ' + error.message);
            }
        }

        // Utility functions
        function showMessage(el, type, text) {
            el.className = 'message ' + type;
            el.textContent = text;
            el.style.display = 'block';
            setTimeout(() => {
                el.style.display = 'none';
            }, 4000);
        }

        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // Load on page load
        document.addEventListener('DOMContentLoaded', () => {
            loadUserInfo();
            loadFiles();
            loadSharedFiles();
            setInterval(() => {
                loadFiles();
                loadSharedFiles();
            }, 10000); // Auto-refresh every 10 seconds
        });
    </script>
</body>
</html>
  `;
}

function startUserDashboard() {
  app.listen(PORT, () => {
    console.log(chalk.blue(`👤 User Dashboard running on http://localhost:${PORT}`));
    console.log(chalk.cyan(`   Open http://localhost:${PORT} in your browser`));
  });
}

module.exports = { startUserDashboard };
