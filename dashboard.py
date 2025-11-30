
from flask import Flask, render_template_string, request, redirect, send_file, flash, url_for
import threading
import time
import io
from controller import registered_nodes, file_locations

app = Flask(__name__)

TEMPLATE = '''
<!DOCTYPE html>
<html>
<head>
    <title>Storage Dashboard</title>
    <style>
        body { 
            font-family: 'Segoe UI', system-ui, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
            color: #333;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            margin-bottom: 30px;
        }

        .header h1 {
            color: white;
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }

        .header p {
            color: rgba(255,255,255,0.9);
            font-size: 1.1rem;
        }

        .card {
            background: white;
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 25px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            border: 1px solid rgba(255,255,255,0.2);
        }

        .card h2 {
            color: #4361ee;
            margin-top: 0;
            margin-bottom: 20px;
            font-size: 1.4rem;
            border-bottom: 2px solid #f0f0f0;
            padding-bottom: 10px;
        }

        .form-row {
            display: flex;
            gap: 15px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }

        .form-group {
            flex: 1;
            min-width: 200px;
        }

        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #555;
        }

        input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            font-size: 1rem;
            transition: all 0.2s;
        }

        input:focus {
            outline: none;
            border-color: #4361ee;
            box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.1);
        }

        .btn { 
            background: #4361ee; 
            color: white; 
            border: none; 
            padding: 12px 30px; 
            border-radius: 8px; 
            cursor: pointer; 
            font-size: 1rem;
            font-weight: 600;
            transition: all 0.2s;
        }

        .btn:hover { 
            background: #3a56d4;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(67, 97, 238, 0.3);
        }

        table { 
            width: 100%; 
            border-collapse: collapse;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        th, td { 
            padding: 15px; 
            text-align: left; 
            border-bottom: 1px solid #f0f0f0;
        }

        th { 
            background: #4361ee;
            color: white;
            font-weight: 600;
        }

        tr:hover {
            background: #f8f9ff;
        }

        .status {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 600;
        }

        .online { 
            background: #e7f7ef;
            color: #0ca678;
        }

        .offline { 
            background: #ffeaea;
            color: #fa5252;
        }

        .file-owner {
            background: #eef2ff;
            color: #4361ee;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 0.8rem;
            margin: 2px;
            display: inline-block;
        }

        .alert {
            background: #fff3cd;
            color: #856404;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            border: 1px solid #ffeaa7;
            text-align: center;
        }

        @media (max-width: 768px) {
            .form-row {
                flex-direction: column;
            }
            
            .form-group {
                min-width: 100%;
            }
            
            body {
                padding: 15px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📦 Storage Dashboard</h1>
            <p>Manage your distributed storage network</p>
        </div>

        {% with messages = get_flashed_messages() %}
            {% if messages %}
                <div class="alert">{{ messages[0] }}</div>
            {% endif %}
        {% endwith %}

        <div class="card">
            <h2>➕ Register Node</h2>
            <form method="post" action="/register_node">
                <div class="form-row">
                    <div class="form-group">
                        <label>Node ID</label>
                        <input name="node_id" required placeholder="node-001">
                    </div>
                    <div class="form-group">
                        <label>Address</label>
                        <input name="address" value="127.0.0.1" required>
                    </div>
                    <div class="form-group">
                        <label>Port</label>
                        <input name="port" type="number" value="5001" required>
                    </div>
                </div>
                <button class="btn" type="submit">Register Node</button>
            </form>
        </div>

        <div class="card">
            <h2>⬆️ Upload File</h2>
            <form method="post" action="/upload_file" enctype="multipart/form-data">
                <div class="form-row">
                    <div class="form-group">
                        <label>Filename</label>
                        <input name="filename" required placeholder="my-file.txt">
                    </div>
                    <div class="form-group">
                        <label>Owner Node ID</label>
                        <input name="owner_id" required placeholder="node-001">
                    </div>
                    <div class="form-group">
                        <label>File</label>
                        <input type="file" name="filedata" required style="padding: 8px;">
                    </div>
                </div>
                <button class="btn" type="submit">Upload File</button>
            </form>
        </div>

        <div class="card">
            <h2>⬇️ Download File</h2>
            <form method="get" action="/download_file">
                <div class="form-row">
                    <div class="form-group">
                        <label>Filename</label>
                        <input name="filename" required placeholder="Enter filename">
                    </div>
                </div>
                <button class="btn" type="submit">Download File</button>
            </form>
        </div>

        <div class="card">
            <h2>🌐 Nodes ({{ nodes|length }})</h2>
            <table>
                <tr>
                    <th>ID</th>
                    <th>Address</th>
                    <th>Port</th>
                    <th>Status</th>
                    <th>Last Seen</th>
                </tr>
                {% for nid, (addr, port, online, last_seen) in nodes.items() %}
                <tr>
                    <td><strong>{{ nid }}</strong></td>
                    <td>{{ addr }}</td>
                    <td>{{ port }}</td>
                    <td>
                        <span class="status {{ 'online' if online else 'offline' }}">
                            {{ 'Online' if online else 'Offline' }}
                        </span>
                    </td>
                    <td>{{ last_seen }}</td>
                </tr>
                {% endfor %}
            </table>
        </div>

        <div class="card">
            <h2>📁 Files ({{ files|length }})</h2>
            <table>
                <tr>
                    <th>Filename</th>
                    <th>Owners</th>
                    <th>Upload Time</th>
                </tr>
                {% for fname, info in files.items() %}
                <tr>
                    <td><strong>{{ fname }}</strong></td>
                    <td>
                        {% for owner in info['owners'] %}
                            <span class="file-owner">{{ owner[0] }}</span>
                        {% endfor %}
                    </td>
                    <td>{{ info['upload_time'] }}</td>
                </tr>
                {% endfor %}
            </table>
        </div>
    </div>
</body>
</html>
'''

@app.route('/')
def dashboard():
    return render_template_string(TEMPLATE, nodes=registered_nodes, files=file_locations)


# --- Web endpoints for actions ---
@app.route('/register_node', methods=['POST'])
def register_node():
    node_id = request.form['node_id']
    address = request.form['address']
    port = int(request.form['port'])
    now = time.strftime('%Y-%m-%d %H:%M:%S')
    registered_nodes[node_id] = (address, port, True, now)
    flash(f"Node {node_id} registered at {address}:{port} (ONLINE)")
    return redirect(url_for('dashboard'))

@app.route('/upload_file', methods=['POST'])
def upload_file():
    filename = request.form['filename']
    owner_id = request.form['owner_id']
    file = request.files['filedata']
    if not file:
        flash("No file uploaded!")
        return redirect(url_for('dashboard'))
    now = time.strftime('%Y-%m-%d %H:%M:%S')
    # Simulate file storage: just record metadata
    if filename not in file_locations:
        file_locations[filename] = {'owners': set(), 'upload_time': now}
    # Use dummy address/port if owner not registered
    if owner_id in registered_nodes:
        addr, port, _, _ = registered_nodes[owner_id]
    else:
        addr, port = '127.0.0.1', 5001
    file_locations[filename]['owners'].add((owner_id, addr, port))
    file_locations[filename]['upload_time'] = now
    flash(f"File '{filename}' uploaded and owned by {owner_id}")
    return redirect(url_for('dashboard'))

@app.route('/download_file', methods=['GET'])
def download_file():
    filename = request.args.get('filename')
    if filename not in file_locations:
        flash(f"File '{filename}' not found!")
        return redirect(url_for('dashboard'))
    # Simulate file content
    content = f"Dummy content of {filename} (not actual file data)"
    return send_file(io.BytesIO(content.encode()), as_attachment=True, download_name=filename)

def run_dashboard():
    app.secret_key = 'zebcontrollersecret'
    app.run(port=8080, debug=False, use_reloader=False)

# To run the dashboard in parallel with the controller, call run_dashboard() in a thread.
