import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  Platform,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  RecordingData,
  loadRecordingsIndex,
  deleteRecording,
  shareRecording,
  getRecordingDetails,
} from "../../utils/recordings-storage";

export default function RecordingsScreen() {
  const [recordings, setRecordings] = useState<RecordingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecordings = useCallback(async () => {
    try {
      const recordingsData = await loadRecordingsIndex();
      // Sort by timestamp, newest first
      recordingsData.sort((a: RecordingData, b: RecordingData) => b.timestamp - a.timestamp);
      setRecordings(recordingsData);
    } catch (error) {
      Alert.alert("Error", `Failed to load recordings: ${error}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadRecordings();
  }, [loadRecordings]);

  const handleDelete = (recording: RecordingData) => {
    Alert.alert(
      "Delete Recording",
      `Are you sure you want to delete "${recording.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteRecording(recording.id);
              await loadRecordings();
              Alert.alert("Success", "Recording deleted successfully");
            } catch (error) {
              Alert.alert("Error", `Failed to delete recording: ${error}`);
            }
          },
        },
      ]
    );
  };

  const handleShare = async (recording: RecordingData) => {
    try {
      await shareRecording(recording);
    } catch (error) {
      Alert.alert("Error", `Failed to share recording: ${error}`);
    }
  };

  const handleViewDetails = async (recording: RecordingData) => {
    try {
      const details = await getRecordingDetails(recording);
      Alert.alert("Recording Details", details);
    } catch (error) {
      Alert.alert("Error", `Failed to load details: ${error}`);
    }
  };

  const getTypeIcon = (type: RecordingData['type']) => {
    switch (type) {
      case 'accelerometer':
        return '📱';
      case 'gyroscope':
        return '🎯';
      case 'microphone':
        return '🎤';
      case 'all':
        return '📊';
      default:
        return '📄';
    }
  };

  const getTypeColor = (type: RecordingData['type']) => {
    switch (type) {
      case 'accelerometer':
        return '#22c55e';
      case 'gyroscope':
        return '#3b82f6';
      case 'microphone':
        return '#a855f7';
      case 'all':
        return '#f59e0b';
      default:
        return '#64748b';
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const renderRecordingItem = ({ item }: { item: RecordingData }) => (
    <View
      style={{
        backgroundColor: "#111827",
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 16,
        marginVertical: 6,
        borderLeftWidth: 4,
        borderLeftColor: getTypeColor(item.type),
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <Text style={{ fontSize: 20, marginRight: 8 }}>{getTypeIcon(item.type)}</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: "#e5e7eb",
              fontSize: 16,
              fontWeight: "600",
            }}
          >
            {item.name}
          </Text>
          <Text style={{ color: "#9aa4b2", fontSize: 12, textTransform: "capitalize" }}>
            {item.type} • {formatDate(item.timestamp)}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: "#9aa4b2", fontSize: 14 }}>
          Files: {item.fileNames.length}
          {item.rowCount !== undefined && ` • Data points: ${item.rowCount}`}
        </Text>
        {item.fileNames.length > 0 && (
          <Text style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
            {item.fileNames.join(", ")}
          </Text>
        )}
      </View>

      {/* Actions */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pressable
          onPress={() => handleViewDetails(item)}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: "#374151",
          }}
        >
          <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>
            Details
          </Text>
        </Pressable>

        <Pressable
          onPress={() => handleShare(item)}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: "#3b82f6",
          }}
        >
          <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>
            Share
          </Text>
        </Pressable>

        <Pressable
          onPress={() => handleDelete(item)}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: "#ef4444",
          }}
        >
          <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>
            Delete
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
      }}
    >
      <Text style={{ fontSize: 48, marginBottom: 16 }}>📄</Text>
      <Text
        style={{
          color: "#cbd5e1",
          fontSize: 18,
          fontWeight: "600",
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        No Recordings Yet
      </Text>
      <Text
        style={{
          color: "#9aa4b2",
          fontSize: 14,
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        Start recording sensor data from the other tabs to see your recordings here.
        Use the save button on each sensor page to save readings with custom names.
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={{ padding: 16 }}>
      <Text
        style={{
          color: "#cbd5e1",
          fontSize: 24,
          fontWeight: "700",
          marginBottom: 8,
        }}
      >
        Recordings
      </Text>
      <Text style={{ color: "#9aa4b2", marginBottom: 16 }}>
        Your saved sensor recordings ({recordings.length})
      </Text>

      {recordings.length > 0 && (
        <View
          style={{
            flexDirection: "row",
            backgroundColor: "#111827",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#e5e7eb", fontSize: 14, marginBottom: 4 }}>
              📱 Accelerometer: {recordings.filter(r => r.type === 'accelerometer').length}
            </Text>
            <Text style={{ color: "#e5e7eb", fontSize: 14, marginBottom: 4 }}>
              🎯 Gyroscope: {recordings.filter(r => r.type === 'gyroscope').length}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#e5e7eb", fontSize: 14, marginBottom: 4 }}>
              🎤 Microphone: {recordings.filter(r => r.type === 'microphone').length}
            </Text>
            <Text style={{ color: "#e5e7eb", fontSize: 14, marginBottom: 4 }}>
              📊 All Sensors: {recordings.filter(r => r.type === 'all').length}
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0f12" }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#9aa4b2", fontSize: 16 }}>Loading recordings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0f12" }}>
      <FlatList
        data={recordings}
        keyExtractor={(item) => item.id}
        renderItem={renderRecordingItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={handleRefresh}
            tintColor="#9aa4b2"
            colors={["#3b82f6"]}
          />
        }
        showsVerticalScrollIndicator={true}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: 20,
        }}
      />
    </SafeAreaView>
  );
}