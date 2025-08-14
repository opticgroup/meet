import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { TalkgroupRoom, TalkgroupType, MultiConnectionDetails, TALKGROUP_PRIORITIES } from './types';

export interface TalkgroupConnection {
  room: TalkgroupRoom;
  isJoined: boolean;
  isMuted: boolean;
  volume: number; // 0.0 - 1.0
  isActiveSpeaker: boolean;
  lastActivity?: Date;
}

export interface MultiTalkgroupState {
  // Connection State
  isConnected: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectionDetails: MultiConnectionDetails | null;
  
  // Talkgroup Management
  talkgroups: Map<string, TalkgroupConnection>; // roomId -> connection
  activeSpeakers: Set<string>; // roomIds currently speaking
  priorityOrder: string[]; // roomIds sorted by priority
  
  // Audio State
  masterVolume: number;
  isDuckingEnabled: boolean;
  isEmergencyActive: boolean;
  emergencyRoomId: string | null;
  
  // User Preferences (persisted)
  defaultVolume: number;
  autoJoinStatic: boolean;
  emergencyAlertEnabled: boolean;
  
  // Actions
  connect: (connectionDetails: MultiConnectionDetails) => void;
  disconnect: () => void;
  
  // Talkgroup Actions
  joinTalkgroup: (roomId: string) => void;
  leaveTalkgroup: (roomId: string) => void;
  toggleMute: (roomId: string) => void;
  setVolume: (roomId: string, volume: number) => void;
  
  // Audio Ducking Actions
  setSpeaking: (roomId: string, isSpeaking: boolean) => void;
  setEmergencyActive: (roomId: string | null) => void;
  
  // Settings Actions
  setMasterVolume: (volume: number) => void;
  setDuckingEnabled: (enabled: boolean) => void;
  
  // Utility Methods
  getTalkgroupsByType: (type: TalkgroupType) => TalkgroupConnection[];
  getHighestPriorityActive: () => TalkgroupConnection | null;
  calculateDuckingLevel: (roomId: string) => number;
}

export const useMultiTalkgroupStore = create<MultiTalkgroupState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial State
        isConnected: false,
        connectionStatus: 'disconnected',
        connectionDetails: null,
        talkgroups: new Map(),
        activeSpeakers: new Set(),
        priorityOrder: [],
        masterVolume: 0.8,
        isDuckingEnabled: true,
        isEmergencyActive: false,
        emergencyRoomId: null,
        
        // User Preferences (persisted)
        defaultVolume: 1.0,
        autoJoinStatic: true,
        emergencyAlertEnabled: true,

        // Connection Actions
        connect: (connectionDetails: MultiConnectionDetails) => {
          const talkgroupsMap = new Map<string, TalkgroupConnection>();
          const priorityOrder: string[] = [];

          // Create talkgroup connections from rooms
          connectionDetails.rooms.forEach(room => {
            const connection: TalkgroupConnection = {
              room,
              isJoined: get().autoJoinStatic && room.type.startsWith('static'),
              isMuted: false,
              volume: get().defaultVolume,
              isActiveSpeaker: false,
            };
            talkgroupsMap.set(room.roomName, connection);
            priorityOrder.push(room.roomName);
          });

          // Sort by priority (highest first)
          priorityOrder.sort((a, b) => {
            const roomA = talkgroupsMap.get(a)!.room;
            const roomB = talkgroupsMap.get(b)!.room;
            return roomB.priority - roomA.priority;
          });

          set({
            isConnected: true,
            connectionStatus: 'connected',
            connectionDetails,
            talkgroups: talkgroupsMap,
            priorityOrder,
          });

          console.log('🔗 Connected to multi-talkgroup system:', connectionDetails.rooms.length, 'rooms');
        },

        disconnect: () => {
          set({
            isConnected: false,
            connectionStatus: 'disconnected',
            connectionDetails: null,
            talkgroups: new Map(),
            activeSpeakers: new Set(),
            priorityOrder: [],
            isEmergencyActive: false,
            emergencyRoomId: null,
          });
          console.log('🔌 Disconnected from multi-talkgroup system');
        },

        // Talkgroup Actions
        joinTalkgroup: (roomId: string) => {
          const talkgroups = new Map(get().talkgroups);
          const connection = talkgroups.get(roomId);
          
          if (connection) {
            connection.isJoined = true;
            talkgroups.set(roomId, connection);
            set({ talkgroups });
            console.log('📞 Joined talkgroup:', connection.room.talkgroupName);
          }
        },

        leaveTalkgroup: (roomId: string) => {
          const talkgroups = new Map(get().talkgroups);
          const connection = talkgroups.get(roomId);
          
          if (connection) {
            connection.isJoined = false;
            connection.isActiveSpeaker = false;
            talkgroups.set(roomId, connection);
            
            // Remove from active speakers
            const activeSpeakers = new Set(get().activeSpeakers);
            activeSpeakers.delete(roomId);
            
            set({ talkgroups, activeSpeakers });
            console.log('📵 Left talkgroup:', connection.room.talkgroupName);
          }
        },

        toggleMute: (roomId: string) => {
          const talkgroups = new Map(get().talkgroups);
          const connection = talkgroups.get(roomId);
          
          if (connection) {
            connection.isMuted = !connection.isMuted;
            talkgroups.set(roomId, connection);
            set({ talkgroups });
            
            const action = connection.isMuted ? 'Muted' : 'Unmuted';
            console.log(`🔇 ${action} talkgroup:`, connection.room.talkgroupName);
          }
        },

        setVolume: (roomId: string, volume: number) => {
          const talkgroups = new Map(get().talkgroups);
          const connection = talkgroups.get(roomId);
          
          if (connection) {
            connection.volume = Math.max(0, Math.min(1, volume));
            talkgroups.set(roomId, connection);
            set({ talkgroups });
            console.log('🔊 Set volume for', connection.room.talkgroupName, ':', volume);
          }
        },

        // Audio Ducking Actions
        setSpeaking: (roomId: string, isSpeaking: boolean) => {
          const talkgroups = new Map(get().talkgroups);
          const connection = talkgroups.get(roomId);
          
          if (connection && connection.isJoined) {
            connection.isActiveSpeaker = isSpeaking;
            connection.lastActivity = isSpeaking ? new Date() : connection.lastActivity;
            talkgroups.set(roomId, connection);
            
            // Update active speakers set
            const activeSpeakers = new Set(get().activeSpeakers);
            if (isSpeaking) {
              activeSpeakers.add(roomId);
            } else {
              activeSpeakers.delete(roomId);
            }
            
            // Check for emergency activation
            let isEmergencyActive = false;
            let emergencyRoomId = null;
            
            if (connection.room.type === 'static-priority' && isSpeaking) {
              isEmergencyActive = true;
              emergencyRoomId = roomId;
            }
            
            set({ 
              talkgroups, 
              activeSpeakers, 
              isEmergencyActive, 
              emergencyRoomId 
            });
            
            const speakingAction = isSpeaking ? 'started' : 'stopped';
            console.log(`🎙️ ${connection.room.talkgroupName} ${speakingAction} speaking (priority: ${connection.room.priority})`);
          }
        },

        setEmergencyActive: (roomId: string | null) => {
          set({ 
            isEmergencyActive: roomId !== null, 
            emergencyRoomId: roomId 
          });
          
          if (roomId) {
            const connection = get().talkgroups.get(roomId);
            console.log('🚨 EMERGENCY ACTIVATED:', connection?.room.talkgroupName);
          } else {
            console.log('✅ Emergency cleared');
          }
        },

        // Settings Actions
        setMasterVolume: (volume: number) => {
          set({ masterVolume: Math.max(0, Math.min(1, volume)) });
          console.log('🔊 Master volume:', volume);
        },

        setDuckingEnabled: (enabled: boolean) => {
          set({ isDuckingEnabled: enabled });
          console.log('🎛️ Audio ducking:', enabled ? 'enabled' : 'disabled');
        },

        // Utility Methods
        getTalkgroupsByType: (type: TalkgroupType) => {
          const talkgroups = get().talkgroups;
          return Array.from(talkgroups.values()).filter(connection => 
            connection.room.type === type
          );
        },

        getHighestPriorityActive: () => {
          const { talkgroups, activeSpeakers, priorityOrder } = get();
          
          for (const roomId of priorityOrder) {
            if (activeSpeakers.has(roomId)) {
              const connection = talkgroups.get(roomId);
              if (connection?.isActiveSpeaker) {
                return connection;
              }
            }
          }
          return null;
        },

        calculateDuckingLevel: (roomId: string) => {
          const { talkgroups, activeSpeakers, isDuckingEnabled, isEmergencyActive } = get();
          const connection = talkgroups.get(roomId);
          
          if (!connection || !isDuckingEnabled || connection.isMuted) {
            return connection?.isMuted ? 0 : (connection?.volume ?? 1);
          }
          
          // If this room is actively speaking, maintain full volume
          if (connection.isActiveSpeaker) {
            return connection.volume;
          }
          
          // Emergency override - duck everything else
          if (isEmergencyActive && !connection.room.type.includes('static-priority')) {
            return 0.0;
          }
          
          // Find highest priority active speaker
          const highestPriorityActive = get().getHighestPriorityActive();
          if (!highestPriorityActive) {
            return connection.volume; // No active speakers, maintain volume
          }
          
          // Apply DMR ducking rules
          const roomPriorityConfig = TALKGROUP_PRIORITIES[connection.room.type];
          const activeSpeakerType = highestPriorityActive.room.type;
          
          if (roomPriorityConfig.duckingBehavior.duckedBy.includes(activeSpeakerType)) {
            const speakerPriorityConfig = TALKGROUP_PRIORITIES[activeSpeakerType];
            return speakerPriorityConfig.duckingBehavior.duckLevel * connection.volume;
          }
          
          return connection.volume;
        },
      }),
      {
        name: 'multi-talkgroup-store',
        partialize: (state) => ({
          // Only persist user preferences
          defaultVolume: state.defaultVolume,
          autoJoinStatic: state.autoJoinStatic,
          emergencyAlertEnabled: state.emergencyAlertEnabled,
          masterVolume: state.masterVolume,
          isDuckingEnabled: state.isDuckingEnabled,
        }),
        // Custom serializer for Map objects
        serialize: (state) => JSON.stringify({
          ...state,
          talkgroups: Array.from(state.talkgroups.entries()),
          activeSpeakers: Array.from(state.activeSpeakers),
        }),
        deserialize: (str) => {
          const parsed = JSON.parse(str);
          return {
            ...parsed,
            talkgroups: new Map(parsed.talkgroups || []),
            activeSpeakers: new Set(parsed.activeSpeakers || []),
          };
        },
      }
    ),
    {
      name: 'multi-talkgroup-store',
    }
  )
);
