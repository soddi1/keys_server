"""
Simple Flask Server for Sensor Data Upload
Runs on your HPC and receives files from the mobile app
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
import threading
from datetime import datetime
import logging

# Configuration
UPLOAD_FOLDER = './uploads'  # Change this to your preferred directory
ALLOWED_EXTENSIONS = {'csv', 'zip', 'txt', 'json', 'mp3', 'wav', 'm4a'}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

# Optional: Set this to require authentication
AUTH_TOKEN = None  # Set to a secret string like: "your-secret-token-12345"

# In-memory remote-command relay state. The keystroke collector (PC) posts
# start/stop commands to /api/command; the phone polls /api/poll every few
# seconds and acknowledges via /api/ack after acting on a command.
_cmd_lock = threading.Lock()
_cmd_state = {
    "id": 0,
    "action": "none",
    "filename": "",
    "phone_ack_id": 0,
    "phone_ack_action": "",
}

# Create Flask app
app = Flask(__name__)
CORS(app)  # Allow cross-origin requests
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('upload.log'),
        logging.StreamHandler()
    ]
)

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/api/upload', methods=['POST'])
def upload_file():
    """
    Handle file upload
    Expected: multipart/form-data with 'file' field
    """
    try:
        # Optional: Check authentication
        if AUTH_TOKEN:
            auth_header = request.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '')
            if token != AUTH_TOKEN:
                logging.warning(f"Unauthorized upload attempt")
                return jsonify({'error': 'Unauthorized'}), 401

        # Check if file is in request
        if 'file' not in request.files:
            logging.error("No file in request")
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']

        # Check if filename is empty
        if file.filename == '':
            logging.error("Empty filename")
            return jsonify({'error': 'No file selected'}), 400

        # Get custom filename if provided
        custom_filename = request.form.get('filename', file.filename)
        
        # Get sensor type if provided
        sensor_type = request.form.get('sensorType', 'all')
        
        # Secure the filename
        filename = secure_filename(custom_filename)

        # Check if file extension is allowed
        if not allowed_file(filename):
            logging.error(f"Invalid file type: {filename}")
            return jsonify({'error': 'File type not allowed'}), 400

        # Create date-based subdirectory with sensor type folder
        today = datetime.now().strftime('%Y-%m-%d')
        sensor_folder = os.path.join(app.config['UPLOAD_FOLDER'], today, sensor_type)
        os.makedirs(sensor_folder, exist_ok=True)

        # Save the file
        filepath = os.path.join(sensor_folder, filename)
        file.save(filepath)

        # Get file size
        file_size = os.path.getsize(filepath)
        file_size_mb = file_size / (1024 * 1024)

        # Log successful upload
        logging.info(f"File uploaded: {filename} ({file_size_mb:.2f} MB) -> {sensor_type}")

        # Return success response
        return jsonify({
            'success': True,
            'filename': filename,
            'size': file_size,
            'size_mb': round(file_size_mb, 2),
            'path': filepath,
            'date': today,
            'sensor_type': sensor_type,
            'message': f'File uploaded successfully to {sensor_type} folder'
        }), 200

    except Exception as e:
        logging.error(f"Upload error: {str(e)}")
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500


@app.route('/api/command', methods=['POST'])
def post_command():
    """
    Queue a remote command for the phone to execute.
    Body: {"action": "start" | "stop", "filename": "<recording name>"}
    Called by the keystroke collector running on the laptop.
    """
    try:
        data = request.get_json(silent=True) or {}
        action = data.get('action', '').strip().lower()
        filename = (data.get('filename') or '').strip()

        if action not in ('start', 'stop'):
            return jsonify({'error': "action must be 'start' or 'stop'"}), 400

        with _cmd_lock:
            _cmd_state['id'] += 1
            _cmd_state['action'] = action
            _cmd_state['filename'] = filename
            current = dict(_cmd_state)

        logging.info(f"Command queued: id={current['id']} action={action} filename={filename!r}")
        return jsonify({'success': True, **current}), 200
    except Exception as e:
        logging.error(f"Command error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/poll', methods=['GET'])
def poll_command():
    """
    Phone polls this endpoint to check for a pending start/stop command.
    Returns the current command state. The phone should compare the returned
    `id` against its last-acknowledged id; only act when `id` is greater and
    `action` is not "none".
    """
    with _cmd_lock:
        current = dict(_cmd_state)
    return jsonify(current), 200


@app.route('/api/ack', methods=['POST'])
def ack_command():
    """
    Phone calls this after executing a command. If the supplied id matches
    the current command id, the action is reset to "none" so the same
    command is not executed again.
    Body: {"id": <int>}
    """
    try:
        data = request.get_json(silent=True) or {}
        ack_id = int(data.get('id', -1))
    except (TypeError, ValueError):
        return jsonify({'error': 'invalid id'}), 400

    with _cmd_lock:
        if ack_id == _cmd_state['id']:
            _cmd_state['phone_ack_id'] = ack_id
            _cmd_state['phone_ack_action'] = _cmd_state['action']
            _cmd_state['action'] = 'none'
            _cmd_state['filename'] = ''
            cleared = True
        else:
            cleared = False
        current = dict(_cmd_state)

    logging.info(f"Command ack: id={ack_id} cleared={cleared}")
    return jsonify({'success': True, 'cleared': cleared, **current}), 200


@app.route('/api/status', methods=['GET'])
def command_status():
    """
    Keystroke collector polls this after posting /api/command to learn when
    the phone has finished executing a start/stop command (via /api/ack).
    """
    with _cmd_lock:
        current = dict(_cmd_state)
    return jsonify({
        'pending_id': current['id'],
        'pending_action': current['action'],
        'phone_ack_id': current.get('phone_ack_id', 0),
        'phone_ack_action': current.get('phone_ack_action', ''),
    }), 200


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'Sensor Data Upload Server',
        'timestamp': datetime.now().isoformat()
    }), 200


@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get upload statistics"""
    try:
        total_files = 0
        total_size = 0
        dates = []

        # Count files in upload directory
        for root, dirs, files in os.walk(UPLOAD_FOLDER):
            for file in files:
                if allowed_file(file):
                    filepath = os.path.join(root, file)
                    total_files += 1
                    total_size += os.path.getsize(filepath)
            
            # Get dates
            for dir in dirs:
                if dir.replace('-', '').isdigit():  # Check if it's a date folder
                    dates.append(dir)

        return jsonify({
            'total_files': total_files,
            'total_size_mb': round(total_size / (1024 * 1024), 2),
            'upload_dates': sorted(dates, reverse=True)[:10],  # Last 10 days
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    logging.info("Sensor data upload server starting")
    logging.info("Upload folder: %s", os.path.abspath(UPLOAD_FOLDER))
    logging.info("Authentication: %s", "enabled" if AUTH_TOKEN else "disabled")
    logging.info("Max file size: %s MB", MAX_FILE_SIZE / (1024 * 1024))
    logging.info("Listening on http://0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=False)
