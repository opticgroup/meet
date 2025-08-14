import { 
  Room, 
  RoomEvent, 
  RemoteTrack, 
  RemoteTrackPublication,
  RemoteParticipant,
  Track,
  AudioTrack,
  ConnectionQuality,
} from 'livekit-client';
import { MultiConnectionDetails, TalkgroupRoom } from './types';
import { DMRAudioDuckingEngine, SpeakerEvent } from './AudioDuckingEngine';
import { useMultiTalkgroupStore } from './multiTalkgroupStore';

export class MultiRoomLiveKitClient {
  private rooms: Map<string, Room> = new Map();
  private audioContext: AudioContext | null = null;
  private duckingEngine: DMRAudioDuckingEngine | null = null;
  private connectionDetails: MultiConnectionDetails | null = null;
  private store: ReturnType<typeof useMultiTalkgroupStore.getState>;

  constructor() {
    // Get store instance
    this.store = useMultiTalkgroupStore.getState();
  }

  /**
   * Connect to multiple talkgroup rooms with single token
   */
  async connect(connectionDetails: MultiConnectionDetails): Promise<void> {
    try {
      console.log('🔗 Connecting to', connectionDetails.rooms.length, 'talkgroup rooms...');
      
      this.connectionDetails = connectionDetails;
      
      // Initialize audio context and ducking engine
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.duckingEngine = new DMRAudioDuckingEngine(this.audioContext);
      
      // Initialize ducking engine with rooms
      this.duckingEngine.initializeRooms(connectionDetails.rooms);
      
      // Connect to each room
      const connectionPromises = connectionDetails.rooms.map(room => 
        this.connectToRoom(room, connectionDetails.participantToken, connectionDetails.serverUrl)
      );
      
      await Promise.all(connectionPromises);
      
      // Update store
      this.store.connect(connectionDetails);
      
      console.log('✅ Connected to all talkgroup rooms successfully');
      
    } catch (error) {
      console.error('❌ Failed to connect to multi-room system:', error);
      throw error;
    }
  }

  /**
   * Connect to individual talkgroup room
   */
  private async connectToRoom(roomInfo: TalkgroupRoom, token: string, serverUrl: string): Promise<void> {
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Set up room event handlers
    this.setupRoomEventHandlers(room, roomInfo);
    
    // Connect to room
    await room.connect(serverUrl, token);
    
    // Store room reference
    this.rooms.set(roomInfo.roomName, room);
    
    console.log(`📞 Connected to room: ${roomInfo.talkgroupName} (${roomInfo.type})`);
  }

  /**
   * Set up event handlers for a room
   */
  private setupRoomEventHandlers(room: Room, roomInfo: TalkgroupRoom): void {
    // Track subscribed (incoming audio)
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        this.handleIncomingAudioTrack(track as AudioTrack, roomInfo, participant);
      }
    });

    // Track unsubscribed
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        console.log(`🔇 Audio track unsubscribed from ${roomInfo.talkgroupName}:`, participant.identity);
      }
    });

    // Speaking detection
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const isSpeaking = speakers.length > 0;
      
      // Notify ducking engine
      if (this.duckingEngine) {
        const speakerEvent: SpeakerEvent = {
          roomId: roomInfo.roomName,
          participantId: speakers[0]?.identity || 'unknown',
          isSpeaking,
          timestamp: Date.now(),
        };
        this.duckingEngine.onSpeakerEvent(speakerEvent);
      }
      
      // Update store
      this.store.setSpeaking(roomInfo.roomName, isSpeaking);
      
      if (isSpeaking) {
        console.log(`🎙️ Active speaker in ${roomInfo.talkgroupName}:`, speakers[0]?.identity);
      }
    });

    // Connection quality
    room.on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant) => {
      if (!participant) { // Local participant
        console.log(`📊 Connection quality for ${roomInfo.talkgroupName}:`, quality);
      }
    });

    // Disconnected
    room.on(RoomEvent.Disconnected, (reason) => {
      console.log(`🔌 Disconnected from ${roomInfo.talkgroupName}:`, reason);
      this.rooms.delete(roomInfo.roomName);
    });

    // Reconnecting
    room.on(RoomEvent.Reconnecting, () => {
      console.log(`🔄 Reconnecting to ${roomInfo.talkgroupName}...`);
    });

    // Reconnected
    room.on(RoomEvent.Reconnected, () => {
      console.log(`✅ Reconnected to ${roomInfo.talkgroupName}`);
    });
  }

  /**
   * Handle incoming audio track and connect to ducking engine
   */
  private handleIncomingAudioTrack(track: AudioTrack, roomInfo: TalkgroupRoom, participant: RemoteParticipant): void {
    console.log(`🔊 Audio track subscribed from ${roomInfo.talkgroupName}:`, participant.identity);
    
    // Get the audio element
    const audioElement = track.attach() as HTMLAudioElement;
    audioElement.autoplay = true;
    // playsInline is for video elements, not needed for audio
    
    // Connect to ducking engine
    if (this.duckingEngine) {
      this.duckingEngine.connectRoomAudio(roomInfo.roomName, audioElement);
    }
    
    // Add to DOM (hidden)
    audioElement.style.display = 'none';
    document.body.appendChild(audioElement);
    
    // Clean up when track ends
    track.on('ended', () => {
      audioElement.remove();
    });
  }

  /**
   * Join a specific talkgroup room
   */
  async joinRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room && room.state === 'connected') {
      // Enable microphone for this room
      await room.localParticipant.setMicrophoneEnabled(true);
      this.store.joinTalkgroup(roomId);
      console.log(`📞 Joined talkgroup room: ${roomId}`);
    }
  }

  /**
   * Leave a specific talkgroup room
   */
  async leaveRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) {
      // Disable microphone for this room
      await room.localParticipant.setMicrophoneEnabled(false);
      this.store.leaveTalkgroup(roomId);
      console.log(`📵 Left talkgroup room: ${roomId}`);
    }
  }

  /**
   * Mute/unmute audio for a specific room
   */
  muteRoom(roomId: string, muted: boolean): void {
    if (this.duckingEngine) {
      this.duckingEngine.setUserSettings(roomId, { isMuted: muted });
    }
    this.store.toggleMute(roomId);
  }

  /**
   * Set volume for a specific room
   */
  setRoomVolume(roomId: string, volume: number): void {
    if (this.duckingEngine) {
      this.duckingEngine.setUserSettings(roomId, { volume });
    }
    this.store.setVolume(roomId, volume);
  }

  /**
   * Enable/disable push-to-talk for a room
   */
  async setPushToTalk(roomId: string, enabled: boolean): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) {
      await room.localParticipant.setMicrophoneEnabled(enabled);
    }
  }

  /**
   * Trigger emergency override
   */
  emergencyOverride(roomId: string): void {
    if (this.duckingEngine) {
      this.duckingEngine.emergencyOverride(roomId);
    }
    this.store.setEmergencyActive(roomId);
    console.log(`🚨 Emergency override activated for room: ${roomId}`);
  }

  /**
   * Get connection statistics for all rooms
   */
  getConnectionStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    this.rooms.forEach((room, roomId) => {
      stats[roomId] = {
        state: room.state,
        numParticipants: room.numParticipants,
        localParticipant: {
          identity: room.localParticipant.identity,
          isMicrophoneEnabled: room.localParticipant.isMicrophoneEnabled,
        },
        remoteParticipants: Array.from(room.remoteParticipants.values()).map(p => ({
          identity: p.identity,
          connectionQuality: p.connectionQuality,
        })),
      };
    });
    
    // Add ducking engine stats
    if (this.duckingEngine) {
      stats._duckingEngine = this.duckingEngine.getDuckingStats();
    }
    
    return stats;
  }

  /**
   * Disconnect from all rooms
   */
  async disconnect(): Promise<void> {
    console.log('🔌 Disconnecting from all talkgroup rooms...');
    
    // Disconnect from all rooms
    const disconnectPromises = Array.from(this.rooms.values()).map(room => 
      room.disconnect()
    );
    
    await Promise.all(disconnectPromises);
    
    // Clean up audio context and ducking engine
    if (this.duckingEngine) {
      this.duckingEngine.destroy();
      this.duckingEngine = null;
    }
    
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    
    // Clear state
    this.rooms.clear();
    this.connectionDetails = null;
    this.store.disconnect();
    
    console.log('✅ Disconnected from all talkgroup rooms');
  }

  /**
   * Get room by ID
   */
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get all rooms
   */
  getAllRooms(): Map<string, Room> {
    return new Map(this.rooms);
  }

  /**
   * Check if connected to any rooms
   */
  get isConnected(): boolean {
    return this.rooms.size > 0 && Array.from(this.rooms.values()).some(room => room.state === 'connected');
  }

  /**
   * Get ducking engine instance
   */
  get duckingEngineInstance(): DMRAudioDuckingEngine | null {
    return this.duckingEngine;
  }
}
