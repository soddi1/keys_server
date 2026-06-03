import subprocess
import sys
import os

def send_file_scp(local_file_path, remote_user, remote_host, remote_path):
    if not os.path.exists(local_file_path):
        print(f"Error: File not found at {local_file_path}")
        return

    print(f"Sending {local_file_path} to {remote_user}@{remote_host}:{remote_path}...")
    
    try:
        subprocess.run(
            ["scp", local_file_path, f"{remote_user}@{remote_host}:{remote_path}"],
            check=True,
            capture_output=True,
            text=True
        )
        print("File sent successfully!")
    except FileNotFoundError:
        print("Error: 'scp' command not found. Please ensure it's installed and in your system's PATH.")
    except subprocess.CalledProcessError as e:
        print(f"Error sending file: {e}")
        print(f"Stderr: {e.stderr}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python send_file.py <filename>")
        sys.exit(1)

    filename = sys.argv[1]
    
    # --- Configuration ---
    REMOTE_USER = "a4"
    REMOTE_HOST = "rocky"
    REMOTE_DEST_DIR = "/home/a4/workspace/hamza_workspace/Data/keys/data"
    LOCAL_DATA_DIR = "C:/Users/shham/OneDrive/Desktop/Keystroke-Collector/keystroke_collector/data"
    # ---------------------

    local_path = os.path.join(LOCAL_DATA_DIR, filename)
    
    send_file_scp(local_path, REMOTE_USER, REMOTE_HOST, REMOTE_DEST_DIR)
