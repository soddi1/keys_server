# 🚀 Quick Start: HPC Upload

## ✅ What Changed

**Removed:**

- ❌ Google Drive OAuth (too complex!)
- ❌ All Google authentication files
- ❌ OAuth consent screens and redirect URIs

**Added:**

- ✅ Simple HTTP upload to HPC
- ✅ Python Flask server (ready to deploy)
- ✅ No authentication complexity

---

## 🎯 Setup in 3 Steps

### Step 1: Deploy Server on HPC (5 minutes)

```bash
# SSH into your HPC
ssh username@your-hpc.edu

# Create directory
mkdir ~/sensor-upload-server
cd ~/sensor-upload-server

# Copy the server files from hpc-server/python-flask/
# Then install and run:
pip install -r requirements.txt
python server.py
```

### Step 2: Expose to Internet

**Option A: Using ngrok (Easiest)**

```bash
# Download from https://ngrok.com
./ngrok http 5000

# You'll get a URL like: https://abc123.ngrok.io
```

**Option B: SSH Tunnel (For testing)**

```bash
# On your local machine:
ssh -L 5000:localhost:5000 username@hpc.edu
# Then use: http://localhost:5000/api/upload
```

### Step 3: Update Your App (1 minute)

Edit `components/hpc-upload.ts`:

```typescript
const HPC_CONFIG = {
  uploadUrl: "https://abc123.ngrok.io/api/upload", // Your ngrok URL
  authToken: "", // Optional: add token for security
};
```

**That's it!** 🎉

---

## 🧪 Test It

1. Start your app: `npx expo start`
2. Record some sensor data
3. Tap "Upload to HPC"
4. Check your HPC server - files will be in `./uploads/YYYY-MM-DD/`

---

## 📁 Files Overview

### App Files (Modified)

- `components/hpc-upload.ts` - New upload utility
- `app/(tabs)/microphone.tsx` - Updated import
- `app/(tabs)/accelerometer.tsx` - Updated import
- `app/(tabs)/gyroscope.tsx` - Updated import
- `app/(tabs)/explore.tsx` - Updated import

### Server Files (New)

- `hpc-server/python-flask/server.py` - Upload server
- `hpc-server/python-flask/requirements.txt` - Dependencies
- `hpc-server/python-flask/README.md` - Setup instructions

### Documentation

- `HPC_SETUP.md` - Detailed setup guide
- `QUICKSTART_HPC.md` - This file!

---

## 💡 Why This is Better

| Google Drive          | HPC Upload                       |
| --------------------- | -------------------------------- |
| OAuth setup (30 min)  | Server setup (5 min)             |
| Redirect URI issues   | Direct HTTP                      |
| Token expiration      | No auth needed (or simple token) |
| Rate limits           | No limits                        |
| Files in Google Drive | Files directly on HPC            |
| Hard to automate      | Easy to process automatically    |

---

## 🔐 Optional: Add Security

Edit `hpc-server/python-flask/server.py`:

```python
AUTH_TOKEN = "your-secret-token-12345"
```

Then in `components/hpc-upload.ts`:

```typescript
const HPC_CONFIG = {
  authToken: "your-secret-token-12345",
};
```

---

## 🐛 Troubleshooting

**"Network request failed"**

- Check if server is running: `curl http://localhost:5000/api/health`
- Check firewall settings
- Verify the uploadUrl is correct

**"Connection timeout"**

- File might be too large
- Check network connection
- Increase timeout in `hpc-upload.ts`

**Server won't start**

- Check Python version: `python --version` (need 3.7+)
- Install dependencies: `pip install -r requirements.txt`
- Check port 5000 is available: `lsof -i :5000`

---

## 📚 Next Steps

1. ✅ Deploy the server on your HPC
2. ✅ Test the upload
3. ✅ Add authentication token (optional)
4. ✅ Set up automated data processing
5. ✅ Monitor uploads with the stats endpoint

---

## 🎓 For Your Research

The server saves files in date-based folders:

```
uploads/
├── 2025-11-06/
│   ├── accelerometer-001.csv
│   ├── gyroscope-001.csv
│   └── all-sensors-001.zip
└── 2025-11-07/
    └── ...
```

Easy to:

- Process files by date
- Archive old data
- Run batch analysis
- Feed into ML pipelines

---

**Questions?** Check `HPC_SETUP.md` for detailed documentation!

**Server logs** are in `upload.log` - check there if something isn't working.
