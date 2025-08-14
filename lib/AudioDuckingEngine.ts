import { TalkgroupType, TalkgroupRoom, TALKGROUP_PRIORITIES, AudioDuckingState } from './types';

export interface SpeakerEvent {
  roomId: string;
  participantId: string;
  isSpeaking: boolean;
  timestamp: number;
}

export interface DuckingConfig {
  enabled: boolean;
  emergencyOverrideMs: number;
  staticSecondaryDuckMs: number;
  dynamicDuckMs: number;
  defaultHoldMs: number;
  maxSimultaneousSpeakers: number;
}

export class DMRAudioDuckingEngine {
  private audioContext: AudioContext;
  private masterGain: GainNode;
  private state: AudioDuckingState;
  private config: DuckingConfig;
  private roomData: Map<string, TalkgroupRoom>;
  private holdTimeouts: Map<string, NodeJS.Timeout>;

  constructor(audioContext: AudioContext, config?: Partial<DuckingConfig>) {
    this.audioContext = audioContext;
    this.masterGain = audioContext.createGain();
    this.masterGain.connect(audioContext.destination);
    
    this.state = {
      activeSpeakers: new Map(),
      gainNodes: new Map(),
      roomPriorities: new Map(),
      userSettings: new Map(),
    };
    
    this.config = {
      enabled: true,
      emergencyOverrideMs: 50,    // 50ms response for emergency
      staticSecondaryDuckMs: 100,  // 100ms for secondary static
      dynamicDuckMs: 150,          // 150ms for dynamic groups
      defaultHoldMs: 3000,         // 3 second default hold
      maxSimultaneousSpeakers: 3,  // Limit concurrent speakers
      ...config
    };
    
    this.roomData = new Map();
    this.holdTimeouts = new Map();
  }

  /**
   * Initialize rooms and create gain nodes for each talkgroup
   */
  initializeRooms(rooms: TalkgroupRoom[]): void {
    console.log('🔊 Initializing DMR audio ducking for rooms:', rooms.map(r => r.talkgroupName));
    
    rooms.forEach(room => {
      // Store room data for priority lookups
      this.roomData.set(room.roomName, room);
      this.state.roomPriorities.set(room.roomName, room.priority);
      
      // Create dedicated gain node for this room
      const gainNode = this.audioContext.createGain();
      gainNode.connect(this.masterGain);
      
      // Set initial volume based on user settings or defaults
      const userSetting = this.state.userSettings.get(room.roomName);
      const initialVolume = userSetting?.isMuted ? 0 : (userSetting?.volume ?? 1.0);
      gainNode.gain.setValueAtTime(initialVolume, this.audioContext.currentTime);
      
      this.state.gainNodes.set(room.roomName, gainNode);
      
      console.log(`🎛️  Created gain node for ${room.talkgroupName} (${room.type}, priority: ${room.priority})`);
    });
  }

  /**
   * Handle participant speaking events from LiveKit
   */
  onSpeakerEvent(event: SpeakerEvent): void {
    if (!this.config.enabled) return;

    const { roomId, participantId, isSpeaking, timestamp } = event;
    const speakerKey = `${roomId}:${participantId}`;
    const room = this.roomData.get(roomId);
    
    if (!room) {
      console.warn('🚨 Speaker event for unknown room:', roomId);
      return;
    }

    if (isSpeaking) {
      // Speaker started talking
      this.state.activeSpeakers.set(speakerKey, {
        roomId,
        priority: room.priority,
        startTime: timestamp,
      });
      
      console.log(`🎙️  Speaking started: ${room.talkgroupName} (priority: ${room.priority})`);
      
      // Clear any existing hold timeout for this room
      this.clearHoldTimeout(roomId);
      
      // Immediately update gain levels
      this.updateAllGainLevels();
      
    } else {
      // Speaker stopped talking
      const activeSpeaker = this.state.activeSpeakers.get(speakerKey);
      if (activeSpeaker) {
        this.state.activeSpeakers.delete(speakerKey);
        
        console.log(`🔇 Speaking ended: ${room.talkgroupName}`);
        
        // Start hold timer before restoring other audio
        const holdTime = room.holdTimeSeconds * 1000 || this.config.defaultHoldMs;
        this.startHoldTimeout(roomId, holdTime);
      }
    }
  }

  /**
   * Update gain levels for all rooms based on current speakers and priorities
   */
  private updateAllGainLevels(): void {
    if (this.state.activeSpeakers.size === 0) {
      // No active speakers - restore all volumes
      this.restoreAllVolumes();
      return;
    }

    // Find highest priority active speaker
    const speakerPriorities = Array.from(this.state.activeSpeakers.values()).map(s => s.priority);
    const highestPriority = Math.max(...speakerPriorities);
    const highestPriorityType = this.getPriorityType(highestPriority);
    
    console.log(`🎯 Highest active priority: ${highestPriority} (${highestPriorityType})`);

    // Apply ducking to all rooms based on the highest priority speaker
    this.state.gainNodes.forEach((gainNode, roomId) => {
      const room = this.roomData.get(roomId);
      if (!room) return;

      const targetGain = this.calculateTargetGain(room, highestPriorityType, highestPriority);
      const responseTime = this.getResponseTime(room.type);
      
      // Apply smooth gain transition
      gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        targetGain,
        this.audioContext.currentTime + responseTime / 1000
      );

      if (targetGain !== gainNode.gain.value) {
        console.log(`📉 Ducking ${room.talkgroupName}: ${gainNode.gain.value.toFixed(2)} → ${targetGain.toFixed(2)}`);
      }
    });
  }

  /**
   * Calculate target gain level for a room based on active speakers
   */
  private calculateTargetGain(
    room: TalkgroupRoom,
    highestPriorityType: TalkgroupType,
    highestPriority: number
  ): number {
    // Check if this room has an active speaker
    const hasActiveSpeaker = Array.from(this.state.activeSpeakers.values())
      .some(speaker => speaker.roomId === room.roomName);

    // If this room is actively speaking, maintain full volume
    if (hasActiveSpeaker) {
      return this.getUserVolume(room.roomName);
    }

    // Apply DMR ducking rules based on room type and active speaker priority
    const roomPriorityConfig = TALKGROUP_PRIORITIES[room.type];
    
    // Check if this room type should be ducked by the active speaker type
    if (roomPriorityConfig.duckingBehavior.duckedBy.includes(highestPriorityType)) {
      const duckLevel = TALKGROUP_PRIORITIES[highestPriorityType].duckingBehavior.duckLevel;
      return duckLevel * this.getUserVolume(room.roomName);
    }

    // For static-priority rooms (911/emergency), never duck them
    if (room.type === 'static-priority') {
      return this.getUserVolume(room.roomName);
    }

    // Default: maintain current volume if not explicitly ducked
    return this.getUserVolume(room.roomName);
  }

  /**
   * Start hold timeout before restoring audio levels
   */
  private startHoldTimeout(roomId: string, holdTimeMs: number): void {
    this.clearHoldTimeout(roomId);
    
    if (holdTimeMs > 0) {
      const timeout = setTimeout(() => {
        console.log(`⏰ Hold time expired for ${roomId}, updating gain levels`);
        this.updateAllGainLevels();
        this.holdTimeouts.delete(roomId);
      }, holdTimeMs);
      
      this.holdTimeouts.set(roomId, timeout);
    } else {
      // No hold time - update immediately
      this.updateAllGainLevels();
    }
  }

  /**
   * Clear existing hold timeout
   */
  private clearHoldTimeout(roomId: string): void {
    const existingTimeout = this.holdTimeouts.get(roomId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.holdTimeouts.delete(roomId);
    }
  }

  /**
   * Restore all volumes to user-set levels
   */
  private restoreAllVolumes(): void {
    console.log('🔊 Restoring all volumes to user settings');
    
    this.state.gainNodes.forEach((gainNode, roomId) => {
      const targetVolume = this.getUserVolume(roomId);
      gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        targetVolume,
        this.audioContext.currentTime + 0.2 // 200ms restoration
      );
    });
  }

  /**
   * Get user-configured volume for a room
   */
  private getUserVolume(roomId: string): number {
    const userSetting = this.state.userSettings.get(roomId);
    return userSetting?.isMuted ? 0 : (userSetting?.volume ?? 1.0);
  }

  /**
   * Get response time based on talkgroup type
   */
  private getResponseTime(type: TalkgroupType): number {
    switch (type) {
      case 'static-priority':
        return this.config.emergencyOverrideMs;
      case 'static-secondary':
        return this.config.staticSecondaryDuckMs;
      case 'dynamic':
      case 'adhoc':
        return this.config.dynamicDuckMs;
      default:
        return this.config.dynamicDuckMs;
    }
  }

  /**
   * Determine talkgroup type from priority level
   */
  private getPriorityType(priority: number): TalkgroupType {
    if (priority >= 100) return 'static-priority';
    if (priority >= 80) return 'static-secondary';
    if (priority >= 50) return 'dynamic';
    return 'adhoc';
  }

  /**
   * Update user settings for a specific room
   */
  setUserSettings(roomId: string, settings: Partial<{ isMuted: boolean; volume: number }>): void {
    const existing = this.state.userSettings.get(roomId) || {
      userId: 0,
      talkgroupId: 0,
      isMuted: false,
      volume: 1.0,
      joinedAt: new Date().toISOString(),
    };
    
    const updated = { ...existing, ...settings };
    this.state.userSettings.set(roomId, updated);
    
    console.log(`⚙️  Updated settings for ${roomId}:`, settings);
    
    // Apply settings immediately
    const gainNode = this.state.gainNodes.get(roomId);
    if (gainNode) {
      const targetVolume = updated.isMuted ? 0 : updated.volume;
      gainNode.gain.linearRampToValueAtTime(
        targetVolume,
        this.audioContext.currentTime + 0.1
      );
    }
  }

  /**
   * Connect a room's audio track to its gain node
   */
  connectRoomAudio(roomId: string, audioElement: HTMLAudioElement): void {
    const gainNode = this.state.gainNodes.get(roomId);
    if (!gainNode || !audioElement) {
      console.error('❌ Cannot connect audio: missing gain node or audio element');
      return;
    }

    try {
      // Create MediaElementAudioSourceNode and connect to gain node
      const source = this.audioContext.createMediaElementSource(audioElement);
      source.connect(gainNode);
      
      console.log(`🔗 Connected audio for room: ${roomId}`);
    } catch (error) {
      console.error('❌ Failed to connect room audio:', error);
    }
  }

  /**
   * Emergency override - immediately duck all other audio
   */
  emergencyOverride(roomId: string): void {
    console.log(`🚨 EMERGENCY OVERRIDE for room: ${roomId}`);
    
    // Immediately set all other rooms to minimum volume
    this.state.gainNodes.forEach((gainNode, otherRoomId) => {
      if (otherRoomId !== roomId) {
        gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.0, this.audioContext.currentTime);
      }
    });

    // Ensure emergency room is at full volume
    const emergencyGain = this.state.gainNodes.get(roomId);
    if (emergencyGain) {
      emergencyGain.gain.cancelScheduledValues(this.audioContext.currentTime);
      emergencyGain.gain.setValueAtTime(1.0, this.audioContext.currentTime);
    }
  }

  /**
   * Get current ducking statistics for debugging
   */
  getDuckingStats() {
    return {
      activeSpeakers: Array.from(this.state.activeSpeakers.entries()),
      roomVolumes: Array.from(this.state.gainNodes.entries()).map(([roomId, node]) => ({
        roomId,
        currentGain: node.gain.value,
        targetGain: node.gain.value, // TODO: track target separately
      })),
      config: this.config,
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Clear all timeouts
    this.holdTimeouts.forEach(timeout => clearTimeout(timeout));
    this.holdTimeouts.clear();
    
    // Disconnect audio nodes
    this.state.gainNodes.forEach(node => node.disconnect());
    this.masterGain.disconnect();
    
    console.log('🧹 Audio ducking engine destroyed');
  }
}
