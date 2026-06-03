import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Accelerometer, Gyroscope } from "expo-sensors";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

type SensorSample = {
  timestamp: number; // event.timestamp in ms
  x: number;
  y: number;
  z: number;
};

type Stats = {
  median: number;
  mean: number;
  p5: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
  sampleCount: number;
};

export default function DiagnosticsScreen() {
  const [isRecording, setIsRecording] = useState(false);
  const [accelSamples, setAccelSamples] = useState<SensorSample[]>([]);
  const [gyroSamples, setGyroSamples] = useState<SensorSample[]>([]);
  const [accelStats, setAccelStats] = useState<Stats | null>(null);
  const [gyroStats, setGyroStats] = useState<Stats | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const accelSubRef = useRef<any>(null);
  const gyroSubRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<any>(null);
  const accelSamplesRef = useRef<SensorSample[]>([]);
  const gyroSamplesRef = useRef<SensorSample[]>([]);

  useEffect(() => {
    return () => {
      if (accelSubRef.current) accelSubRef.current.remove();
      if (gyroSubRef.current) gyroSubRef.current.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    // Set to 1ms (maximum rate)
    Accelerometer.setUpdateInterval(1);
    Gyroscope.setUpdateInterval(1);

    setAccelSamples([]);
    setGyroSamples([]);
    accelSamplesRef.current = [];
    gyroSamplesRef.current = [];
    setAccelStats(null);
    setGyroStats(null);
    setRecordingDuration(0);
    startTimeRef.current = Date.now();

    accelSubRef.current = Accelerometer.addListener((event) => {
      accelSamplesRef.current.push({
        timestamp: event.timestamp,
        x: event.x,
        y: event.y,
        z: event.z,
      });
    });

    gyroSubRef.current = Gyroscope.addListener((event) => {
      gyroSamplesRef.current.push({
        timestamp: event.timestamp,
        x: event.x,
        y: event.y,
        z: event.z,
      });
    });

    setIsRecording(true);

    // Update duration display
    timerRef.current = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      setRecordingDuration(elapsed);
    }, 100);
  };

  const stopRecording = () => {
    if (accelSubRef.current) {
      accelSubRef.current.remove();
      accelSubRef.current = null;
    }
    if (gyroSubRef.current) {
      gyroSubRef.current.remove();
      gyroSubRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setAccelSamples([...accelSamplesRef.current]);
    setGyroSamples([...gyroSamplesRef.current]);
    setIsRecording(false);
  };

  const calculateStats = (samples: SensorSample[]): Stats | null => {
    if (samples.length < 2) return null;

    // Sort by timestamp
    const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);

    // Calculate inter-sample gaps
    const deltas: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const dt = sorted[i].timestamp - sorted[i - 1].timestamp;
      deltas.push(dt);
    }

    if (deltas.length === 0) return null;

    // Auto-detect timestamp unit based on delta magnitude
    const medianDelta = [...deltas].sort((a, b) => a - b)[
      Math.floor(deltas.length / 2)
    ];

    // Convert to milliseconds based on detected unit
    let deltasInMs: number[];
    if (medianDelta > 1000000) {
      deltasInMs = deltas.map((d) => d / 1000000);
    } else if (medianDelta > 1000) {
      deltasInMs = deltas.map((d) => d / 1000);
    } else if (medianDelta > 1) {
      deltasInMs = deltas;
    } else {
      deltasInMs = deltas.map((d) => d * 1000);
    }

    // Calculate rates from milliseconds
    const rates = deltasInMs.map((dt_ms) => {
      return dt_ms > 0 ? 1000 / dt_ms : 0;
    });

    // Calculate statistics
    const sortedRates = [...rates].sort((a, b) => a - b);
    const sortedDeltasMs = [...deltasInMs].sort((a, b) => a - b);

    const getPercentile = (arr: number[], p: number) => {
      const index = Math.floor((arr.length - 1) * p);
      return arr[index];
    };

    const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length;
    const median = getPercentile(sortedRates, 0.5);
    const p5 = getPercentile(sortedDeltasMs, 0.05);
    const p50 = getPercentile(sortedDeltasMs, 0.5);
    const p95 = getPercentile(sortedDeltasMs, 0.95);
    const min = sortedDeltasMs[0];
    const max = sortedDeltasMs[sortedDeltasMs.length - 1];

    return {
      median,
      mean,
      p5,
      p50,
      p95,
      min,
      max,
      sampleCount: samples.length,
    };
  };

  const analyzeData = () => {
    const accelResult = calculateStats(accelSamples);
    const gyroResult = calculateStats(gyroSamples);

    setAccelStats(accelResult);
    setGyroStats(gyroResult);

    if (accelResult || gyroResult) {
      Alert.alert("Analysis Complete", "Scroll down to see detailed results");
    } else {
      Alert.alert("No Data", "Please record some data first");
    }
  };

  const exportData = async () => {
    try {
      let report = "=== SENSOR SAMPLING RATE DIAGNOSTICS ===\n\n";
      report += `Recording Duration: ${recordingDuration}s\n\n`;

      if (accelStats) {
        report += "ACCELEROMETER RESULTS:\n";
        report += `  Total Samples: ${accelStats.sampleCount}\n`;
        report += `  Median Rate: ${accelStats.median.toFixed(2)} Hz\n`;
        report += `  Mean Rate: ${accelStats.mean.toFixed(2)} Hz\n`;
        report += `  Inter-Sample Gaps (Δt in ms):\n`;
        report += `    Min: ${accelStats.min.toFixed(3)} ms\n`;
        report += `    5th percentile: ${accelStats.p5.toFixed(3)} ms\n`;
        report += `    Median: ${accelStats.p50.toFixed(3)} ms\n`;
        report += `    95th percentile: ${accelStats.p95.toFixed(3)} ms\n`;
        report += `    Max: ${accelStats.max.toFixed(3)} ms\n`;
        report += `  Jitter (95th-5th): ${(
          accelStats.p95 - accelStats.p5
        ).toFixed(3)} ms\n\n`;
      }

      if (gyroStats) {
        report += "GYROSCOPE RESULTS:\n";
        report += `  Total Samples: ${gyroStats.sampleCount}\n`;
        report += `  Median Rate: ${gyroStats.median.toFixed(2)} Hz\n`;
        report += `  Mean Rate: ${gyroStats.mean.toFixed(2)} Hz\n`;
        report += `  Inter-Sample Gaps (Δt in ms):\n`;
        report += `    Min: ${gyroStats.min.toFixed(3)} ms\n`;
        report += `    5th percentile: ${gyroStats.p5.toFixed(3)} ms\n`;
        report += `    Median: ${gyroStats.p50.toFixed(3)} ms\n`;
        report += `    95th percentile: ${gyroStats.p95.toFixed(3)} ms\n`;
        report += `    Max: ${gyroStats.max.toFixed(3)} ms\n`;
        report += `  Jitter (95th-5th): ${(
          gyroStats.p95 - gyroStats.p5
        ).toFixed(3)} ms\n\n`;
      }

      report += "\n=== RAW DATA ===\n\n";
      report += "ACCELEROMETER (timestamp_ms, x, y, z):\n";
      accelSamples.forEach((s) => {
        report += `${s.timestamp},${s.x},${s.y},${s.z}\n`;
      });

      report += "\nGYROSCOPE (timestamp_ms, x, y, z):\n";
      gyroSamples.forEach((s) => {
        report += `${s.timestamp},${s.x},${s.y},${s.z}\n`;
      });

      const dir = FileSystem.documentDirectory + "Diagnostics/";
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = `${dir}sensor-diagnostics-${timestamp}.txt`;
      await FileSystem.writeAsStringAsync(path, report);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path);
      } else {
        Alert.alert("Exported", `Report saved to:\n${path}`);
      }
    } catch (error: any) {
      Alert.alert("Export Error", error.message);
    }
  };

  const renderStats = (title: string, stats: Stats | null) => {
    if (!stats) return null;

    const jitter = stats.p95 - stats.p5;
    const jitterPercent = (jitter / stats.p50) * 100;

    return (
      <View
        style={{
          marginBottom: 24,
          backgroundColor: "#1e293b",
          padding: 16,
          borderRadius: 12,
        }}
      >
        <Text
          style={{
            color: "#cbd5e1",
            fontSize: 18,
            fontWeight: "700",
            marginBottom: 12,
          }}
        >
          {title}
        </Text>

        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: "#10b981", fontSize: 24, fontWeight: "700" }}>
            {stats.median.toFixed(1)} Hz
          </Text>
          <Text style={{ color: "#64748b", fontSize: 12 }}>
            Median Sampling Rate
          </Text>
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: "#334155",
            paddingTop: 12,
            marginTop: 8,
          }}
        >
          <Text style={{ color: "#94a3b8", fontSize: 14, marginBottom: 4 }}>
            Mean Rate:{" "}
            <Text style={{ color: "#e2e8f0", fontWeight: "600" }}>
              {stats.mean.toFixed(1)} Hz
            </Text>
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 14, marginBottom: 4 }}>
            Total Samples:{" "}
            <Text style={{ color: "#e2e8f0", fontWeight: "600" }}>
              {stats.sampleCount}
            </Text>
          </Text>
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: "#334155",
            paddingTop: 12,
            marginTop: 12,
          }}
        >
          <Text
            style={{
              color: "#cbd5e1",
              fontSize: 14,
              fontWeight: "600",
              marginBottom: 8,
            }}
          >
            Inter-Sample Gaps (Δt):
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 13 }}>
            Min:{" "}
            <Text style={{ color: "#e2e8f0" }}>{stats.min.toFixed(3)} ms</Text>
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 13 }}>
            5th %ile:{" "}
            <Text style={{ color: "#e2e8f0" }}>{stats.p5.toFixed(3)} ms</Text>
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 13 }}>
            Median:{" "}
            <Text style={{ color: "#e2e8f0" }}>{stats.p50.toFixed(3)} ms</Text>
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 13 }}>
            95th %ile:{" "}
            <Text style={{ color: "#e2e8f0" }}>{stats.p95.toFixed(3)} ms</Text>
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 13 }}>
            Max:{" "}
            <Text style={{ color: "#e2e8f0" }}>{stats.max.toFixed(3)} ms</Text>
          </Text>
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: "#334155",
            paddingTop: 12,
            marginTop: 12,
          }}
        >
          <Text
            style={{
              color: "#cbd5e1",
              fontSize: 14,
              fontWeight: "600",
              marginBottom: 4,
            }}
          >
            Jitter Analysis:
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 13 }}>
            95th-5th:{" "}
            <Text style={{ color: jitterPercent > 50 ? "#ef4444" : "#10b981" }}>
              {jitter.toFixed(3)} ms ({jitterPercent.toFixed(1)}%)
            </Text>
          </Text>
          <Text style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>
            {jitterPercent < 20
              ? "✓ Low jitter - stable"
              : jitterPercent < 50
              ? "⚠ Moderate jitter"
              : "⚠ High jitter - possible batching"}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <ScrollView style={{ flex: 1 }}>
        <View style={{ padding: 16 }}>
          <Text
            style={{
              color: "#cbd5e1",
              fontSize: 24,
              fontWeight: "700",
              marginBottom: 8,
            }}
          >
            Sensor Rate Diagnostics
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 14, marginBottom: 24 }}>
            Measure actual maximum sampling rates
          </Text>

          {/* Instructions */}
          <View
            style={{
              backgroundColor: "#1e293b",
              padding: 16,
              borderRadius: 12,
              marginBottom: 24,
            }}
          >
            <Text
              style={{
                color: "#cbd5e1",
                fontSize: 16,
                fontWeight: "600",
                marginBottom: 8,
              }}
            >
              Instructions:
            </Text>
            <Text style={{ color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>
              1. Tap "Start Recording" (uses MAX rate = 1ms interval)
            </Text>
            <Text style={{ color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>
              2. Wait 10-30 seconds for data collection
            </Text>
            <Text style={{ color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>
              3. Tap "Stop Recording"
            </Text>
            <Text style={{ color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>
              4. Tap "Analyze Data" to see results
            </Text>
            <Text style={{ color: "#94a3b8", fontSize: 13 }}>
              5. Repeat 2-3 times to confirm consistency
            </Text>
          </View>

          {/* Controls */}
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 24 }}
          >
            <Pressable
              onPress={isRecording ? stopRecording : startRecording}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 24,
                borderRadius: 12,
                backgroundColor: isRecording ? "#ef4444" : "#10b981",
                marginRight: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
                {isRecording
                  ? `Stop (${recordingDuration}s)`
                  : "Start Recording"}
              </Text>
            </Pressable>

            {!isRecording &&
              (accelSamples.length > 0 || gyroSamples.length > 0) && (
                <>
                  <Pressable
                    onPress={analyzeData}
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 24,
                      borderRadius: 12,
                      backgroundColor: "#3b82f6",
                      marginRight: 12,
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontWeight: "700",
                        fontSize: 16,
                      }}
                    >
                      Analyze Data
                    </Text>
                  </Pressable>

                  {(accelStats || gyroStats) && (
                    <Pressable
                      onPress={exportData}
                      style={{
                        paddingVertical: 14,
                        paddingHorizontal: 24,
                        borderRadius: 12,
                        backgroundColor: "#a855f7",
                        marginBottom: 12,
                      }}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontWeight: "700",
                          fontSize: 16,
                        }}
                      >
                        Export Report
                      </Text>
                    </Pressable>
                  )}
                </>
              )}
          </View>

          {/* Sample Counts */}
          <View style={{ flexDirection: "row", marginBottom: 24, gap: 12 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: "#1e293b",
                padding: 12,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>
                Accel Samples
              </Text>
              <Text
                style={{ color: "#cbd5e1", fontSize: 20, fontWeight: "700" }}
              >
                {accelSamples.length}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: "#1e293b",
                padding: 12,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>
                Gyro Samples
              </Text>
              <Text
                style={{ color: "#cbd5e1", fontSize: 20, fontWeight: "700" }}
              >
                {gyroSamples.length}
              </Text>
            </View>
          </View>

          {/* Results */}
          {renderStats("Accelerometer", accelStats)}
          {renderStats("Gyroscope", gyroStats)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
