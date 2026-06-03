import * as FileSystem from "expo-file-system/legacy";
import { Alert } from "react-native";
import JSZip from "jszip";

export interface RecordingData {
  id: string;
  name: string;
  type: "accelerometer" | "gyroscope" | "microphone" | "all";
  timestamp: number;
  filePaths: string[];
  fileNames: string[];
  rowCount?: number;
}

export interface ExistingFilePaths {
  csvFilePath?: string;
  wavFilePath?: string;
  meteringFilePath?: string;
  gyroCsvPath?: string;
  accelCsvPath?: string;
  micMeteringCsvPath?: string;
}

const RECORDINGS_DIR = FileSystem.documentDirectory + "Recordings/";
const RECORDINGS_INDEX_FILE = RECORDINGS_DIR + "index.json";

/** Matches expo-av output: iOS LinearPCM uses .wav, Android AAC uses .m4a */
export function getMicRecordingFileExtension(uri: string | undefined): string {
  if (!uri) return "wav";
  const base = uri.split("?")[0];
  const i = base.lastIndexOf(".");
  if (i === -1) return "wav";
  return base.slice(i + 1).toLowerCase();
}

const createZipFile = async (
  filePaths: string[],
  outputPath: string
): Promise<void> => {
  try {
    const zip = new JSZip();
    for (const filePath of filePaths) {
      try {
        const fileName = filePath.split("/").pop() || "unknown";
        const base64Content = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.Base64,
        });
        zip.file(fileName, base64Content as any, { base64: true });
      } catch (error) {
        console.warn(`Failed to read file ${filePath} for zipping:`, error);
      }
    }
    const zipContent = await zip.generateAsync({ type: "base64" });
    await FileSystem.writeAsStringAsync(outputPath, zipContent, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (error) {
    throw new Error(`Failed to create zip file: ${error}`);
  }
};

export const ensureRecordingsDirectory = async (): Promise<void> => {
  try {
    await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, {
      intermediates: true,
    });
  } catch (error) {
    // Directory might already exist
  }
};

export const loadRecordingsIndex = async (): Promise<RecordingData[]> => {
  try {
    await ensureRecordingsDirectory();
    const fileInfo = await FileSystem.getInfoAsync(RECORDINGS_INDEX_FILE);
    if (!fileInfo.exists) {
      return [];
    }
    const content = await FileSystem.readAsStringAsync(RECORDINGS_INDEX_FILE);
    return JSON.parse(content);
  } catch (error) {
    console.warn("Failed to load recordings index:", error);
    return [];
  }
};

export const saveRecordingsIndex = async (
  recordings: RecordingData[]
): Promise<void> => {
  try {
    await ensureRecordingsDirectory();
    await FileSystem.writeAsStringAsync(
      RECORDINGS_INDEX_FILE,
      JSON.stringify(recordings, null, 2)
    );
  } catch (error) {
    throw new Error(`Failed to save recordings index: ${error}`);
  }
};

const copyFileToRecordings = async (
  sourcePath: string,
  destName: string
): Promise<string | null> => {
  try {
    const info = await FileSystem.getInfoAsync(sourcePath);
    if (!info.exists) return null;
    const destPath = RECORDINGS_DIR + destName;
    await FileSystem.copyAsync({ from: sourcePath, to: destPath });
    return destPath;
  } catch (error) {
    console.warn(`Failed to copy file ${sourcePath}:`, error);
    return null;
  }
};

export const saveRecording = async (
  name: string,
  type: RecordingData["type"],
  data: any[],
  headers: string[],
  existingFiles?: ExistingFilePaths
): Promise<RecordingData> => {
  try {
    await ensureRecordingsDirectory();

    const timestamp = Date.now();
    const id = `${type}-${timestamp}`;
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_\s]/g, "");
    const ts = new Date(timestamp).toISOString().replace(/[:.]/g, "-");

    const filePaths: string[] = [];
    const fileNames: string[] = [];

    if (existingFiles) {
      // New path: files are already on disk, just copy them into recordings dir
      if (type === "all") {
        const tempFilePaths: string[] = [];

        if (existingFiles.gyroCsvPath) {
          const dest = await copyFileToRecordings(
            existingFiles.gyroCsvPath,
            `${sanitizedName}-gyro-${ts}.csv`
          );
          if (dest) tempFilePaths.push(dest);
        }

        if (existingFiles.accelCsvPath) {
          const dest = await copyFileToRecordings(
            existingFiles.accelCsvPath,
            `${sanitizedName}-accel-${ts}.csv`
          );
          if (dest) tempFilePaths.push(dest);
        }

        if (existingFiles.micMeteringCsvPath) {
          const dest = await copyFileToRecordings(
            existingFiles.micMeteringCsvPath,
            `${sanitizedName}-mic-metering-${ts}.csv`
          );
          if (dest) tempFilePaths.push(dest);
        }

        if (existingFiles.wavFilePath) {
          const micExt = getMicRecordingFileExtension(
            existingFiles.wavFilePath
          );
          const dest = await copyFileToRecordings(
            existingFiles.wavFilePath,
            `${sanitizedName}-mic-audio-${ts}.${micExt}`
          );
          if (dest) {
            filePaths.push(dest);
            fileNames.push(`${sanitizedName}-mic-audio-${ts}.${micExt}`);
          }
        }

        if (tempFilePaths.length > 0) {
          const zipPath = `${RECORDINGS_DIR}${sanitizedName}-all-sensors-${ts}.zip`;
          await createZipFile(tempFilePaths, zipPath);

          for (const tempPath of tempFilePaths) {
            try {
              await FileSystem.deleteAsync(tempPath);
            } catch (error) {
              console.warn(`Failed to delete temp file:`, error);
            }
          }

          filePaths.unshift(zipPath);
          fileNames.unshift(`${sanitizedName}-all-sensors-${ts}.zip`);
        }
      } else if (type === "microphone") {
        if (existingFiles.wavFilePath) {
          const micExt = getMicRecordingFileExtension(
            existingFiles.wavFilePath
          );
          const dest = await copyFileToRecordings(
            existingFiles.wavFilePath,
            `${sanitizedName}-mic-audio-${ts}.${micExt}`
          );
          if (dest) {
            filePaths.push(dest);
            fileNames.push(`${sanitizedName}-mic-audio-${ts}.${micExt}`);
          }
        }

        if (existingFiles.meteringFilePath) {
          const dest = await copyFileToRecordings(
            existingFiles.meteringFilePath,
            `${sanitizedName}-mic-metering-${ts}.csv`
          );
          if (dest) {
            filePaths.push(dest);
            fileNames.push(`${sanitizedName}-mic-metering-${ts}.csv`);
          }
        }
      } else {
        // accelerometer or gyroscope with pre-written CSV
        if (existingFiles.csvFilePath) {
          const ext = type === "accelerometer" ? "accel" : "gyro";
          const dest = await copyFileToRecordings(
            existingFiles.csvFilePath,
            `${sanitizedName}-${ext}-${ts}.csv`
          );
          if (dest) {
            filePaths.push(dest);
            fileNames.push(`${sanitizedName}-${ext}-${ts}.csv`);
          }
        }
      }
    } else if (data.length > 0) {
      // Legacy path: build CSV from in-memory data arrays
      if (type === "all") {
        const { gyroData, accelData, micData } = data[0] || {};
        const tempFilePaths: string[] = [];

        if (gyroData && gyroData.length > 0) {
          const gyroCSV = `${
            headers[0] || "t_ms,x_rad_s,y_rad_s,z_rad_s"
          }\n${gyroData
            .map((r: any) => `${r.t},${r.x},${r.y},${r.z}`)
            .join("\n")}`;
          const gyroPath = `${RECORDINGS_DIR}${sanitizedName}-gyro-${ts}.csv`;
          await FileSystem.writeAsStringAsync(gyroPath, gyroCSV);
          tempFilePaths.push(gyroPath);
        }

        if (accelData && accelData.length > 0) {
          const accelCSV = `${headers[1] || "t_ms,x_g,y_g,z_g"}\n${accelData
            .map((r: any) => `${r.t},${r.x},${r.y},${r.z}`)
            .join("\n")}`;
          const accelPath = `${RECORDINGS_DIR}${sanitizedName}-accel-${ts}.csv`;
          await FileSystem.writeAsStringAsync(accelPath, accelCSV);
          tempFilePaths.push(accelPath);
        }

        if (micData && micData.length > 0) {
          const micCSV = `${headers[2] || "t_ms,amplitude_dbfs"}\n${micData
            .map((r: any) => `${r.t},${r.amplitude}`)
            .join("\n")}`;
          const micPath = `${RECORDINGS_DIR}${sanitizedName}-mic-${ts}.csv`;
          await FileSystem.writeAsStringAsync(micPath, micCSV);
          tempFilePaths.push(micPath);
        }

        if (tempFilePaths.length > 0) {
          const zipPath = `${RECORDINGS_DIR}${sanitizedName}-all-sensors-${ts}.zip`;
          await createZipFile(tempFilePaths, zipPath);
          for (const tempPath of tempFilePaths) {
            try {
              await FileSystem.deleteAsync(tempPath);
            } catch (error) {
              console.warn(`Failed to delete temp file ${tempPath}:`, error);
            }
          }
          filePaths.push(zipPath);
          fileNames.push(`${sanitizedName}-all-sensors-${ts}.zip`);
        }
      } else {
        const header = headers[0] || "t_ms,value";
        let csv: string;

        if (type === "accelerometer" || type === "gyroscope") {
          csv = `${header}\n${data
            .map((r: any) => `${r.t},${r.x},${r.y},${r.z}`)
            .join("\n")}`;
        } else if (type === "microphone") {
          csv = `${header}\n${data
            .map((r: any) => `${r.t},${r.amplitude}`)
            .join("\n")}`;
        } else {
          csv = `${header}\n${data
            .map((r: any) => Object.values(r).join(","))
            .join("\n")}`;
        }

        const filePath = `${RECORDINGS_DIR}${sanitizedName}-${type}-${ts}.csv`;
        await FileSystem.writeAsStringAsync(filePath, csv);
        filePaths.push(filePath);
        fileNames.push(`${sanitizedName}-${type}-${ts}.csv`);
      }
    }

    const recording: RecordingData = {
      id,
      name: sanitizedName,
      type,
      timestamp,
      filePaths,
      fileNames,
      rowCount: Array.isArray(data) ? data.length : 0,
    };

    const recordings = await loadRecordingsIndex();
    recordings.push(recording);
    await saveRecordingsIndex(recordings);

    return recording;
  } catch (error) {
    throw new Error(`Failed to save recording: ${error}`);
  }
};

export const deleteRecording = async (id: string): Promise<void> => {
  try {
    const recordings = await loadRecordingsIndex();
    const recordingIndex = recordings.findIndex((r) => r.id === id);

    if (recordingIndex === -1) {
      throw new Error("Recording not found");
    }

    const recording = recordings[recordingIndex];

    for (const filePath of recording.filePaths) {
      try {
        await FileSystem.deleteAsync(filePath);
      } catch (error) {
        console.warn(`Failed to delete file ${filePath}:`, error);
      }
    }

    recordings.splice(recordingIndex, 1);
    await saveRecordingsIndex(recordings);
  } catch (error) {
    throw new Error(`Failed to delete recording: ${error}`);
  }
};

export const shareRecording = async (
  recording: RecordingData
): Promise<void> => {
  try {
    const Sharing = await import("expo-sharing");

    if (recording.filePaths.length === 1) {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(recording.filePaths[0]);
      } else {
        Alert.alert(
          "Sharing not available",
          "Sharing is not supported on this device"
        );
      }
    } else if (recording.filePaths.length > 1) {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(recording.filePaths[0]);
        Alert.alert(
          "Multiple files",
          `This recording has ${recording.filePaths.length} files. Only the first one was shared.`
        );
      } else {
        Alert.alert(
          "Sharing not available",
          "Sharing is not supported on this device"
        );
      }
    }
  } catch (error) {
    throw new Error(`Failed to share recording: ${error}`);
  }
};

export const getRecordingDetails = async (
  recording: RecordingData
): Promise<string> => {
  try {
    let details = `Name: ${recording.name}\n`;
    details += `Type: ${recording.type}\n`;
    details += `Date: ${new Date(recording.timestamp).toLocaleString()}\n`;
    details += `Files: ${recording.fileNames.length}\n`;

    if (recording.rowCount !== undefined) {
      details += `Data points: ${recording.rowCount}\n`;
    }

    details += `\nFile names:\n`;
    recording.fileNames.forEach((name) => {
      details += `- ${name}\n`;
    });

    return details;
  } catch (error) {
    return `Error loading details: ${error}`;
  }
};
