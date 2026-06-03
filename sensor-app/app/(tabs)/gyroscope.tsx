import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  Alert,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Gyroscope, type GyroscopeMeasurement } from "expo-sensors";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { uploadToHPC } from "../../components/hpc-upload";
import { saveRecording } from "../../utils/recordings-storage";

type Row = { t: number; x: number; y: number; z: number };

const FLUSH_INTERVAL = 5000;
const DISPLAY_BUFFER_SIZE = 100;
const CSV_HEADER = "t_ms,x_rad_s,y_rad_s,z_rad_s\n";

function GyroscopeScreen() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [samplingRate, setSamplingRate] = useState(20);
  const [samplingText, setSamplingText] = useState("20");
  const [useMaxRate, setUseMaxRate] = useState(false);
  const [actualRate, setActualRate] = useState<number | null>(null);
  const [data, setData] = useState<GyroscopeMeasurement>({
    x: 0,
    y: 0,
    z: 0,
    timestamp: 0,
  });
  const [recentRows, setRecentRows] = useState<Row[]>([]);
  const [totalSamples, setTotalSamples] = useState(0);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [recordingName, setRecordingName] = useState("");
  const zeroRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const subRef = useRef<any>(null);
  const t0Ref = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const sampleCountRef = useRef(0);
  const rateUpdateRef = useRef<number | null>(null);
  const bufferRef = useRef<Row[]>([]);
  const csvFileRef = useRef<string | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalCountRef = useRef(0);
  const headerWrittenRef = useRef(false);

  useEffect(() => {
    Gyroscope.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    if (useMaxRate) {
      Gyroscope.setUpdateInterval(1);
    } else {
      const intervalMs = Math.round(1000 / samplingRate);
      Gyroscope.setUpdateInterval(intervalMs);
    }
  }, [samplingRate, useMaxRate]);

  useEffect(() => {
    return () => {
      if (subRef.current) subRef.current.remove();
      subRef.current = null;
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, []);

  const flushBuffer = async () => {
    if (bufferRef.current.length === 0 || !csvFileRef.current) return;

    const rows = bufferRef.current;
    bufferRef.current = [];

    try {
      let content = "";
      if (!headerWrittenRef.current) {
        content = CSV_HEADER;
        headerWrittenRef.current = true;
      }
      content +=
        rows.map((r) => `${r.t},${r.x},${r.y},${r.z}`).join("\n") + "\n";

      const fileInfo = await FileSystem.getInfoAsync(csvFileRef.current);
      if (fileInfo.exists) {
        const existing = await FileSystem.readAsStringAsync(csvFileRef.current);
        await FileSystem.writeAsStringAsync(csvFileRef.current, existing + content);
      } else {
        await FileSystem.writeAsStringAsync(csvFileRef.current, content);
      }
    } catch (e) {
      console.warn("Failed to flush gyro buffer:", e);
    }
  };

  const start = async () => {
    if (streaming) return;

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = FileSystem.documentDirectory + "GyroLogs/";
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    csvFileRef.current = `${dir}gyro-${ts}.csv`;

    t0Ref.current = Date.now();
    lastTimestampRef.current = null;
    sampleCountRef.current = 0;
    rateUpdateRef.current = Date.now();
    bufferRef.current = [];
    totalCountRef.current = 0;
    headerWrittenRef.current = false;
    setTotalSamples(0);
    setRecentRows([]);

    subRef.current = Gyroscope.addListener((m) => {
      setData(m);

      const now = Date.now();

      if (lastTimestampRef.current !== null) {
        sampleCountRef.current++;
        if (rateUpdateRef.current && now - rateUpdateRef.current >= 1000) {
          const elapsed = (now - rateUpdateRef.current) / 1000;
          const measuredRate = sampleCountRef.current / elapsed;
          setActualRate(Math.round(measuredRate * 10) / 10);
          sampleCountRef.current = 0;
          rateUpdateRef.current = now;
        }
      }
      lastTimestampRef.current = now;

      const z0 = zeroRef.current ?? { x: 0, y: 0, z: 0 };
      const row: Row = {
        t: t0Ref.current ? now - t0Ref.current : 0,
        x: m.x - z0.x,
        y: m.y - z0.y,
        z: m.z - z0.z,
      };

      bufferRef.current.push(row);
      totalCountRef.current++;
      setTotalSamples(totalCountRef.current);

      setRecentRows((prev) => {
        const updated = [...prev, row];
        return updated.length > DISPLAY_BUFFER_SIZE
          ? updated.slice(-DISPLAY_BUFFER_SIZE)
          : updated;
      });
    });

    flushTimerRef.current = setInterval(flushBuffer, FLUSH_INTERVAL);
    setStreaming(true);
  };

  const stop = async () => {
    if (subRef.current) {
      subRef.current.remove();
      subRef.current = null;
    }
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    await flushBuffer();
    setStreaming(false);
    setActualRate(null);
  };

  const toggle = () => (streaming ? stop() : start());

  const zeroNow = () => {
    zeroRef.current = { x: data.x, y: data.y, z: data.z };
    Alert.alert("Zero set", "Current reading stored as zero.");
  };

  const clearLog = () => {
    setRecentRows([]);
    setTotalSamples(0);
    csvFileRef.current = null;
  };

  const saveCsv = async () => {
    if (!csvFileRef.current) {
      Alert.alert("No data", "Please record some data first.");
      return;
    }

    try {
      const fileInfo = await FileSystem.getInfoAsync(csvFileRef.current);
      if (!fileInfo.exists) {
        Alert.alert("Error", "CSV file not found.");
        return;
      }

      try {
        const fileName = csvFileRef.current.split("/").pop() || "gyro.csv";
        await uploadToHPC(csvFileRef.current, fileName, "gyroscope");
      } catch (e) {
        console.warn("Failed to upload to HPC server:", e);
      }
      if (Platform.OS !== "web" && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(csvFileRef.current);
      } else {
        Alert.alert(
          "Saved",
          `CSV saved and uploaded to HPC server:\n${csvFileRef.current}`
        );
      }
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message ?? e));
    }
  };

  const magnitude = useMemo(
    () => Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z),
    [data]
  );

  const handleSaveRecording = () => {
    if (totalSamples === 0) {
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
      await saveRecording(recordingName.trim(), "gyroscope", [], [
        "t_ms,x_rad_s,y_rad_s,z_rad_s",
      ], { csvFilePath: csvFileRef.current || undefined });
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
        Gyroscope
      </Text>
      <Text style={{ color: "#9aa4b2", marginBottom: 12 }}>
        Sensor available: {available === null ? "…" : available ? "yes" : "no"}
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
            backgroundColor: streaming ? "#ef4444" : "#22c55e",
            marginRight: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>
            {streaming ? "Stop" : "Start"}
          </Text>
        </Pressable>

        <Pressable
          onPress={zeroNow}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: "#3b82f6",
            marginRight: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Zero</Text>
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
          onPress={saveCsv}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: "#a855f7",
            marginRight: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Export CSV</Text>
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
          Sampling Rate (Hz):
        </Text>
        <TextInput
          value={samplingText}
          onChangeText={(text) => {
            setSamplingText(text);
            const num = parseInt(text.replace(/[^\d]/g, ""), 10);
            if (!isNaN(num) && num >= 1 && num <= 100) {
              setSamplingRate(num);
            }
          }}
          onBlur={() => {
            const num = parseInt(samplingText.replace(/[^\d]/g, ""), 10);
            if (isNaN(num) || num < 1) {
              setSamplingText("1");
              setSamplingRate(1);
            } else if (num > 100) {
              setSamplingText("100");
              setSamplingRate(100);
            } else {
              setSamplingText(String(num));
              setSamplingRate(num);
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
          onPress={() => setUseMaxRate(!useMaxRate)}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: useMaxRate ? "#10b981" : "#374151",
            marginRight: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "600", fontSize: 12 }}>
            MAX
          </Text>
        </Pressable>
        <Text style={{ color: "#475569" }}>
          {useMaxRate
            ? actualRate !== null
              ? `(Actual: ${actualRate} Hz)`
              : "(Measuring...)"
            : "(1–100 Hz)"}
        </Text>
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
          x: {data.x.toFixed(4)} rad/s{"  "}
          y: {data.y.toFixed(4)} rad/s{"  "}
          z: {data.z.toFixed(4)} rad/s
        </Text>
        <Text style={{ color: "#9aa4b2", marginTop: 4 }}>
          ‖ω‖: {magnitude.toFixed(4)} rad/s
        </Text>
        <Text style={{ color: "#64748b", marginTop: 4 }}>
          Total samples: {totalSamples} | Rate: {samplingRate} Hz (~
          {Math.round(1000 / samplingRate)}ms interval)
        </Text>
      </View>

      <Text
        style={{
          color: "#cbd5e1",
          fontSize: 16,
          fontWeight: "600",
          marginBottom: 8,
        }}
      >
        Recent Data ({Math.min(recentRows.length, 50)} samples)
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
                  {item.t.toString().padStart(6, " ")} ms | {item.x.toFixed(4)}{" "}
                  {item.y.toFixed(4)} {item.z.toFixed(4)}
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
              Save Gyroscope Recording
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
              placeholder="e.g., Phone rotation test"
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
              onSubmitEditing={confirmSaveRecording}
            />

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

export default GyroscopeScreen;
