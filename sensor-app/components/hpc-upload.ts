/**
 * HPC File Upload Utility
 *
 * Simple file upload to your HPC server or any backend endpoint.
 * No OAuth complexity - just direct HTTP upload!
 */

import * as FileSystem from "expo-file-system/legacy";
import { Alert, Platform } from "react-native";

const HPC_CONFIG = {
  uploadUrl: "https://gabled-rodger-macropodous.ngrok-free.dev/api/upload",
  authToken: "",
  timeout: 300000,
};

/**
 * Upload a file to HPC server with user-defined filename and sensor type
 *
 * @param localFilePath - Full path to the file on the device
 * @param originalFileName - Original filename (will be used as default)
 * @param sensorType - Type of sensor: 'accelerometer', 'gyroscope', 'microphone', 'all'
 * @param metadata - Optional metadata to send with the file
 * @returns Promise with the server response
 */
export async function uploadToHPC(
  localFilePath: string,
  originalFileName: string,
  sensorType: "accelerometer" | "gyroscope" | "microphone" | "all" = "all",
  metadata?: Record<string, any>
): Promise<any> {
  if (Platform.OS === "android") {
    try {
      const result = await performUpload(
        localFilePath,
        originalFileName,
        sensorType,
        metadata
      );
      return result;
    } catch (error) {
      throw error;
    }
  }

  return new Promise((resolve, reject) => {
    Alert.prompt(
      "📝 Name Your File",
      `Enter a name for your ${sensorType} data file:`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => reject(new Error("Upload cancelled by user")),
        },
        {
          text: "Upload",
          onPress: async (customFileName?: string) => {
            try {
              const finalFileName = customFileName?.trim() || originalFileName;
              const fileExtension = originalFileName.split(".").pop() || "csv";
              const fileNameWithExt = finalFileName.includes(".")
                ? finalFileName
                : `${finalFileName}.${fileExtension}`;

              const result = await performUpload(
                localFilePath,
                fileNameWithExt,
                sensorType,
                metadata
              );
              resolve(result);
            } catch (error) {
              reject(error);
            }
          },
        },
      ],
      "plain-text",
      originalFileName.replace(/\.[^/.]+$/, "")
    );
  });
}

/**
 * Upload a file to HPC without showing any prompt/dialog. Used by the
 * remote-command flow where the filename is supplied by another device.
 */
export async function uploadToHPCSilent(
  localFilePath: string,
  fileName: string,
  sensorType: "accelerometer" | "gyroscope" | "microphone" | "all" = "all",
  metadata?: Record<string, any>
): Promise<any> {
  return performUpload(localFilePath, fileName, sensorType, metadata);
}

/**
 * Perform the actual upload after getting user input
 */
async function performUpload(
  localFilePath: string,
  fileName: string,
  sensorType: string,
  metadata?: Record<string, any>
): Promise<any> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(localFilePath);
    if (!fileInfo.exists) {
      throw new Error("File not found on device");
    }

    const uploadResult = await FileSystem.uploadAsync(
      HPC_CONFIG.uploadUrl,
      localFilePath,
      {
        fieldName: "file",
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        parameters: {
          filename: fileName,
          sensorType: sensorType,
          ...(metadata || {}),
        },
        headers: {
          ...(HPC_CONFIG.authToken
            ? { Authorization: `Bearer ${HPC_CONFIG.authToken}` }
            : {}),
        },
      }
    );

    if (uploadResult.status !== 200 && uploadResult.status !== 201) {
      console.error("❌ Upload failed:", {
        status: uploadResult.status,
        body: uploadResult.body,
      });
      throw new Error(`Upload failed with status ${uploadResult.status}`);
    }

    return JSON.parse(uploadResult.body);
  } catch (error: any) {
    console.error("❌ Upload error:", error);

    // Provide user-friendly error messages
    let errorMessage = error?.message || String(error);

    if (errorMessage.includes("Network request failed")) {
      errorMessage =
        "Network error. Check your internet connection and HPC server URL.";
    } else if (errorMessage.includes("File not found")) {
      errorMessage = "File not found on device. It may have been deleted.";
    } else if (errorMessage.includes("timeout")) {
      errorMessage =
        "Upload timeout. The file may be too large or network is slow.";
    }

    Alert.alert("❌ Upload Failed", errorMessage, [{ text: "OK" }]);
    throw error;
  }
}

/**
 * Update HPC server configuration
 * Call this at app startup or from settings
 */
export function configureHPC(config: {
  uploadUrl?: string;
  authToken?: string;
  timeout?: number;
}) {
  if (config.uploadUrl) {
    HPC_CONFIG.uploadUrl = config.uploadUrl;
  }
  if (config.authToken !== undefined) {
    HPC_CONFIG.authToken = config.authToken;
  }
  if (config.timeout) {
    HPC_CONFIG.timeout = config.timeout;
  }
}

/**
 * Get current HPC configuration
 */
export function getHPCConfig() {
  return {
    uploadUrl: HPC_CONFIG.uploadUrl,
    hasAuthToken: !!HPC_CONFIG.authToken,
    timeout: HPC_CONFIG.timeout,
  };
}
