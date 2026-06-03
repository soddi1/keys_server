import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  Alert,
  Platform,
  Modal,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { uploadToHPC } from "../../components/hpc-upload";
import {
  saveRecording,
  getMicRecordingFileExtension,
} from "../../utils/recordings-storage";

type Row = { t: number; amplitude: number };

const FLUSH_INTERVAL = 5000;
const METERING_DIR = FileSystem.documentDirectory + "MicLogs/";

export default function MicrophoneScreen() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [sampleRate, setSampleRate] = useState(16000);
  const [sampleRateText, setSampleRateText] = useState("16000");
  const [currentAmplitude, setCurrentAmplitude] = useState(0);
  const [recentRows, setRecentRows] = useState<Row[]>([]);
  const [totalSamples, setTotalSamples] = useState(0);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [recordingName, setRecordingName] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);

  const recording = useRef<Audio.Recording | null>(null);
  const wavUriRef = useRef<string | null>(null);
  const t0Ref = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringBufferRef = useRef<Row[]>([]);
  const meteringFileRef = useRef<string | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringCountRef = useRef(0);
  const headerWrittenRef = useRef(false);

  useEffect(() => {
    const checkAvailability = async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        setAvailable(status === "granted");
      } catch {
        setAvailable(false);
      }
    };
    checkAvailability();
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (recording.current) {
        recording.current.stopAndUnloadAsync().catch(() => {});
      }
      Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    };
  }, []);

  const flushMeteringBuffer = async () => {
    if (
      meteringBufferRef.current.length === 0 ||
      !meteringFileRef.current
    )
      return;

    const rows = meteringBufferRef.current;
    meteringBufferRef.current = [];

    try {
      let content = "";
      if (!headerWrittenRef.current) {
        content = "t_ms,amplitude_dbfs\n";
        headerWrittenRef.current = true;
      }
      content += rows.map((r) => `${r.t},${r.amplitude}`).join("\n") + "\n";

      const fileInfo = await FileSystem.getInfoAsync(meteringFileRef.current);
      if (fileInfo.exists) {
        const existing = await FileSystem.readAsStringAsync(
          meteringFileRef.current
        );
        await FileSystem.writeAsStringAsync(
          meteringFileRef.current,
          existing + content
        );
      } else {
        await FileSystem.writeAsStringAsync(meteringFileRef.current, content);
      }
    } catch (e) {
      console.warn("Failed to flush metering buffer:", e);
    }
  };

  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission required", "Microphone access is needed.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const opts = {
        isMeteringEnabled: true,
        android: {
          extension: ".m4a",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate,
          numberOfChannels: 1,
          bitRate: 256000,
        },
        ios: {
          extension: ".wav",
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.MAX,
          sampleRate,
          numberOfChannels: 1,
          bitRate: sampleRate * 16,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
      };

      setRecentRows([]);
      setTotalSamples(0);
      setElapsedSec(0);
      t0Ref.current = Date.now();
      meteringBufferRef.current = [];
      meteringCountRef.current = 0;
      headerWrittenRef.current = false;

      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      await FileSystem.makeDirectoryAsync(METERING_DIR, {
        intermediates: true,
      });
      meteringFileRef.current = `${METERING_DIR}mic-metering-${ts}.csv`;

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(opts);
      await rec.startAsync();

      recording.current = rec;
      wavUriRef.current = null;
      setIsRecording(true);

      elapsedRef.current = setInterval(() => {
        if (t0Ref.current) {
          setElapsedSec(Math.floor((Date.now() - t0Ref.current) / 1000));
        }
      }, 1000);

      pollRef.current = setInterval(async () => {
        try {
          if (!rec || !recording.current) return;
          const st = await rec.getStatusAsync();
          if (st.isRecording) {
            const t = Date.now();
            const amp =
              typeof st.metering === "number" ? st.metering : -160;
            setCurrentAmplitude(amp);

            const newRow: Row = {
              t: t0Ref.current ? t - t0Ref.current : 0,
              amplitude: amp,
            };

            meteringBufferRef.current.push(newRow);
            meteringCountRef.current++;
            setTotalSamples(meteringCountRef.current);

            setRecentRows((prev) => {
              const updated = [...prev, newRow];
              return updated.length > 100 ? updated.slice(-100) : updated;
            });
          }
        } catch {
          // Metering errors are non-fatal; skip this tick.
        }
      }, 100);

      flushTimerRef.current = setInterval(flushMeteringBuffer, FLUSH_INTERVAL);
    } catch (e: any) {
      Alert.alert("Error", String(e?.message ?? e));
    }
  };

  const stopRecording = async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }

    setIsRecording(false);

    try {
      if (recording.current) {
        const status = await recording.current.getStatusAsync();
        if (status.isRecording) {
          await recording.current.stopAndUnloadAsync();
        }
        wavUriRef.current = recording.current.getURI();
        recording.current = null;
      }
    } catch {
      // Recording may already be stopped.
    }

    await flushMeteringBuffer();

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch {
      // Best-effort audio mode reset.
    }
  };

  const toggle = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const clearLog = () => {
    setRecentRows([]);
    setTotalSamples(0);
    setElapsedSec(0);
    t0Ref.current = null;
    setCurrentAmplitude(0);
    wavUriRef.current = null;
    meteringFileRef.current = null;
  };

  const exportWav = async () => {
    if (!wavUriRef.current) {
      Alert.alert("No audio", "Please record audio first.");
      return;
    }

    try {
      const fileInfo = await FileSystem.getInfoAsync(wavUriRef.current);
      if (!fileInfo.exists) {
        Alert.alert("Error", "Audio file not found. It may have been deleted.");
        return;
      }

      try {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const ext = getMicRecordingFileExtension(wavUriRef.current);
        await uploadToHPC(wavUriRef.current, `mic-${ts}.${ext}`, "microphone");
      } catch (e) {
        console.warn("Failed to upload to HPC server:", e);
      }

      if (Platform.OS !== "web" && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(wavUriRef.current);
      } else {
        Alert.alert(
        "Saved",
        `${Platform.OS === "ios" ? "WAV (PCM)" : "AAC M4A"} audio file ready:\n${wavUriRef.current}`
      );
      }
    } catch (e: any) {
      Alert.alert("Export failed", String(e?.message ?? e));
    }
  };

  const exportMeteringCsv = async () => {
    if (!meteringFileRef.current) {
      Alert.alert("No data", "Please record some data first.");
      return;
    }

    try {
      const fileInfo = await FileSystem.getInfoAsync(meteringFileRef.current);
      if (!fileInfo.exists) {
        Alert.alert("Error", "Metering CSV file not found.");
        return;
      }

      try {
        const fileName = meteringFileRef.current.split("/").pop() || "mic.csv";
        await uploadToHPC(meteringFileRef.current, fileName, "microphone");
      } catch (e) {
        console.warn("Failed to upload to HPC server:", e);
      }

      if (Platform.OS !== "web" && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(meteringFileRef.current);
      } else {
        Alert.alert("Saved", `CSV saved:\n${meteringFileRef.current}`);
      }
    } catch (e: any) {
      Alert.alert("Export failed", String(e?.message ?? e));
    }
  };

  const handleSaveRecording = () => {
    if (!wavUriRef.current && totalSamples === 0) {
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
        "microphone",
        [],
        ["t_ms,amplitude_dbfs"],
        {
          wavFilePath: wavUriRef.current || undefined,
          meteringFilePath: meteringFileRef.current || undefined,
        }
      );
      setShowSaveDialog(false);
      Alert.alert(
        "Success",
        `Recording "${recordingName}" saved successfully!`
      );
      setRecordingName("");
    } catch (error) {
      Alert.alert("Error", `Failed to save recording: ${error}`);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const renderHeader = () => (
    <View style={{ padding: 16 }}>
      <Text
        style={{
          color: "#cbd5e1",
          fontSize: 18,
          fontWeight: "600",
          marginBottom: 12,
        }}
      >
        Microphone
      </Text>

      <View
        style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}
      >
        <Pressable
          onPress={toggle}
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
            {isRecording ? "Stop" : "Start"}
          </Text>
        </Pressable>

        <Pressable
          onPress={clearLog}
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
          onPress={exportWav}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: "#3b82f6",
            marginRight: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>
            Export Audio
          </Text>
        </Pressable>

        <Pressable
          onPress={exportMeteringCsv}
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
            Export Metering CSV
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

      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
      >
        <Text style={{ color: "#9aa4b2", marginRight: 8 }}>
          Sample Rate (Hz):
        </Text>
        <TextInput
          value={sampleRateText}
          onChangeText={(text) => {
            setSampleRateText(text);
            const num = parseInt(text.replace(/[^\d]/g, ""), 10);
            if (!isNaN(num) && num >= 8000 && num <= 48000) {
              setSampleRate(num);
            }
          }}
          onBlur={() => {
            const num = parseInt(sampleRateText.replace(/[^\d]/g, ""), 10);
            if (isNaN(num) || num < 8000) {
              setSampleRateText("8000");
              setSampleRate(8000);
            } else if (num > 48000) {
              setSampleRateText("48000");
              setSampleRate(48000);
            } else {
              setSampleRateText(String(num));
              setSampleRate(num);
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
        <Text style={{ color: "#475569" }}>(8000–48000 Hz)</Text>
        <Pressable
          onPress={() => Keyboard.dismiss()}
          style={{
            backgroundColor: "#374151",
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 4,
            marginLeft: 8,
          }}
        >
          <Text style={{ color: "#9ca3af", fontSize: 12 }}>
            ✕ Close Keyboard
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {[8000, 16000, 22050, 44100].map((rate) => (
          <Pressable
            key={rate}
            onPress={() => {
              if (!isRecording) {
                setSampleRate(rate);
                setSampleRateText(String(rate));
              }
            }}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 10,
              borderRadius: 6,
              backgroundColor:
                sampleRate === rate ? "#3b82f6" : "#374151",
            }}
          >
            <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>
              {rate >= 1000 ? `${rate / 1000}k` : rate}
            </Text>
          </Pressable>
        ))}
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
        <Text style={{ color: "#e5e7eb" }}>
          Current amplitude: {currentAmplitude.toFixed(1)} dBFS
        </Text>
        <Text style={{ color: "#e5e7eb" }}>
          Format:{" "}
          {Platform.OS === "ios"
            ? `WAV PCM 16-bit mono @ ${sampleRate} Hz`
            : `AAC M4A mono @ ${sampleRate} Hz (convert to WAV server-side)`}
        </Text>
        <Text style={{ color: "#64748b", marginTop: 4 }}>
          Duration: {formatTime(elapsedSec)} | Metering samples: {totalSamples}
        </Text>
        {wavUriRef.current && !isRecording && (
          <Text style={{ color: "#22c55e", marginTop: 4 }}>
            {Platform.OS === "ios" ? "WAV (PCM)" : "AAC M4A"} file ready for
            export
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
        Live Metering ({Math.min(recentRows.length, 50)} recent)
      </Text>
    </View>
  );

  if (available === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0f12" }}>
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Text style={{ color: "#9aa4b2" }}>
            Checking microphone availability...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (available === false) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0f12" }}>
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Text style={{ color: "#ef4444", fontSize: 18, marginBottom: 8 }}>
            Microphone Not Available
          </Text>
          <Text
            style={{
              color: "#9aa4b2",
              textAlign: "center",
              paddingHorizontal: 32,
            }}
          >
            Please check microphone permissions or try restarting the app.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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
              data={recentRows.slice(-50).reverse()}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <Text
                  style={{
                    color: "#93c5fd",
                    fontFamily: Platform.select({
                      ios: "Menlo",
                      android: "monospace",
                    }),
                    fontSize: 12,
                    paddingVertical: 1,
                  }}
                >
                  {item.t.toString().padStart(6, " ")} ms | amplitude:{" "}
                  {item.amplitude.toFixed(1)} dBFS
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
              Save Microphone Recording
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
              placeholder="e.g., Living room noise test"
              placeholderTextColor="#6b7280"
              style={{
                backgroundColor: "#374151",
                color: "white",
                borderRadius: 8,
                paddingHorizontal: 16,
                paddingVertical: 12,
                fontSize: 16,
                marginBottom: 8,
              }}
              autoFocus={true}
              returnKeyType="done"
              onSubmitEditing={confirmSaveRecording}
            />

            <Text
              style={{
                color: "#64748b",
                fontSize: 12,
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              Saves WAV audio file + metering CSV
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
    </SafeAreaView>
  );
}
