import { 
  Room, 
  RoomEvent, 
  RemoteTrack, 
  RemoteTrackPublication,
  RemoteParticipant,
  Track,
  AudioTrack,
  ConnectionQuality,
  ConnectionState,
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
   * Connect to individual talkgroup room with retry logic
   */
  private async connectToRoom(roomInfo: TalkgroupRoom, token: string, serverUrl: string): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`🔗 Attempting to connect to ${roomInfo.talkgroupName} (attempt ${retryCount + 1}/${maxRetries})`);
        
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          // Add connection timeout and retry options
          reconnectPolicy: {
            nextRetryDelayInMs: (context) => {
              const delay = Math.min(1000 * Math.pow(2, context.retryCount), 10000);
              console.log(`⏱️ Next retry for ${roomInfo.talkgroupName} in ${delay}ms`);
              return delay;
            },
          },
        });

        // Set up room event handlers first
        this.setupRoomEventHandlers(room, roomInfo);
        
        // Add pre-connection error handling
        const connectPromise = room.connect(serverUrl, token);
        
        // Set a reasonable timeout for connection
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Connection timeout after 15 seconds for ${roomInfo.talkgroupName}`));
          }, 15000);
        });
        
        await Promise.race([connectPromise, timeoutPromise]);
        
        // Verify connection state
        if (room.state !== 'connected') {
          throw new Error(`Room connection failed - state: ${room.state}`);
        }
        
        // Store room reference
        this.rooms.set(roomInfo.roomName, room);
        
        console.log(`✅ Successfully connected to room: ${roomInfo.talkgroupName} (${roomInfo.type})`);
        return; // Success, exit retry loop
        
      } catch (error) {
        console.error(`❌ Connection attempt ${retryCount + 1} failed for ${roomInfo.talkgroupName}:`, error);
        retryCount++;
        
        if (retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
          console.log(`⏳ Retrying connection to ${roomInfo.talkgroupName} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`💥 Failed to connect to ${roomInfo.talkgroupName} after ${maxRetries} attempts`);
          throw error;
        }
      }
    }
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

    // DataChannel error handling
    room.on(RoomEvent.DataReceived, (payload, participant, kind) => {
      console.log(`📨 Data received from ${roomInfo.talkgroupName}:`, { participant: participant?.identity, kind, payload });
    });

    // Connection state changed
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      console.log(`🔗 Connection state changed for ${roomInfo.talkgroupName}:`, state);
      // Log connection issues for debugging
      if (state !== ConnectionState.Connected) {
        console.warn(`⚠️ Connection state issue for ${roomInfo.talkgroupName}: ${state}`);
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

    // Media devices error
    room.on(RoomEvent.MediaDevicesError, (error) => {
      console.error(`📱 Media devices error for ${roomInfo.talkgroupName}:`, error);
    });

    // Participant permissions changed (might help with transmission issues)
    room.on(RoomEvent.LocalTrackPublished, (publication, participant) => {
      console.log(`📤 Local track published for ${roomInfo.talkgroupName}:`, { kind: publication.kind, participant: participant.identity });
    });

    room.on(RoomEvent.LocalTrackUnpublished, (publication, participant) => {
      console.log(`📤 Local track unpublished for ${roomInfo.talkgroupName}:`, { kind: publication.kind, participant: participant.identity });
    });
  }

  /**
   * Handle incoming audio track and connect to ducking engine
   */
  private handleIncomingAudioTrack(track: AudioTrack, roomInfo: TalkgroupRoom, participant: RemoteParticipant): void {
    console.log(`🔊 Audio track subscribed from ${roomInfo.talkgroupName}:`, participant.identity);
    console.log('🎵 Track details:', {
      kind: track.kind,
      muted: track.muted,
      mediaStreamTrack: track.mediaStreamTrack?.id,
      readyState: track.mediaStreamTrack?.readyState
    });
    
    // Get the audio element
    const audioElement = track.attach() as HTMLAudioElement;
    audioElement.autoplay = true;
    audioElement.volume = 1.0; // Ensure full volume
    audioElement.muted = false; // Ensure not muted
    
    console.log('🎧 Audio element created:', {
      volume: audioElement.volume,
      muted: audioElement.muted,
      autoplay: audioElement.autoplay,
      srcObject: !!audioElement.srcObject
    });
    
    // Add event listeners for debugging
    audioElement.addEventListener('loadstart', () => console.log(`🎵 Audio loading started for ${participant.identity}`));
    audioElement.addEventListener('canplay', () => console.log(`🎵 Audio can play for ${participant.identity}`));
    audioElement.addEventListener('playing', () => console.log(`🎵 Audio playing for ${participant.identity}`));
    audioElement.addEventListener('error', (e) => console.error(`❌ Audio error for ${participant.identity}:`, e));
    audioElement.addEventListener('stalled', () => console.warn(`⚠️ Audio stalled for ${participant.identity}`));
    
    // Connect to ducking engine
    if (this.duckingEngine) {
      console.log(`🔀 Connecting audio to ducking engine for ${roomInfo.talkgroupName}`);
      this.duckingEngine.connectRoomAudio(roomInfo.roomName, audioElement);
    }
    
    // Add to DOM (hidden)
    audioElement.style.display = 'none';
    audioElement.setAttribute('data-room', roomInfo.roomName);
    audioElement.setAttribute('data-participant', participant.identity);
    document.body.appendChild(audioElement);
    
    console.log(`🎯 Audio element added to DOM for ${roomInfo.talkgroupName}/${participant.identity}`);
    
    // Clean up when track ends
    track.on('ended', () => {
      console.log(`🔚 Audio track ended for ${participant.identity}`);
      audioElement.remove();
    });
    
    // Log audio elements count
    const totalAudioElements = document.querySelectorAll('audio').length;
    console.log(`📊 Total audio elements in DOM: ${totalAudioElements}`);
  }

  /**
   * Join a specific talkgroup room
   */
  async joinRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.error(`❌ Room ${roomId} not found`);
      return;
    }
    
    if (room.state !== 'connected') {
      console.error(`❌ Room ${roomId} is not connected (state: ${room.state})`);
      return;
    }
    
    try {
      // Update store first to reflect UI state
      this.store.joinTalkgroup(roomId);
      
      // Enable microphone for this room (but don't require it to succeed)
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        console.log(`🎤 Microphone enabled for ${roomId}`);
      } catch (micError) {
        console.warn(`⚠️ Could not enable microphone for ${roomId}:`, micError);
        // Continue anyway - user can still listen
      }
      
      console.log(`📞 Joined talkgroup room: ${roomId}`);
    } catch (error) {
      console.error(`❌ Error joining room ${roomId}:`, error);
      throw error;
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
    if (!room) {
      console.error(`❌ Room ${roomId} not found for push-to-talk`);
      return;
    }
    
    if (room.state !== 'connected') {
      console.error(`❌ Room ${roomId} not connected (state: ${room.state}) - cannot set push-to-talk`);
      return;
    }
    
    try {
      console.log(`🎙️ ${enabled ? 'Enabling' : 'Disabling'} microphone for room ${roomId}`);
      await room.localParticipant.setMicrophoneEnabled(enabled);
      console.log(`✅ Microphone ${enabled ? 'enabled' : 'disabled'} for room ${roomId}`);
    } catch (error) {
      console.error(`❌ Failed to ${enabled ? 'enable' : 'disable'} microphone for room ${roomId}:`, error);
      throw error;
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
