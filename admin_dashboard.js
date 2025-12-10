const express = require('express');
const axios = require('axios');
const chalk = require('chalk');
const path = require('path');

const app = express();
const PORT = 4001;

// Controller URL
const CONTROLLER_URL = 'http://localhost:6000';

// Serve admin dashboard
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to get all nodes from controller
app.get('/api/admin/nodes', async (req, res) => {
  try {
    const response = await axios.get(`${CONTROLLER_URL}/api/nodes`, { timeout: 5000 });
    const nodes = response.data.nodes || [];
    
    // Enrich nodes with storage info if available
    const enrichedNodes = nodes.map(node => ({
      id: node.id,
      address: node.address,
      port: node.port,
      owner: node.owner || 'Unknown',
      online: node.online,
      lastSeen: node.lastSeen,
      storage: node.storage || { used: 0, total: 1073741824 } // 1GB default
    }));
    
    res.json({ success: true, nodes: enrichedNodes });
  } catch (error) {
    console.error(chalk.red('[Admin API] Error fetching nodes:', error.message));
    res.status(500).json({ success: false, error: error.message, nodes: [] });
  }
});

// API endpoint to get all files
app.get('/api/admin/files', async (req, res) => {
  try {
    const response = await axios.get(`${CONTROLLER_URL}/api/files`, { timeout: 5000 });
    const files = response.data.files || [];
    res.json({ success: true, files });
  } catch (error) {
    console.error(chalk.red('[Admin API] Error fetching files:', error.message));
    res.status(500).json({ success: false, error: error.message, files: [] });
  }
});

// API endpoint to get system stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [nodesRes, filesRes] = await Promise.all([
      axios.get(`${CONTROLLER_URL}/api/nodes`, { timeout: 5000 }),
      axios.get(`${CONTROLLER_URL}/api/files`, { timeout: 5000 })
    ]);

    const nodes = nodesRes.data.nodes || [];
    const files = filesRes.data.files || [];

    const totalNodes = nodes.length;
    const onlineNodes = nodes.filter(n => n.online).length;
    const totalFiles = files.length;
    const totalStorage = nodes.reduce((sum, n) => sum + (n.storage?.total || 1073741824), 0);
    const usedStorage = nodes.reduce((sum, n) => sum + (n.storage?.used || 0), 0);

    res.json({
      success: true,
      stats: {
        totalNodes,
        onlineNodes,
        totalFiles,
        totalStorage,
        usedStorage
      }
    });
  } catch (error) {
    console.error(chalk.red('[Admin API] Error fetching stats:', error.message));
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stats: { totalNodes: 0, onlineNodes: 0, totalFiles: 0, totalStorage: 0, usedStorage: 0 }
    });
  }
});

// Serve the admin dashboard HTML
app.get('/', (req, res) => {
  res.send(getAdminHTML());
});

function getAdminHTML() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Dashboard - Cloud Storage</title>
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
            max-width: 1400px;
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
            font-size: 2rem;
            background: linear-gradient(to right, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .controls {
            display: flex;
            gap: 10px;
        }

        button {
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .btn-refresh {
            background: var(--primary);
            color: white;
        }

        .btn-refresh:hover {
            background: #5a0a9a;
            transform: scale(1.05);
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 20px;
            backdrop-filter: blur(10px);
        }

        .stat-card h3 {
            font-size: 0.9rem;
            color: var(--gray);
            margin-bottom: 10px;
            text-transform: uppercase;
        }

        .stat-card .value {
            font-size: 2rem;
            font-weight: bold;
            color: var(--primary);
        }

        .nodes-section {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 20px;
            backdrop-filter: blur(10px);
            overflow: auto;
        }

        .nodes-section h2 {
            margin-bottom: 20px;
            color: var(--secondary);
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }

        table thead {
            background: rgba(0, 0, 0, 0.2);
        }

        table th {
            padding: 15px;
            text-align: left;
            font-weight: 600;
            border-bottom: 2px solid rgba(255, 255, 255, 0.1);
        }

        table td {
            padding: 12px 15px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        table tbody tr:hover {
            background: rgba(255, 255, 255, 0.02);
        }

        .status-badge {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 600;
        }

        .status-online {
            background: rgba(6, 214, 160, 0.2);
            color: var(--success);
        }

        .status-offline {
            background: rgba(239, 71, 111, 0.2);
            color: var(--danger);
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: var(--gray);
        }

        .error {
            background: rgba(239, 71, 111, 0.1);
            border: 1px solid rgba(239, 71, 111, 0.5);
            color: var(--danger);
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }

        .no-data {
            text-align: center;
            padding: 40px;
            color: var(--gray);
        }

        .timestamp {
            font-size: 0.85rem;
            color: var(--gray);
        }

        @media (max-width: 768px) {
            .stats-grid {
                grid-template-columns: 1fr;
            }

            table {
                font-size: 0.9rem;
            }

            table th, table td {
                padding: 8px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1><i class="fas fa-cloud"></i> Admin Dashboard</h1>
            <div class="controls">
                <button class="btn-refresh" onclick="refreshData()">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
            </div>
        </header>

        <div id="stats-container" class="stats-grid">
            <div class="stat-card">
                <h3>Storage Nodes</h3>
                <div class="value" id="total-nodes">0</div>
                <div class="timestamp" id="online-nodes">0 online</div>
            </div>
            <div class="stat-card">
                <h3>Total Files</h3>
                <div class="value" id="total-files">0</div>
            </div>
            <div class="stat-card">
                <h3>Used Storage</h3>
                <div class="value" id="used-storage">0 GB</div>
                <div class="timestamp" id="total-storage">15GB available</div>
            </div>
        </div>

        <div class="nodes-section">
            <h2><i class="fas fa-server"></i> Storage Nodes</h2>
            <div id="error-container"></div>
            <div id="loading-container" class="loading" style="display: none;">
                <i class="fas fa-spinner fa-spin"></i> Loading nodes...
            </div>
            <div id="no-data-container" class="no-data" style="display: none;">
                <i class="fas fa-inbox"></i> No nodes registered yet
            </div>
            <table id="nodes-table" style="display: none;">
                <thead>
                    <tr>
                        <th>Node ID</th>
                        <th>Owner</th>
                        <th>Address</th>
                        <th>Port</th>
                        <th>Status</th>
                        <th>Storage Used</th>
                        <th>Last Seen</th>
                    </tr>
                </thead>
                <tbody id="nodes-tbody">
                </tbody>
            </table>
        </div>
    </div>

    <script>
        const API_BASE = 'http://localhost:4001';
        let autoRefreshInterval;

        async function loadStats() {
            try {
                const response = await fetch(\`\${API_BASE}/api/admin/stats\`);
                const data = await response.json();

                if (data.success) {
                    const { stats } = data;
                    document.getElementById('total-nodes').textContent = stats.totalNodes;
                    document.getElementById('online-nodes').textContent = \`\${stats.onlineNodes} online\`;
                    document.getElementById('total-files').textContent = stats.totalFiles;
                    document.getElementById('used-storage').textContent = formatBytes(stats.usedStorage);
                    document.getElementById('total-storage').textContent = formatBytes(stats.totalStorage) + ' available';
                }
            } catch (error) {
                console.error('Error loading stats:', error);
            }
        }

        async function loadNodes() {
            const loadingEl = document.getElementById('loading-container');
            const noDataEl = document.getElementById('no-data-container');
            const tableEl = document.getElementById('nodes-table');
            const tbodyEl = document.getElementById('nodes-tbody');
            const errorEl = document.getElementById('error-container');

            loadingEl.style.display = 'block';
            tableEl.style.display = 'none';
            noDataEl.style.display = 'none';
            errorEl.innerHTML = '';

            try {
                const response = await fetch(\`\${API_BASE}/api/admin/nodes\`);
                const data = await response.json();

                loadingEl.style.display = 'none';

                if (!data.success || !data.nodes || data.nodes.length === 0) {
                    noDataEl.style.display = 'block';
                    return;
                }

                tbodyEl.innerHTML = data.nodes.map(node => \`
                    <tr>
                        <td><strong>\${node.id}</strong></td>
                        <td>\${node.owner || '—'}</td>
                        <td>\${node.address}</td>
                        <td>\${node.port}</td>
                        <td>
                            <span class="status-badge \${node.online ? 'status-online' : 'status-offline'}">
                                <i class="fas fa-circle" style="font-size: 8px;"></i>
                                \${node.online ? 'Online' : 'Offline'}
                            </span>
                        </td>
                            <td>\${formatBytes(node.storage?.used || 0)} / \${formatBytes(node.storage?.total || (5 * 1024 * 1024 * 1024))}</td>
                        <td><span class="timestamp">\${new Date(node.lastSeen).toLocaleString()}</span></td>
                    </tr>
                \`).join('');

                tableEl.style.display = 'table';
            } catch (error) {
                loadingEl.style.display = 'none';
                errorEl.innerHTML = \`<div class="error"><i class="fas fa-exclamation-circle"></i> Error: \${error.message}</div>\`;
                console.error('Error loading nodes:', error);
            }
        }

        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        function refreshData() {
            loadStats();
            loadNodes();
        }

        // Load data on page load
        document.addEventListener('DOMContentLoaded', () => {
            refreshData();
            // Auto-refresh every 5 seconds
            autoRefreshInterval = setInterval(refreshData, 5000);
        });

        // Clean up interval on page unload
        window.addEventListener('beforeunload', () => {
            if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        });
    </script>
</body>
</html>
  `;
}

function startAdminDashboard() {
  app.listen(PORT, () => {
    console.log(chalk.magenta(`🎛️  Admin Dashboard running on http://localhost:${PORT}`));
    console.log(chalk.cyan(`   Open http://localhost:${PORT} in your browser`));
  });
}

module.exports = { startAdminDashboard };
