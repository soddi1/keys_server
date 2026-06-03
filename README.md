# keys_server

Monorepo for keystroke collection (desktop) and sensor/mobile upload (Expo + Flask backend).

## Layout

| Directory | Purpose |
|-----------|---------|
| `keystroke_collector/` | PyQt5 desktop app to log keystrokes and export JSON |
| `sensor-app/` | Expo/React Native mobile app + `hpc-server/` Flask upload API |

## Setup

### Keystroke collector (Python)

```bash
cd keystroke_collector
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python keystroke_logger_space_anchor.py
```

Collected JSON is written under `keystroke_collector/data/` (not in git).

### Sensor app (Node + Python)

```bash
cd sensor-app
npm install
npx expo start
```

Flask server (HPC / local):

```bash
cd sensor-app
pip install -r requirements.txt
python hpc-server/python-flask/server.py
# or: python hpc-server/server_1.py  (requires segmentation_v2 module)
```

See `sensor-app/HPC_SETUP.md` and `sensor-app/QUICKSTART_HPC.md` for deployment notes.
