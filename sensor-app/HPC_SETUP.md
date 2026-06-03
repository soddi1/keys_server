# HPC File Upload Setup Guide

## 🎯 Overview

Your sensor app now uploads files directly to your HPC server via a simple HTTP API. No OAuth, no Google Drive complexity - just direct file transfer!

## 📋 Architecture

```
[Mobile App] --> HTTP POST --> [HPC Server API] --> [File Storage]
```

## 🚀 Quick Start

### Step 1: Set Up the Backend on HPC

I've provided two options:

#### **Option A: Python Flask Server (Recommended)**

- Easy to set up
- Works on any HPC with Python
- See `hpc-server/python-flask/` directory

#### **Option B: Node.js Express Server**

- If your HPC prefers Node.js
- See `hpc-server/node-express/` directory

### Step 2: Configure Your App

Edit `components/hpc-upload.ts` and update the configuration:

```typescript
const HPC_CONFIG = {
  uploadUrl: "https://your-hpc-server.university.edu/api/upload",
  authToken: "your-secret-token-here", // Optional
};
```

### Step 3: Test It!

Run your app and try uploading sensor data - it will go straight to your HPC!

---

## 🔧 Detailed Setup

### On Your HPC Server

#### 1. **Create Upload Directory**

```bash
# SSH into your HPC
ssh username@your-hpc-server.university.edu

# Create directory for uploads
mkdir -p ~/sensor-data-uploads
cd ~/sensor-data-uploads
```

#### 2. **Set Up Python Flask Server**

```bash
# Install Python and Flask
module load python3  # or: conda activate your-env
pip install flask flask-cors

# Create the server file (see hpc-server/python-flask/server.py)
nano server.py
# (Copy the content from the provided server.py file)

# Run the server
python server.py
```

The server will start on `http://localhost:5000`

#### 3. **Expose to Internet (Optional)**

**Option A: Using nginx reverse proxy** (if available on HPC)

```bash
# Configure nginx to proxy to your Flask server
# This gives you HTTPS and a public URL
```

**Option B: Using SSH tunnel** (for testing)

```bash
# On your local machine:
ssh -L 5000:localhost:5000 username@your-hpc-server.university.edu

# Now your app can upload to http://localhost:5000/api/upload
```

**Option C: Using ngrok** (easiest for testing)

```bash
# On HPC:
./ngrok http 5000

# ngrok will give you a URL like: https://abc123.ngrok.io
# Use this as your uploadUrl!
```

---

## 📁 File Structure on HPC

Uploaded files will be saved in:

```
~/sensor-data-uploads/
├── 2025-11-06/
│   ├── accelerometer-data-001.csv
│   ├── gyroscope-data-001.csv
│   └── microphone-data-001.zip
├── 2025-11-07/
│   └── ...
└── upload.log
```

---

## 🔐 Security

### Add Authentication Token

Edit your server to require an auth token:

```python
# In server.py
AUTH_TOKEN = "your-secret-token-12345"

@app.route('/api/upload', methods=['POST'])
def upload_file():
    # Check authorization
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if token != AUTH_TOKEN:
        return jsonify({'error': 'Unauthorized'}), 401
    # ... rest of upload logic
```

Then update your app:

```typescript
// In components/hpc-upload.ts
const HPC_CONFIG = {
  authToken: "your-secret-token-12345",
};
```

### Use HTTPS

For production, always use HTTPS:

- Set up SSL certificate on your HPC
- Use your university's proxy/load balancer
- Or use a service like Cloudflare

---

## 🧪 Testing

### Test the Server

```bash
# On HPC, test if server is running:
curl -X POST http://localhost:5000/api/upload \
  -F "file=@test.txt" \
  -F "filename=test.txt"
```

### Test from App

1. Update `uploadUrl` in `components/hpc-upload.ts`
2. Run your app
3. Record some sensor data
4. Tap "Upload to HPC"
5. Check the HPC server logs

---

## 📊 Monitoring Uploads

The server logs all uploads to `upload.log`:

```bash
# View recent uploads
tail -f upload.log

# Count uploads today
grep "$(date +%Y-%m-%d)" upload.log | wc -l
```

---

## 🔧 Configuration Options

### Change Upload Directory

```python
# In server.py
UPLOAD_FOLDER = '/path/to/your/data/directory'
```

### Limit File Size

```python
# In server.py
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max
```

### Add Metadata Storage

Save metadata (device info, timestamps) to a database:

```python
# Install: pip install sqlalchemy
# See hpc-server/python-flask/server-with-db.py (optional)
```

---

## 🐛 Troubleshooting

### "Network request failed"

- Check if HPC server is running
- Verify the `uploadUrl` is correct
- Check firewall rules on HPC

### "Connection timeout"

- File might be too large
- Network too slow
- Increase timeout in `hpc-upload.ts`

### "Upload failed with status 500"

- Check server logs: `tail -f upload.log`
- Check disk space: `df -h`
- Check permissions: `ls -la upload_directory`

---

## 📚 Next Steps

1. ✅ Set up the Python server on HPC
2. ✅ Update `uploadUrl` in your app
3. ✅ Test uploading a file
4. ✅ Add authentication token (optional)
5. ✅ Set up automated data processing on HPC

---

## 🎓 For Research Use

This setup is perfect for:

- ✅ Continuous data collection from multiple devices
- ✅ Automated processing pipelines on HPC
- ✅ Secure storage on university infrastructure
- ✅ No cloud service costs or quotas
- ✅ Direct access to data for analysis

---

**Questions?** Check the example server code in `hpc-server/` directory!
