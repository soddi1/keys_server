import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  Alert,
  TextInput,
  SafeAreaView,
  FlatList,
  Modal,
  Keyboard,
} from "react-native";
import { Gyroscope } from "expo-sensors";
import { Accelerometer } from "expo-sensors";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { uploadToHPC, uploadToHPCSilent } from "@/components/hpc-upload";
import {
  saveRecording,
  getMicRecordingFileExtension,
} from "../../utils/recordings-storage";
import JSZip from "jszip";

const FLUSH_INTERVAL = 5000;
const DISPLAY_BUFFER_SIZE = 100;

const COMMAND_SERVER_URL = "https://gabled-rodger-macropodous.ngrok-free.dev";
const COMMAND_POLL_INTERVAL_MS = 500;

const createZipDataFile = async (
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

const appendToFile = async (filePath: string, content: string) => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (fileInfo.exists) {
      const existing = await FileSystem.readAsStringAsync(filePath);
      await FileSystem.writeAsStringAsync(filePath, existing + content);
    } else {
      await FileSystem.writeAsStringAsync(filePath, content);
    }
  } catch (e) {
    console.warn("Failed to append to file:", e);
  }
};

export default function AllSensorsScreen() {
  const [gyroAvailable, setGyroAvailable] = useState<boolean | null>(null);
  const [accelAvailable, setAccelAvailable] = useState<boolean | null>(null);
  const [micAvailable, setMicAvailable] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const [gyroSamplingRate, setGyroSamplingRate] = useState(20);
  const [gyroSamplingText, setGyroSamplingText] = useState("20");
  const [gyroUseMaxRate, setGyroUseMaxRate] = useState(false);
  const [gyroActualRate, setGyroActualRate] = useState<number | null>(null);
  const [accelSamplingRate, setAccelSamplingRate] = useState(20);
  const [accelSamplingText, setAccelSamplingText] = useState("20");
  const [accelUseMaxRate, setAccelUseMaxRate] = useState(false);
  const [accelActualRate, setAccelActualRate] = useState<number | null>(null);
  const [micSampleRate, setMicSampleRate] = useState(16000);
  const [micSampleRateText, setMicSampleRateText] = useState("16000");

  const [gyroTotal, setGyroTotal] = useState(0);
  const [accelTotal, setAccelTotal] = useState(0);
  const [micTotal, setMicTotal] = useState(0);

  const [logRows, setLogRows] = useState<
    Array<{ t: number; type: string; message: string }>
  >([]);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [recordingName, setRecordingName] = useState("");
  const [showHPCDialog, setShowHPCDialog] = useState(false);
  const [hpcFileName, setHPCFileName] = useState("");
  const [pendingUploadPath, setPendingUploadPath] = useState("");

  const gyroSubscription = useRef<any>(null);
  const accelSubscription = useRef<any>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const micTimerId = useRef<any>(null);
  const logTimerId = useRef<any>(null);
  const startTimeRef = useRef<number>(0);

  const gyroSampleCountRef = useRef(0);
  const gyroRateUpdateRef = useRef<number | null>(null);
  const accelSampleCountRef = useRef(0);
  const accelRateUpdateRef = useRef<number | null>(null);
  const micSampleCountRef = useRef(0);
  const micRateUpdateRef = useRef<number | null>(null);

  const gyroCsvRef = useRef<string | null>(null);
  const accelCsvRef = useRef<string | null>(null);
  const micMeteringCsvRef = useRef<string | null>(null);
  const wavUriRef = useRef<string | null>(null);

  const gyroBufferRef = useRef<Array<{ t: number; x: number; y: number; z: number }>>([]);
  const accelBufferRef = useRef<Array<{ t: number; x: number; y: number; z: number }>>([]);
  const micBufferRef = useRef<Array<{ t: number; amplitude: number }>>([]);

  const gyroTotalRef = useRef(0);
  const accelTotalRef = useRef(0);
  const micTotalRef = useRef(0);

  const gyroHeaderWrittenRef = useRef(false);
  const accelHeaderWrittenRef = useRef(false);
  const micHeaderWrittenRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const lastAckedCmdIdRef = useRef(0);
  const cmdInFlightRef = useRef(false);
  const isRecordingRef = useRef(false);
  const gyroAvailableRef = useRef<boolean | null>(null);
  const accelAvailableRef = useRef<boolean | null>(null);
  const micAvailableRef = useRef<boolean | null>(null);
  const startAllSensorsHandlerRef = useRef<
    (opts?: { forceMaxRate?: boolean }) => Promise<void>
  >(async () => {});
  const stopAllSensorsHandlerRef = useRef<() => Promise<void>>(async () => {});
  const resetSessionDataHandlerRef = useRef<
    (opts?: { keepLog?: boolean }) => void
  >(() => {});
  const stopAndUploadHandlerRef = useRef<(filename: string) => Promise<void>>(
    async () => {}
  );

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    gyroAvailableRef.current = gyroAvailable;
  }, [gyroAvailable]);

  useEffect(() => {
    accelAvailableRef.current = accelAvailable;
  }, [accelAvailable]);

  useEffect(() => {
    micAvailableRef.current = micAvailable;
  }, [micAvailable]);

  useEffect(() => {
    if (gyroAvailable) {
      if (gyroUseMaxRate) {
        Gyroscope.setUpdateInterval(1);
      } else if (!isRecording) {
        Gyroscope.setUpdateInterval(Math.round(1000 / gyroSamplingRate));
      }
    }
  }, [gyroSamplingRate, gyroUseMaxRate, gyroAvailable, isRecording]);

  useEffect(() => {
    if (accelAvailable) {
      if (accelUseMaxRate) {
        Accelerometer.setUpdateInterval(1);
      } else if (!isRecording) {
        Accelerometer.setUpdateInterval(Math.round(1000 / accelSamplingRate));
      }
    }
  }, [accelSamplingRate, accelUseMaxRate, accelAvailable, isRecording]);

  useEffect(() => {
    Gyroscope.isAvailableAsync().then(setGyroAvailable);
    Accelerometer.isAvailableAsync().then(setAccelAvailable);
    Audio.requestPermissionsAsync().then((result) => {
      setMicAvailable(result.granted);
    });

    return () => {
      stopAllSensors();
    };
  }, []);

  const addLogMessage = (type: string, message: string) => {
    const now = Date.now();
    setLogRows((prev) => [...prev, { t: now, type, message }]);
  };

  const flushAllBuffers = async () => {
    if (gyroBufferRef.current.length > 0 && gyroCsvRef.current) {
      const rows = gyroBufferRef.current;
      gyroBufferRef.current = [];
      let content = "";
      if (!gyroHeaderWrittenRef.current) {
        content = "t_ms,x_rad_s,y_rad_s,z_rad_s\n";
        gyroHeaderWrittenRef.current = true;
      }
      content += rows.map((r) => `${r.t},${r.x},${r.y},${r.z}`).join("\n") + "\n";
      await appendToFile(gyroCsvRef.current, content);
    }

    if (accelBufferRef.current.length > 0 && accelCsvRef.current) {
      const rows = accelBufferRef.current;
      accelBufferRef.current = [];
      let content = "";
      if (!accelHeaderWrittenRef.current) {
        content = "t_ms,x_g,y_g,z_g\n";
        accelHeaderWrittenRef.current = true;
      }
      content += rows.map((r) => `${r.t},${r.x},${r.y},${r.z}`).join("\n") + "\n";
      await appendToFile(accelCsvRef.current, content);
    }

    if (micBufferRef.current.length > 0 && micMeteringCsvRef.current) {
      const rows = micBufferRef.current;
      micBufferRef.current = [];
      let content = "";
      if (!micHeaderWrittenRef.current) {
        content = "t_ms,amplitude_dbfs\n";
        micHeaderWrittenRef.current = true;
      }
      content += rows.map((r) => `${r.t},${r.amplitude}`).join("\n") + "\n";
      await appendToFile(micMeteringCsvRef.current, content);
    }
  };

  const startAllSensors = async (options?: { forceMaxRate?: boolean }) => {
    if (isRecordingRef.current) return;

    const forceMaxRate = options?.forceMaxRate === true;
    if (forceMaxRate) {
      setGyroUseMaxRate(true);
      setAccelUseMaxRate(true);
    }
    const useMaxGyro = forceMaxRate || gyroUseMaxRate;
    const useMaxAccel = forceMaxRate || accelUseMaxRate;

    if (gyroSubscription.current) {
      gyroSubscription.current.remove();
      gyroSubscription.current = null;
    }
    if (accelSubscription.current) {
      accelSubscription.current.remove();
      accelSubscription.current = null;
    }
    if (micTimerId.current) {
      clearInterval(micTimerId.current);
      micTimerId.current = null;
    }
    if (logTimerId.current) {
      clearInterval(logTimerId.current);
      logTimerId.current = null;
    }
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    addLogMessage("INFO", "Preparing all sensors...");
    setIsRecording(true);
    isRecordingRef.current = true;

    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const dir = FileSystem.documentDirectory + "AllSensors/";
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

      gyroCsvRef.current = `${dir}all-gyro-${ts}.csv`;
      accelCsvRef.current = `${dir}all-accel-${ts}.csv`;
      micMeteringCsvRef.current = `${dir}all-mic-metering-${ts}.csv`;

      gyroBufferRef.current = [];
      accelBufferRef.current = [];
      micBufferRef.current = [];
      gyroTotalRef.current = 0;
      accelTotalRef.current = 0;
      micTotalRef.current = 0;
      gyroHeaderWrittenRef.current = false;
      accelHeaderWrittenRef.current = false;
      micHeaderWrittenRef.current = false;
      setGyroTotal(0);
      setAccelTotal(0);
      setMicTotal(0);

      let preparedRecording: Audio.Recording | null = null;
      const micOk = micAvailableRef.current ?? micAvailable;
      if (micOk) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        preparedRecording = new Audio.Recording();
        const opts = {
          isMeteringEnabled: true,
          android: {
            extension: ".m4a",
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: micSampleRate,
            numberOfChannels: 1,
            bitRate: 256000,
          },
          ios: {
            extension: ".wav",
            outputFormat: Audio.IOSOutputFormat.LINEARPCM,
            audioQuality: Audio.IOSAudioQuality.MAX,
            sampleRate: micSampleRate,
            numberOfChannels: 1,
            bitRate: micSampleRate * 16,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
        };
        await preparedRecording.prepareToRecordAsync(opts);
        addLogMessage(
          "INFO",
          `Microphone prepared (${Platform.OS === "ios" ? "WAV PCM" : "AAC M4A"} @ ${micSampleRate} Hz)`
        );
      }

      const gyroOk = gyroAvailableRef.current ?? gyroAvailable;
      const accelOk = accelAvailableRef.current ?? accelAvailable;

      if (gyroOk) {
        const gyroIntervalMs = useMaxGyro
          ? 1
          : Math.round(1000 / gyroSamplingRate);
        Gyroscope.setUpdateInterval(gyroIntervalMs);
        addLogMessage(
          "INFO",
          useMaxGyro
            ? "Gyroscope configured (MAX rate)"
            : "Gyroscope configured"
        );
      }

      if (accelOk) {
        const accelIntervalMs = useMaxAccel
          ? 1
          : Math.round(1000 / accelSamplingRate);
        Accelerometer.setUpdateInterval(accelIntervalMs);
        addLogMessage(
          "INFO",
          useMaxAccel
            ? "Accelerometer configured (MAX rate)"
            : "Accelerometer configured"
        );
      }

      const startTime = Date.now();
      startTimeRef.current = startTime;
      gyroSampleCountRef.current = 0;
      gyroRateUpdateRef.current = startTime;
      accelSampleCountRef.current = 0;
      accelRateUpdateRef.current = startTime;
      micSampleCountRef.current = 0;
      micRateUpdateRef.current = startTime;
      addLogMessage("INFO", "Starting all sensors NOW...");

      if (gyroOk) {
        gyroSubscription.current = Gyroscope.addListener((data) => {
          const now = Date.now();
          const t = now - startTime;
          const row = { t, x: data.x, y: data.y, z: data.z };
          gyroBufferRef.current.push(row);
          gyroTotalRef.current++;
          setGyroTotal(gyroTotalRef.current);

          gyroSampleCountRef.current++;
          if (
            gyroRateUpdateRef.current &&
            now - gyroRateUpdateRef.current >= 1000
          ) {
            const elapsed = (now - gyroRateUpdateRef.current) / 1000;
            const measuredRate = gyroSampleCountRef.current / elapsed;
            setGyroActualRate(Math.round(measuredRate * 10) / 10);
            gyroSampleCountRef.current = 0;
            gyroRateUpdateRef.current = now;
          }
        });
      }

      if (accelOk) {
        accelSubscription.current = Accelerometer.addListener((data) => {
          const now = Date.now();
          const t = now - startTime;
          const row = { t, x: data.x, y: data.y, z: data.z };
          accelBufferRef.current.push(row);
          accelTotalRef.current++;
          setAccelTotal(accelTotalRef.current);

          accelSampleCountRef.current++;
          if (
            accelRateUpdateRef.current &&
            now - accelRateUpdateRef.current >= 1000
          ) {
            const elapsed = (now - accelRateUpdateRef.current) / 1000;
            const measuredRate = accelSampleCountRef.current / elapsed;
            setAccelActualRate(Math.round(measuredRate * 10) / 10);
            accelSampleCountRef.current = 0;
            accelRateUpdateRef.current = now;
          }
        });
      }

      if (micOk && preparedRecording) {
        await preparedRecording.startAsync();
        recordingRef.current = preparedRecording;
        wavUriRef.current = null;

        const pollMic = async () => {
          if (recordingRef.current) {
            try {
              const status = await recordingRef.current.getStatusAsync();
              if (status.isRecording) {
                const now = Date.now();
                const t = now - startTime;
                const amp =
                  typeof status.metering === "number" ? status.metering : -160;

                micBufferRef.current.push({ t, amplitude: amp });
                micTotalRef.current++;
                setMicTotal(micTotalRef.current);

                micSampleCountRef.current++;
                if (
                  micRateUpdateRef.current &&
                  now - micRateUpdateRef.current >= 1000
                ) {
                  const elapsed = (now - micRateUpdateRef.current) / 1000;
                  const measuredRate = micSampleCountRef.current / elapsed;
                  setMicTotal(micTotalRef.current);
                  micSampleCountRef.current = 0;
                  micRateUpdateRef.current = now;
                }
              }
            } catch {
              // Metering errors are non-fatal; skip this tick.
            }
          }
        };

        micTimerId.current = setInterval(pollMic, 100);
      }

      // Re-apply MAX after listeners (some devices reset interval on subscribe).
      if (gyroOk && useMaxGyro) {
        Gyroscope.setUpdateInterval(1);
      }
      if (accelOk && useMaxAccel) {
        Accelerometer.setUpdateInterval(1);
      }

      flushTimerRef.current = setInterval(flushAllBuffers, FLUSH_INTERVAL);

      const logInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        addLogMessage("STATUS", `All sensors running - ${elapsed}s elapsed`);
      }, 10000);

      logTimerId.current = logInterval;
    } catch (error: any) {
      addLogMessage("ERROR", `Failed to start sensors: ${error.message}`);
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  const stopAllSensors = async () => {
    if (!isRecordingRef.current) return;

    addLogMessage("INFO", "Stopping all sensors...");

    if (gyroSubscription.current) {
      gyroSubscription.current.remove();
      gyroSubscription.current = null;
    }

    if (accelSubscription.current) {
      accelSubscription.current.remove();
      accelSubscription.current = null;
    }

    if (recordingRef.current) {
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording) {
          await recordingRef.current.stopAndUnloadAsync();
        }
        wavUriRef.current = recordingRef.current.getURI();
        recordingRef.current = null;
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    if (micTimerId.current) {
      clearInterval(micTimerId.current);
      micTimerId.current = null;
    }

    if (logTimerId.current) {
      clearInterval(logTimerId.current);
      logTimerId.current = null;
    }

    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    await flushAllBuffers();

    setIsRecording(false);
    isRecordingRef.current = false;
    setGyroActualRate(null);
    setAccelActualRate(null);
    addLogMessage("INFO", "All sensors stopped");
  };

  const resetSessionData = (options?: { keepLog?: boolean }) => {
    gyroBufferRef.current = [];
    accelBufferRef.current = [];
    micBufferRef.current = [];
    gyroTotalRef.current = 0;
    accelTotalRef.current = 0;
    micTotalRef.current = 0;
    gyroHeaderWrittenRef.current = false;
    accelHeaderWrittenRef.current = false;
    micHeaderWrittenRef.current = false;
    setGyroTotal(0);
    setAccelTotal(0);
    setMicTotal(0);
    setGyroActualRate(null);
    setAccelActualRate(null);
    gyroCsvRef.current = null;
    accelCsvRef.current = null;
    micMeteringCsvRef.current = null;
    wavUriRef.current = null;
    if (!options?.keepLog) {
      setLogRows([]);
    }
    addLogMessage("INFO", "Session data cleared");
  };

  const clearAllData = () => {
    resetSessionData();
  };

  const exportAllData = async () => {
    try {
      const dir = FileSystem.documentDirectory + "AllSensors/";
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");

      const filesToZip: string[] = [];

      if (gyroCsvRef.current) {
        const info = await FileSystem.getInfoAsync(gyroCsvRef.current);
        if (info.exists) filesToZip.push(gyroCsvRef.current);
      }

      if (accelCsvRef.current) {
        const info = await FileSystem.getInfoAsync(accelCsvRef.current);
        if (info.exists) filesToZip.push(accelCsvRef.current);
      }

      if (micMeteringCsvRef.current) {
        const info = await FileSystem.getInfoAsync(micMeteringCsvRef.current);
        if (info.exists) filesToZip.push(micMeteringCsvRef.current);
      }

      if (wavUriRef.current) {
        const wavInfo = await FileSystem.getInfoAsync(wavUriRef.current);
        if (wavInfo.exists) {
          const micExt = getMicRecordingFileExtension(wavUriRef.current);
          const audioDest = `${dir}mic-audio-${ts}.${micExt}`;
          await FileSystem.copyAsync({
            from: wavUriRef.current,
            to: audioDest,
          });
          filesToZip.push(audioDest);
        }
      }

      if (filesToZip.length === 0) {
        Alert.alert("No data", "No sensor data files to export.");
        return;
      }

      const summaryLines = [
        "sensor,total_samples",
        `gyroscope,${gyroTotalRef.current}`,
        `accelerometer,${accelTotalRef.current}`,
        `microphone_metering,${micTotalRef.current}`,
        wavUriRef.current
          ? `microphone_audio,${Platform.OS === "ios" ? "WAV_PCM" : "AAC_M4A"}_${micSampleRate}Hz`
          : null,
      ]
        .filter(Boolean)
        .join("\n");

      const summaryPath = `${dir}all-sensors-summary-${ts}.csv`;
      await FileSystem.writeAsStringAsync(summaryPath, summaryLines);
      filesToZip.push(summaryPath);

      const zipPath = `${dir}all-sensors-export-${ts}.zip`;
      await createZipDataFile(filesToZip, zipPath);

      try {
        if (Platform.OS === "android") {
          const defaultName = `all-sensors-export-${ts}`;
          setPendingUploadPath(zipPath);
          setHPCFileName(defaultName);
          setShowHPCDialog(true);
        } else {
          await uploadToHPC(zipPath, `all-sensors-export-${ts}.zip`, "all");
        }
      } catch (e) {
        console.warn("Failed to upload to HPC server:", e);
      }

      Alert.alert("Export complete", `${filesToZip.length} files zipped.`);
      addLogMessage(
        "INFO",
        `Exported ${filesToZip.length} files in zip format`
      );
    } catch (e: any) {
      Alert.alert("Export failed", String(e?.message ?? e));
      addLogMessage("ERROR", `Export failed: ${e?.message ?? e}`);
    }
  };

  const stopAndUploadWithName = async (filename: string) => {
    const safeName = (filename || "remote-recording").trim() || "remote-recording";
    try {
      if (isRecordingRef.current) {
        await stopAllSensors();
      }

      const dir = FileSystem.documentDirectory + "AllSensors/";
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");

      const filesToZip: string[] = [];

      if (gyroCsvRef.current) {
        const info = await FileSystem.getInfoAsync(gyroCsvRef.current);
        if (info.exists) filesToZip.push(gyroCsvRef.current);
      }

      if (accelCsvRef.current) {
        const info = await FileSystem.getInfoAsync(accelCsvRef.current);
        if (info.exists) filesToZip.push(accelCsvRef.current);
      }

      if (micMeteringCsvRef.current) {
        const info = await FileSystem.getInfoAsync(micMeteringCsvRef.current);
        if (info.exists) filesToZip.push(micMeteringCsvRef.current);
      }

      if (wavUriRef.current) {
        const wavInfo = await FileSystem.getInfoAsync(wavUriRef.current);
        if (wavInfo.exists) {
          const micExt = getMicRecordingFileExtension(wavUriRef.current);
          const audioDest = `${dir}mic-audio-${ts}.${micExt}`;
          await FileSystem.copyAsync({
            from: wavUriRef.current,
            to: audioDest,
          });
          filesToZip.push(audioDest);
        }
      }

      if (filesToZip.length === 0) {
        addLogMessage(
          "WARN",
          `Remote stop received for "${safeName}" but no data files found; skipping upload.`
        );
        return;
      }

      const summaryLines = [
        "sensor,total_samples",
        `gyroscope,${gyroTotalRef.current}`,
        `accelerometer,${accelTotalRef.current}`,
        `microphone_metering,${micTotalRef.current}`,
        wavUriRef.current
          ? `microphone_audio,${Platform.OS === "ios" ? "WAV_PCM" : "AAC_M4A"}_${micSampleRate}Hz`
          : null,
      ]
        .filter(Boolean)
        .join("\n");

      const summaryPath = `${dir}all-sensors-summary-${ts}.csv`;
      await FileSystem.writeAsStringAsync(summaryPath, summaryLines);
      filesToZip.push(summaryPath);

      const zipPath = `${dir}all-sensors-${safeName}-${ts}.zip`;
      await createZipDataFile(filesToZip, zipPath);

      const zipFileName = safeName.toLowerCase().endsWith(".zip")
        ? safeName
        : `${safeName}.zip`;

      addLogMessage(
        "INFO",
        `Uploading "${zipFileName}" to HPC (remote stop)...`
      );
      await uploadToHPCSilent(zipPath, zipFileName, "all");
      addLogMessage("INFO", `Upload complete: ${zipFileName}`);
    } catch (e: any) {
      addLogMessage(
        "ERROR",
        `Remote stop+upload failed: ${e?.message ?? e}`
      );
    } finally {
      resetSessionData({ keepLog: true });
      setGyroUseMaxRate(false);
      setAccelUseMaxRate(false);
    }
  };

  useEffect(() => {
    startAllSensorsHandlerRef.current = startAllSensors;
    stopAllSensorsHandlerRef.current = stopAllSensors;
    resetSessionDataHandlerRef.current = resetSessionData;
    stopAndUploadHandlerRef.current = stopAndUploadWithName;
  });

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled || cmdInFlightRef.current) return;
      try {
        const resp = await fetch(`${COMMAND_SERVER_URL}/api/poll`);
        if (!resp.ok) return;
        const cmd = (await resp.json()) as {
          id?: number;
          action?: string;
          filename?: string;
        };
        if (
          !cmd ||
          typeof cmd.id !== "number" ||
          cmd.id <= lastAckedCmdIdRef.current
        ) {
          return;
        }
        if (cmd.action === "none" || !cmd.action) {
          lastAckedCmdIdRef.current = cmd.id;
          return;
        }

        cmdInFlightRef.current = true;
        try {
          addLogMessage(
            "INFO",
            `Remote command id=${cmd.id} action=${cmd.action} filename=${cmd.filename ?? ""}`
          );
          if (cmd.action === "start") {
            if (isRecordingRef.current) {
              await stopAllSensorsHandlerRef.current?.();
            }
            resetSessionDataHandlerRef.current?.({ keepLog: true });
            await startAllSensorsHandlerRef.current?.({ forceMaxRate: true });
          } else if (cmd.action === "stop") {
            await stopAndUploadHandlerRef.current?.(cmd.filename ?? "");
          }
          try {
            await fetch(`${COMMAND_SERVER_URL}/api/ack`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: cmd.id }),
            });
          } catch (ackErr) {
            console.warn("Ack failed:", ackErr);
          }
          lastAckedCmdIdRef.current = cmd.id;
        } finally {
          cmdInFlightRef.current = false;
        }
      } catch {
        // Retry on next poll tick.
      }
    };

    const intervalId = setInterval(tick, COMMAND_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const handleSaveRecording = () => {
    const total = gyroTotalRef.current + accelTotalRef.current + micTotalRef.current;
    if (total === 0 && !wavUriRef.current) {
      Alert.alert("No data", "Please record some data first before saving.");
      return;
    }
    setRecordingName("");
    setShowSaveDialog(true);
  };

  const confirmSaveRecording = async () => {
    if (!recordingName.trim()) {
      Alert.alert("Name required", "Please enter a name for the recording.");
      return;
    }

    try {
      await saveRecording(
        recordingName.trim(),
        "all",
        [],
        [
          "t_ms,x_rad_s,y_rad_s,z_rad_s",
          "t_ms,x_g,y_g,z_g",
          "t_ms,amplitude_dbfs",
        ],
        {
          gyroCsvPath: gyroCsvRef.current || undefined,
          accelCsvPath: accelCsvRef.current || undefined,
          micMeteringCsvPath: micMeteringCsvRef.current || undefined,
          wavFilePath: wavUriRef.current || undefined,
        }
      );

      setShowSaveDialog(false);
      Alert.alert(
        "Success",
        `Recording "${recordingName}" saved successfully locally!`
      );
      setRecordingName("");
    } catch (error) {
      Alert.alert("Error", `Failed to save recording: ${error}`);
    }
  };

  const handleHPCUpload = async () => {
    if (!hpcFileName.trim()) {
      Alert.alert("Name required", "Please enter a name for the file.");
      return;
    }

    setShowHPCDialog(false);

    try {
      const fileNameWithExt = hpcFileName.includes(".")
        ? hpcFileName
        : `${hpcFileName}.zip`;
      await uploadToHPC(pendingUploadPath, fileNameWithExt, "all");
      Alert.alert("Success", "File uploaded to HPC server!");
    } catch (error) {
      Alert.alert("Upload Error", `Failed to upload: ${error}`);
    }
  };

  const renderHeader = () => (
    <View style={{ padding: 16 }}>
      <Text
        style={{
          color: "#cbd5e1",
          fontSize: 18,
          fontWeight: "600",
          marginBottom: 8,
        }}
      >
        All Sensors
      </Text>
      <Text style={{ color: "#9aa4b2", marginBottom: 12 }}>
        Record from all sensors simultaneously
      </Text>

      <View
        style={{
          padding: 12,
          borderRadius: 12,
          backgroundColor: "#111827",
          marginBottom: 16,
        }}
      >
        <Text style={{ color: "#e5e7eb", marginBottom: 4 }}>
          Gyroscope:{" "}
          {gyroAvailable === null
            ? "checking..."
            : gyroAvailable
            ? "✓ Available"
            : "✗ Unavailable"}
        </Text>
        <Text style={{ color: "#e5e7eb", marginBottom: 4 }}>
          Accelerometer:{" "}
          {accelAvailable === null
            ? "checking..."
            : accelAvailable
            ? "✓ Available"
            : "✗ Unavailable"}
        </Text>
        <Text style={{ color: "#e5e7eb" }}>
          Microphone:{" "}
          {micAvailable === null
            ? "checking..."
            : micAvailable
            ? "✓ Available"
            : "✗ Unavailable"}
        </Text>
      </View>

      <View
        style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}
      >
        <Pressable
          onPress={isRecording ? stopAllSensors : startAllSensors}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: isRecording ? "#ef4444" : "#22c55e",
            marginRight: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>
            {isRecording ? "Stop All" : "Start All"}
          </Text>
        </Pressable>

        <Pressable
          onPress={clearAllData}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: "#64748b",
            marginRight: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Clear</Text>
        </Pressable>

        <Pressable
          onPress={exportAllData}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: "#a855f7",
            marginRight: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>
            Upload to HPC
          </Text>
        </Pressable>

        <Pressable
          onPress={handleSaveRecording}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: "#f59e0b",
            marginRight: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>
            Save Recording
          </Text>
        </Pressable>
      </View>

      <View style={{ marginBottom: 16 }}>
        <Text
          style={{
            color: "#cbd5e1",
            fontSize: 16,
            fontWeight: "600",
            marginBottom: 8,
          }}
        >
          Sampling Rates
        </Text>

        {/* Gyroscope Sampling Rate */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Text style={{ color: "#9aa4b2", marginRight: 8, minWidth: 80 }}>
            Gyro (Hz):
          </Text>
          <TextInput
            value={gyroSamplingText}
            onChangeText={(text) => {
              setGyroSamplingText(text);
              const num = parseInt(text.replace(/[^\d]/g, ""), 10);
              if (!isNaN(num) && num >= 1 && num <= 100) {
                setGyroSamplingRate(num);
              }
            }}
            onBlur={() => {
              const num = parseInt(gyroSamplingText.replace(/[^\d]/g, ""), 10);
              if (isNaN(num) || num < 1) {
                setGyroSamplingText("1");
                setGyroSamplingRate(1);
              } else if (num > 100) {
                setGyroSamplingText("100");
                setGyroSamplingRate(100);
              } else {
                setGyroSamplingText(String(num));
                setGyroSamplingRate(num);
              }
            }}
            keyboardType="numeric"
            style={{
              color: "white",
              backgroundColor: "#111827",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              minWidth: 70,
              marginRight: 8,
            }}
            placeholder="20"
            placeholderTextColor="#6b7280"
          />
          <Pressable
            onPress={() => setGyroUseMaxRate(!gyroUseMaxRate)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: gyroUseMaxRate ? "#10b981" : "#374151",
              marginRight: 8,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600", fontSize: 12 }}>
              MAX
            </Text>
          </Pressable>
          <Text style={{ color: "#6b7280" }}>
            {gyroUseMaxRate
              ? gyroActualRate !== null
                ? `(${gyroActualRate} Hz)`
                : "(Measuring...)"
              : "(1-100 Hz)"}
          </Text>
        </View>

        {/* Accelerometer Sampling Rate */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Text style={{ color: "#9aa4b2", marginRight: 8, minWidth: 80 }}>
            Accel (Hz):
          </Text>
          <TextInput
            value={accelSamplingText}
            onChangeText={(text) => {
              setAccelSamplingText(text);
              const num = parseInt(text.replace(/[^\d]/g, ""), 10);
              if (!isNaN(num) && num >= 1 && num <= 100) {
                setAccelSamplingRate(num);
              }
            }}
            onBlur={() => {
              const num = parseInt(accelSamplingText.replace(/[^\d]/g, ""), 10);
              if (isNaN(num) || num < 1) {
                setAccelSamplingText("1");
                setAccelSamplingRate(1);
              } else if (num > 100) {
                setAccelSamplingText("100");
                setAccelSamplingRate(100);
              } else {
                setAccelSamplingText(String(num));
                setAccelSamplingRate(num);
              }
            }}
            keyboardType="numeric"
            style={{
              color: "white",
              backgroundColor: "#111827",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              minWidth: 70,
              marginRight: 8,
            }}
            placeholder="20"
            placeholderTextColor="#6b7280"
          />
          <Pressable
            onPress={() => setAccelUseMaxRate(!accelUseMaxRate)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: accelUseMaxRate ? "#10b981" : "#374151",
              marginRight: 8,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600", fontSize: 12 }}>
              MAX
            </Text>
          </Pressable>
          <Text style={{ color: "#6b7280" }}>
            {accelUseMaxRate
              ? accelActualRate !== null
                ? `(${accelActualRate} Hz)`
                : "(Measuring...)"
              : "(1-100 Hz)"}
          </Text>
        </View>

        {/* Microphone Sample Rate */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Text style={{ color: "#9aa4b2", marginRight: 8, minWidth: 80 }}>
            Mic (Hz):
          </Text>
          <TextInput
            value={micSampleRateText}
            onChangeText={(text) => {
              setMicSampleRateText(text);
              const num = parseInt(text.replace(/[^\d]/g, ""), 10);
              if (!isNaN(num) && num >= 8000 && num <= 48000) {
                setMicSampleRate(num);
              }
            }}
            onBlur={() => {
              const num = parseInt(micSampleRateText.replace(/[^\d]/g, ""), 10);
              if (isNaN(num) || num < 8000) {
                setMicSampleRateText("8000");
                setMicSampleRate(8000);
              } else if (num > 48000) {
                setMicSampleRateText("48000");
                setMicSampleRate(48000);
              } else {
                setMicSampleRateText(String(num));
                setMicSampleRate(num);
              }
            }}
            keyboardType="numeric"
            editable={!isRecording}
            style={{
              color: isRecording ? "#6b7280" : "white",
              backgroundColor: "#111827",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              minWidth: 90,
              marginRight: 8,
            }}
            placeholder="16000"
            placeholderTextColor="#6b7280"
          />
          <Text style={{ color: "#6b7280" }}>(8k-48k Hz)</Text>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4, marginBottom: 4 }}>
          {[8000, 16000, 22050, 44100].map((rate) => (
            <Pressable
              key={rate}
              onPress={() => {
                if (!isRecording) {
                  setMicSampleRate(rate);
                  setMicSampleRateText(String(rate));
                }
              }}
              style={{
                paddingVertical: 3,
                paddingHorizontal: 8,
                borderRadius: 6,
                backgroundColor:
                  micSampleRate === rate ? "#3b82f6" : "#374151",
              }}
            >
              <Text style={{ color: "white", fontSize: 11, fontWeight: "600" }}>
                {rate >= 1000 ? `${rate / 1000}k` : rate}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => Keyboard.dismiss()}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderRadius: 8,
            backgroundColor: "#6366f1",
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }}>
            Close Keyboard
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          padding: 12,
          borderRadius: 12,
          backgroundColor: "#111827",
          marginBottom: 16,
        }}
      >
        <Text style={{ color: "#e5e7eb" }}>
          Status: {isRecording ? "🔴 Recording" : "⏹️ Stopped"}
        </Text>
        <Text style={{ color: "#e5e7eb", marginTop: 4 }}>
          Gyroscope: {gyroTotal} samples @{" "}
          {gyroUseMaxRate
            ? gyroActualRate !== null
              ? `${gyroActualRate} Hz (MAX)`
              : "MAX (measuring...)"
            : `${gyroSamplingRate} Hz`}
        </Text>
        <Text style={{ color: "#e5e7eb", marginTop: 4 }}>
          Accelerometer: {accelTotal} samples @{" "}
          {accelUseMaxRate
            ? accelActualRate !== null
              ? `${accelActualRate} Hz (MAX)`
              : "MAX (measuring...)"
            : `${accelSamplingRate} Hz`}
        </Text>
        <Text style={{ color: "#e5e7eb", marginTop: 4 }}>
          Microphone:{" "}
          {Platform.OS === "ios" ? "WAV PCM" : "AAC M4A"} @ {micSampleRate} Hz
          {" "}| {micTotal} metering samples
        </Text>
        {Platform.OS === "android" && (
          <Text style={{ color: "#f59e0b", fontSize: 11, marginTop: 2 }}>
            Android: convert M4A → WAV server-side with ffmpeg
          </Text>
        )}
        {wavUriRef.current && !isRecording && (
          <Text style={{ color: "#22c55e", marginTop: 4 }}>
            {Platform.OS === "ios" ? "WAV (PCM)" : "AAC M4A"} audio file ready
          </Text>
        )}
      </View>

      <Text
        style={{
          color: "#cbd5e1",
          fontSize: 16,
          fontWeight: "600",
          marginBottom: 8,
        }}
      >
        Activity Log ({Math.min(logRows.length, 50)} messages)
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0f12" }}>
      <View style={{ flex: 1 }}>
        {renderHeader()}

        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          <View
            style={{
              backgroundColor: "#111827",
              borderRadius: 8,
              padding: 8,
              flex: 1,
            }}
          >
            <FlatList
              data={logRows.slice(-50).reverse()}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <Text
                  style={{
                    color:
                      item.type === "ERROR"
                        ? "#f87171"
                        : item.type === "STATUS"
                        ? "#93c5fd"
                        : "#a3a3a3",
                    fontFamily: Platform.select({
                      ios: "Menlo",
                      android: "monospace",
                    }),
                    fontSize: 12,
                    paddingVertical: 1,
                  }}
                >
                  {new Date(item.t).toLocaleTimeString()} | {item.type} |{" "}
                  {item.message}
                </Text>
              )}
              showsVerticalScrollIndicator={true}
            />
          </View>
        </View>
      </View>

      <Modal
        visible={showSaveDialog}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSaveDialog(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "#111827",
              borderRadius: 16,
              padding: 24,
              marginHorizontal: 32,
              width: "85%",
              maxWidth: 400,
            }}
          >
            <Text
              style={{
                color: "#e5e7eb",
                fontSize: 18,
                fontWeight: "600",
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              Save All Sensors Recording
            </Text>

            <Text
              style={{
                color: "#9aa4b2",
                fontSize: 14,
                marginBottom: 12,
              }}
            >
              Enter a name for your recording:
            </Text>

            <TextInput
              value={recordingName}
              onChangeText={setRecordingName}
              placeholder="e.g., Complete motion test"
              placeholderTextColor="#6b7280"
              style={{
                backgroundColor: "#374151",
                color: "white",
                borderRadius: 8,
                paddingHorizontal: 16,
                paddingVertical: 12,
                fontSize: 16,
                marginBottom: 12,
              }}
              autoFocus={true}
              returnKeyType="done"
              onSubmitEditing={confirmSaveRecording}
            />

            <Text
              style={{
                color: "#64748b",
                fontSize: 12,
                marginBottom: 20,
                textAlign: "center",
              }}
            >
              Saves CSV files for each sensor + WAV audio
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => setShowSaveDialog(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  backgroundColor: "#64748b",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ color: "white", fontWeight: "600", fontSize: 16 }}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={confirmSaveRecording}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  backgroundColor: "#f59e0b",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ color: "white", fontWeight: "600", fontSize: 16 }}
                >
                  Save
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showHPCDialog}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowHPCDialog(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "#111827",
              borderRadius: 16,
              padding: 24,
              marginHorizontal: 32,
              width: "85%",
              maxWidth: 400,
            }}
          >
            <Text
              style={{
                color: "#e5e7eb",
                fontSize: 18,
                fontWeight: "600",
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              Name Your File
            </Text>

            <Text
              style={{
                color: "#9aa4b2",
                fontSize: 14,
                marginBottom: 12,
              }}
            >
              Enter a name for your all sensors data file:
            </Text>

            <TextInput
              value={hpcFileName}
              onChangeText={setHPCFileName}
              placeholder="all-sensors-export"
              placeholderTextColor="#6b7280"
              style={{
                backgroundColor: "#374151",
                color: "white",
                borderRadius: 8,
                paddingHorizontal: 16,
                paddingVertical: 12,
                fontSize: 16,
                marginBottom: 20,
              }}
              autoFocus={true}
              returnKeyType="done"
              onSubmitEditing={handleHPCUpload}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => setShowHPCDialog(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  backgroundColor: "#64748b",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ color: "white", fontWeight: "600", fontSize: 16 }}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={handleHPCUpload}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  backgroundColor: "#a855f7",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ color: "white", fontWeight: "600", fontSize: 16 }}
                >
                  Upload
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
