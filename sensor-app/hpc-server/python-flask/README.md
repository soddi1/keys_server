# HPC Server Setup

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the Server

```bash
python server.py
```

The server will start on `http://localhost:5000`

### 3. Test It

```bash
# Health check
curl http://localhost:5000/api/health

# Test upload
curl -X POST http://localhost:5000/api/upload \
  -F "file=@test.txt" \
  -F "filename=test.txt"

# Check stats
curl http://localhost:5000/api/stats
```

## Configuration

Edit `server.py` to configure:

```python
UPLOAD_FOLDER = './uploads'  # Where files are saved
AUTH_TOKEN = "your-secret-123"  # Set to enable auth
MAX_FILE_SIZE = 100 * 1024 * 1024  # Max file size (100MB)
```

## Production Deployment

For production use, run with gunicorn:

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 server:app
```

## Expose to Internet

### Option 1: ngrok (Easiest for testing)

```bash
# Download ngrok from https://ngrok.com/
./ngrok http 5000

# Use the https URL in your app
```

### Option 2: SSH Tunnel

```bash
# On your local machine:
ssh -L 5000:localhost:5000 username@hpc-server

# Now use http://localhost:5000 in your app
```

### Option 3: nginx (Production)

```nginx
server {
    listen 80;
    server_name your-domain.edu;

    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Security

1. **Always use AUTH_TOKEN in production**
2. **Use HTTPS (not HTTP)**
3. **Restrict file types in ALLOWED_EXTENSIONS**
4. **Set appropriate MAX_FILE_SIZE**
5. **Monitor disk space**

## Monitoring

View logs:

```bash
tail -f upload.log
```

Check uploaded files:

```bash
ls -lh uploads/
```

Get statistics:

```bash
curl http://localhost:5000/api/stats
```

## Automated Processing

Process uploaded files automatically:

```bash
# Create a cron job
crontab -e

# Add this line to process files every hour:
0 * * * * python /path/to/process_sensor_data.py
```

Example processing script:

```python
# process_sensor_data.py
import os
import pandas as pd

upload_dir = './uploads'

for root, dirs, files in os.walk(upload_dir):
    for file in files:
        if file.endswith('.csv'):
            filepath = os.path.join(root, file)
            df = pd.read_csv(filepath)
            # Your analysis here
            print(f"Processed {file}: {len(df)} rows")
```

---

**That's it!** Your HPC is now ready to receive sensor data from the app. 🎉
