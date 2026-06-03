"""Flask server for mobile sensor uploads with optional auto-segmentation."""

from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
from datetime import datetime
import logging
import zipfile
import sys
import threading
import shutil

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segmentation_v2 import KeystrokeSegmenterV2, save_segments_to_npz

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(BASE_DIR), 'Data')
RECORDINGS_FOLDER = os.path.join(DATA_DIR, 'Recordings')
TIMESTAMPS_FOLDER = os.path.join(DATA_DIR, 'timestamps')
SEGMENTS_FOLDER = os.path.join(DATA_DIR, 'Segments')
ALLOWED_EXTENSIONS = {'csv', 'zip', 'txt', 'json', 'mp3', 'wav', 'm4a'}
MAX_FILE_SIZE = 100 * 1024 * 1024

AUTH_TOKEN = None

_cmd_lock = threading.Lock()
_cmd_state = {
    "id": 0,
    "action": "none",
    "filename": "",
    "phone_ack_id": 0,
    "phone_ack_action": "",
}

AUTO_SEGMENT = True
WINDOW_SIZE_MS = 300

app = Flask(__name__)
CORS(app)
app.config['UPLOAD_FOLDER'] = RECORDINGS_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('upload.log'),
        logging.StreamHandler()
    ]
)

os.makedirs(RECORDINGS_FOLDER, exist_ok=True)
os.makedirs(TIMESTAMPS_FOLDER, exist_ok=True)
os.makedirs(SEGMENTS_FOLDER, exist_ok=True)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def unzip_sensor_data(zip_path, extract_to):
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_to)
        logging.info(f"Unzipped: {zip_path} -> {extract_to}")
        return extract_to
    except Exception as e:
        logging.error(f"Failed to unzip {zip_path}: {e}")
        raise


def find_sensor_and_json_files(directory):
    """Return (sensor_dir, json_path) for accel CSVs and keystroke JSON."""
    sensor_dir = None
    json_path = None

    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.json') and 'keystroke' in file.lower():
                json_path = os.path.join(root, file)
            elif file.startswith('all-accel-') and file.endswith('.csv'):
                sensor_dir = root

    return sensor_dir, json_path


def segment_uploaded_data(sensor_dir, json_path, output_folder):
    """Segment uploaded sensor data; return (output_path, num_keystrokes)."""
    try:
        logging.info("Starting segmentation...")

        segmenter = KeystrokeSegmenterV2(half_window_ms=WINDOW_SIZE_MS // 2)
        segmenter.load_data(sensor_dir, json_path, verbose=False)
        logging.info(f"Loaded data: {len(segmenter.events_df)} keystrokes")

        segments = segmenter.segment_all_keystrokes(verbose=False)
        logging.info(f"Segmented {len(segments)} keystrokes")

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_filename = f"keystroke_segments_{timestamp}.npz"
        output_path = os.path.join(output_folder, output_filename)

        save_segments_to_npz(segments, output_path, compress=True)
        logging.info(f"Saved segmented data to: {output_path}")

        return output_path, len(segments)

    except Exception as e:
        logging.error(f"Segmentation failed: {e}")
        raise


@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Accept multipart upload; auto-segment zip files when AUTO_SEGMENT is enabled."""
    try:
        if AUTH_TOKEN:
            auth_header = request.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '')
            if token != AUTH_TOKEN:
                logging.warning("Unauthorized upload attempt")
                return jsonify({'error': 'Unauthorized'}), 401

        if 'file' not in request.files:
            logging.error("No file in request")
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']

        if file.filename == '':
            logging.error("Empty filename")
            return jsonify({'error': 'No file selected'}), 400

        custom_filename = request.form.get('filename', file.filename)
        sensor_type = request.form.get('sensorType', 'all')
        filename = secure_filename(custom_filename)

        if not allowed_file(filename):
            logging.error(f"Invalid file type: {filename}")
            return jsonify({'error': 'File type not allowed'}), 400

        if filename.lower().endswith('.json'):
            dest_folder = TIMESTAMPS_FOLDER
        else:
            dest_folder = os.path.join(RECORDINGS_FOLDER, sensor_type)
        os.makedirs(dest_folder, exist_ok=True)

        filepath = os.path.join(dest_folder, filename)
        file.save(filepath)

        file_size = os.path.getsize(filepath)
        file_size_mb = file_size / (1024 * 1024)

        logging.info(f"File uploaded: {filename} ({file_size_mb:.2f} MB) -> {dest_folder}")

        response_data = {
            'success': True,
            'filename': filename,
            'size': file_size,
            'size_mb': round(file_size_mb, 2),
            'path': filepath,
            'sensor_type': sensor_type,
            'message': f'File uploaded successfully to {dest_folder}'
        }

        if AUTO_SEGMENT and filename.lower().endswith('.zip'):
            try:
                logging.info(f"Auto-segmentation enabled for {filename}")

                extract_folder = os.path.join(
                    dest_folder, filename.replace('.zip', '_extracted')
                )
                unzip_sensor_data(filepath, extract_folder)

                sensor_dir, json_path = find_sensor_and_json_files(extract_folder)

                if json_path:
                    os.makedirs(TIMESTAMPS_FOLDER, exist_ok=True)
                    json_dest = os.path.join(TIMESTAMPS_FOLDER, os.path.basename(json_path))
                    shutil.copy2(json_path, json_dest)
                    json_path = json_dest

                if sensor_dir and json_path:
                    segmented_path, num_keystrokes = segment_uploaded_data(
                        sensor_dir, json_path, SEGMENTS_FOLDER
                    )

                    response_data['segmentation'] = {
                        'success': True,
                        'segmented_file': segmented_path,
                        'num_keystrokes': num_keystrokes,
                        'window_size_ms': WINDOW_SIZE_MS
                    }
                    response_data['message'] += f' | Segmented {num_keystrokes} keystrokes'
                    logging.info(f"Segmentation complete: {num_keystrokes} keystrokes")
                else:
                    error_msg = "Could not find sensor files or JSON in uploaded zip"
                    logging.warning(error_msg)
                    response_data['segmentation'] = {
                        'success': False,
                        'error': error_msg
                    }

            except Exception as e:
                error_msg = f"Segmentation failed: {str(e)}"
                logging.error(error_msg)
                response_data['segmentation'] = {
                    'success': False,
                    'error': error_msg
                }

        return jsonify(response_data), 200

    except Exception as e:
        logging.error(f"Upload error: {str(e)}")
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'service': 'Sensor Data Upload Server',
        'timestamp': datetime.now().isoformat()
    }), 200


@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        total_files = 0
        total_size = 0
        folder_stats = {}

        for folder_name, folder_path in (
            ('recordings', RECORDINGS_FOLDER),
            ('timestamps', TIMESTAMPS_FOLDER),
            ('segments', SEGMENTS_FOLDER),
        ):
            for root, dirs, files in os.walk(folder_path):
                category = os.path.basename(root) if root != folder_path else folder_name

                for file in files:
                    if allowed_file(file) or file.endswith('.npz'):
                        filepath = os.path.join(root, file)
                        total_files += 1
                        file_size = os.path.getsize(filepath)
                        total_size += file_size

                        stat_key = f"{folder_name}/{category}"
                        if stat_key not in folder_stats:
                            folder_stats[stat_key] = {'files': 0, 'size_mb': 0}
                        folder_stats[stat_key]['files'] += 1
                        folder_stats[stat_key]['size_mb'] += file_size / (1024 * 1024)

        return jsonify({
            'total_files': total_files,
            'total_size_mb': round(total_size / (1024 * 1024), 2),
            'folder_stats': {
                k: {'files': v['files'], 'size_mb': round(v['size_mb'], 2)}
                for k, v in folder_stats.items()
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/command', methods=['POST'])
def post_command():
    """Queue a remote command for the phone. Body: {"action","filename"}."""
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
    with _cmd_lock:
        current = dict(_cmd_state)
    return jsonify(current), 200


@app.route('/api/ack', methods=['POST'])
def ack_command():
    """Phone confirms after acting. Body: {"id": <int>}."""
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
    """Keystroke collector polls after /api/command to detect phone ack."""
    with _cmd_lock:
        current = dict(_cmd_state)
    return jsonify({
        'pending_id': current['id'],
        'pending_action': current['action'],
        'phone_ack_id': current.get('phone_ack_id', 0),
        'phone_ack_action': current.get('phone_ack_action', ''),
    }), 200


if __name__ == '__main__':
    logging.info(
        "Starting server on http://0.0.0.0:5000 | recordings=%s | timestamps=%s | "
        "segments=%s | auto_segment=%s | window=%sms | auth=%s",
        os.path.abspath(RECORDINGS_FOLDER),
        os.path.abspath(TIMESTAMPS_FOLDER),
        os.path.abspath(SEGMENTS_FOLDER),
        AUTO_SEGMENT,
        WINDOW_SIZE_MS,
        bool(AUTH_TOKEN),
    )
    app.run(host='0.0.0.0', port=5000, debug=False)
