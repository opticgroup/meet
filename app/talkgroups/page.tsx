'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MultiConnectionDetails } from '@/lib/types';
import { MultiRoomLiveKitClient } from '@/lib/MultiRoomLiveKitClient';
import { useMultiTalkgroupStore } from '@/lib/multiTalkgroupStore';
import { formatChatMessageLinks, RoomContext, VideoConference, GridLayout, ParticipantTile, TrackReferenceOrPlaceholder, useTracks } from '@livekit/components-react';
import { Room, Track, RemoteParticipant, LocalParticipant } from 'livekit-client';
import styles from '../../styles/Home.module.css';

// Add CSS animations
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.05);
        opacity: 0.8;
      }
      100% {
        transform: scale(1);
        opacity: 1;
      }
    }
  `;
  if (!document.head.querySelector('style[data-talkgroup-animations]')) {
    style.setAttribute('data-talkgroup-animations', 'true');
    document.head.appendChild(style);
  }
}

// Dispatch console color scheme with yellow accents
const THEME_COLORS = {
  background: '#0a0a0a',
  cardBackground: '#1a1a1a',
  headerBackground: '#1f1f1f',
  borderColor: '#333333',
  textPrimary: '#ffffff',
  textSecondary: '#cccccc',
  textMuted: '#888888',
  accent: '#fbbf24', // yellow
  accentHover: '#f59e0b',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
};

const PRIORITY_COLORS = {
  'static-priority': THEME_COLORS.danger, // red for emergency
  'static-secondary': THEME_COLORS.warning, // amber for general
  'dynamic': '#3b82f6', // blue for dynamic
  'adhoc': '#8b5cf6', // purple for adhoc
};

export default function TalkGroupsPage() {
  const clientRef = useRef<MultiRoomLiveKitClient | null>(null);
  const [participantName, setParticipantName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTransmitRoom, setSelectedTransmitRoom] = useState<string>('');

  // Zustand store
  const {
    isConnected,
    connectionStatus,
    talkgroups,
    priorityOrder,
    activeSpeakers,
    isEmergencyActive,
    masterVolume,
    isDuckingEnabled,
    
    // Actions
    joinTalkgroup,
    leaveTalkgroup,
    toggleMute,
    setVolume,
    setMasterVolume,
    setDuckingEnabled,
  } = useMultiTalkgroupStore();

  // Default talkgroups to join
  const DEFAULT_TALKGROUPS = [1, 2, 3]; // 911, General, R&D

  const handleConnect = useCallback(async () => {
    if (!participantName.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get multi-connection details from API
      const response = await fetch('/api/multi-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          participantName: participantName.trim(),
          talkgroupIds: DEFAULT_TALKGROUPS,
          metadata: `Multi-talkgroup connection for ${participantName}`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Connection failed: ${errorText}`);
      }

      const connectionDetails: MultiConnectionDetails = await response.json();
      
      // Initialize LiveKit client
      if (!clientRef.current) {
        clientRef.current = new MultiRoomLiveKitClient();
      }
      
      // Connect to all rooms
      await clientRef.current.connect(connectionDetails);
      
      setIsLoading(false);
      console.log('🎉 Successfully connected to multi-talkgroup system');
      
    } catch (error) {
      console.error('❌ Connection error:', error);
      setError(error instanceof Error ? error.message : 'Connection failed');
      setIsLoading(false);
    }
  }, [participantName, DEFAULT_TALKGROUPS]);

  const handleDisconnect = useCallback(async () => {
    if (clientRef.current) {
      await clientRef.current.disconnect();
      clientRef.current = null;
    }
    console.log('👋 Disconnected from multi-talkgroup system');
  }, []);

  const handleJoinRoom = useCallback(async (roomId: string) => {
    if (clientRef.current) {
      await clientRef.current.joinRoom(roomId);
    }
  }, []);

  const handleLeaveRoom = useCallback(async (roomId: string) => {
    if (clientRef.current) {
      await clientRef.current.leaveRoom(roomId);
    }
  }, []);

  const handleToggleMute = useCallback((roomId: string) => {
    const connection = talkgroups.get(roomId);
    if (connection && clientRef.current) {
      const newMutedState = !connection.isMuted;
      clientRef.current.muteRoom(roomId, newMutedState);
    }
  }, [talkgroups]);

  const handleVolumeChange = useCallback((roomId: string, volume: number) => {
    if (clientRef.current) {
      clientRef.current.setRoomVolume(roomId, volume);
    }
  }, []);

  const handleEmergencyOverride = useCallback((roomId: string) => {
    if (clientRef.current) {
      clientRef.current.emergencyOverride(roomId);
    }
  }, []);

  // DMR Transmission Logic - selects talkgroup for transmission
  const handleTransmitRoomChange = useCallback(async (roomId: string) => {
    console.log(`📡 Attempting to select transmit room: ${roomId}`);
    
    // Check if the selected room is joined
    const selectedConnection = talkgroups.get(roomId);
    if (!selectedConnection || !selectedConnection.isJoined) {
      console.error(`❌ Cannot select ${roomId} for transmission - room not joined`);
      return;
    }
    
    setSelectedTransmitRoom(roomId);
    
    if (!clientRef.current) {
      console.error(`❌ No client reference available`);
      return;
    }
    
    try {
      console.log(`🎙️ Setting up transmission for room: ${roomId}`);
      
      // First disable microphone for all rooms
      const currentTalkgroups = Array.from(talkgroups.values());
      const disablePromises = currentTalkgroups
        .filter(connection => connection.isJoined && connection.room.roomName !== roomId)
        .map(async (connection) => {
          console.log(`🔇 Disabling microphone for: ${connection.room.roomName}`);
          try {
            await clientRef.current?.setPushToTalk(connection.room.roomName, false);
          } catch (error) {
            console.warn(`⚠️ Failed to disable mic for ${connection.room.roomName}:`, error);
          }
        });
      
      await Promise.all(disablePromises);
      
      // Then enable microphone for selected room
      console.log(`🎤 Enabling microphone for selected room: ${roomId}`);
      await clientRef.current.setPushToTalk(roomId, true);
      
      console.log(`✅ DMR Transmit Room Selected: ${roomId}`);
    } catch (error) {
      console.error(`❌ Error setting up transmission for ${roomId}:`, error);
    }
  }, [talkgroups]);

  // Handle talkgroup card click for transmission selection (DMR behavior)
  const handleTalkgroupCardClick = useCallback((event: React.MouseEvent, roomId: string) => {
    event.preventDefault();
    event.stopPropagation();
    
    const connection = talkgroups.get(roomId);
    if (!connection) {
      console.log(`⚠️ Talkgroup ${roomId} not found`);
      return;
    }
    
    if (!connection.isJoined) {
      console.log(`⚠️ Cannot transmit on ${connection.room.talkgroupName} - not joined to this talkgroup. Click JOIN first.`);
      return;
    }
    
    console.log(`📡 Selecting ${connection.room.talkgroupName} for transmission`);
    
    // Select this talkgroup for transmission
    handleTransmitRoomChange(roomId);
    
    // For emergency channels (911), implement override behavior
    if (connection.room.type === 'static-priority') {
      console.log(`🚨 Emergency transmission selected on ${connection.room.talkgroupName}`);
      // Emergency channels override all mute settings and are heard by everyone
      if (clientRef.current) {
        clientRef.current.emergencyOverride(roomId);
      }
    }
  }, [talkgroups, handleTransmitRoomChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, []);

  // Convert Map to Array for rendering
  const talkgroupsList = Array.from(talkgroups.values());

  // Get all participants from all rooms - moved before early return to fix React Hook rule
  const getAllParticipants = useCallback(() => {
    const participants: Array<{ participant: RemoteParticipant | LocalParticipant; roomName: string; talkgroupName: string }> = [];
    
    if (clientRef.current) {
      const rooms = clientRef.current.getAllRooms();
      
      rooms.forEach((room) => {
        const connection = talkgroups.get(room.name);
        if (connection) {
          // Add local participant (always show if connected to room)
          if (room.localParticipant && room.state === 'connected') {
            participants.push({
              participant: room.localParticipant,
              roomName: room.name,
              talkgroupName: connection.room.talkgroupName
            });
          }
          
          // Add remote participants (always show if connected to room)
          if (room.state === 'connected') {
            room.remoteParticipants.forEach((participant) => {
              participants.push({
                participant,
                roomName: room.name,
                talkgroupName: connection.room.talkgroupName
              });
            });
          }
        }
      });
    }
    
    return participants;
  }, [talkgroups, isConnected]);

  if (!isConnected) {
    return (
      <main style={{ 
        minHeight: '100dvh',
        background: THEME_COLORS.background,
        color: THEME_COLORS.textPrimary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }} data-lk-theme="default">
        <div style={{ maxWidth: '400px', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ 
              fontSize: '2rem', 
              fontWeight: 'bold', 
              color: THEME_COLORS.accent,
              margin: '0 0 0.5rem 0' 
            }}>📻 TalkGroup.ai</h1>
            <h2 style={{ 
              fontSize: '1.25rem', 
              color: THEME_COLORS.textSecondary,
              margin: '0 0 0.5rem 0',
              fontWeight: 'normal'
            }}>Mission Critical Communications</h2>
            <p style={{ 
              fontSize: '0.875rem', 
              color: THEME_COLORS.textMuted,
              margin: 0
            }}>DMR-style multi-talkgroup system with priority-based audio ducking</p>
          </div>

          {error && (
            <div style={{ 
              background: THEME_COLORS.danger, 
              color: 'white', 
              padding: '1rem', 
              borderRadius: '8px', 
              marginBottom: '1rem',
              border: `1px solid ${THEME_COLORS.borderColor}`
            }}>
              ❌ {error}
            </div>
          )}

          <div>
            <input
              type="text"
              placeholder="Enter your name"
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleConnect()}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: `1px solid ${THEME_COLORS.borderColor}`,
                backgroundColor: THEME_COLORS.cardBackground,
                color: THEME_COLORS.textPrimary,
                marginBottom: '1rem',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
            />
            
            <button
              onClick={handleConnect}
              disabled={isLoading || !participantName.trim()}
              style={{ 
                width: '100%', 
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                background: isLoading || !participantName.trim() ? THEME_COLORS.textMuted : THEME_COLORS.accent,
                color: THEME_COLORS.background,
                border: 'none',
                borderRadius: '8px',
                cursor: isLoading || !participantName.trim() ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => {
                if (!isLoading && participantName.trim()) {
                  e.currentTarget.style.background = THEME_COLORS.accentHover;
                }
              }}
              onMouseOut={(e) => {
                if (!isLoading && participantName.trim()) {
                  e.currentTarget.style.background = THEME_COLORS.accent;
                }
              }}
            >
              {isLoading ? '🔄 Connecting...' : '📡 Connect to TalkGroups'}
            </button>

            <div style={{ 
              marginTop: '2rem', 
              padding: '1rem', 
              background: THEME_COLORS.cardBackground, 
              borderRadius: '8px',
              border: `1px solid ${THEME_COLORS.borderColor}`,
              fontSize: '0.875rem',
            }}>
              <p style={{ 
                color: THEME_COLORS.textPrimary,
                margin: '0 0 0.5rem 0',
                fontWeight: '600'
              }}>You&apos;ll be connected to:</p>
              <ul style={{ 
                marginTop: '0.5rem', 
                paddingLeft: '1.5rem',
                color: THEME_COLORS.textSecondary,
                margin: 0
              }}>
                <li>🚨 911 (Emergency Priority)</li>
                <li>📞 General (Static Secondary - 2min TTL)</li>
                <li>🔬 R&D (Dynamic)</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const allParticipants = getAllParticipants();
  const selectedConnection = selectedTransmitRoom ? talkgroups.get(selectedTransmitRoom) : null;

  return (
    <div style={{ 
      height: '100dvh', 
      display: 'flex', 
      flexDirection: 'column',
      background: THEME_COLORS.background,
      color: THEME_COLORS.textPrimary
    }} data-lk-theme="default">
      {/* Top Header Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '1rem 2rem',
        background: THEME_COLORS.headerBackground,
        borderBottom: `1px solid ${THEME_COLORS.borderColor}`,
        minHeight: '60px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h1 style={{ 
              margin: 0, 
              fontSize: '1.25rem', 
              color: THEME_COLORS.accent,
              fontWeight: 'bold'
            }}>📻 TalkGroup.ai</h1>
            <div style={{ fontSize: '0.625rem', color: THEME_COLORS.textMuted, marginTop: '2px' }}>
              v0.2.1 • 2025-08-15
            </div>
          </div>
          <div style={{ fontSize: '0.875rem', color: THEME_COLORS.textSecondary }}>
            {participantName} • <span style={{ color: THEME_COLORS.success }}>●</span> Connected
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {isEmergencyActive && (
            <div style={{ 
              background: THEME_COLORS.danger, 
              color: 'white', 
              padding: '0.25rem 0.75rem', 
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              animation: 'pulse 1s infinite',
            }}>
              🚨 EMERGENCY
            </div>
          )}
          
          {/* Master Volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
            <span>🔊</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={masterVolume}
              onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
              style={{ 
                width: '60px',
                accentColor: THEME_COLORS.accent
              }}
            />
            <span style={{ color: THEME_COLORS.textSecondary, minWidth: '32px' }}>
              {Math.round(masterVolume * 100)}%
            </span>
          </div>
          
          <button
            onClick={handleDisconnect}
            style={{ 
              background: THEME_COLORS.textMuted, 
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '0.5rem 1rem', 
              fontSize: '0.75rem',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = THEME_COLORS.danger;
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = THEME_COLORS.textMuted;
            }}
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Main Video Tiles Area */}
      <div style={{ 
        flex: 1, 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: THEME_COLORS.background
      }}>
        {allParticipants.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(allParticipants.length, 4)}, 1fr)`,
            gridTemplateRows: `repeat(${Math.ceil(allParticipants.length / 4)}, 1fr)`,
            gap: '1rem',
            maxWidth: '100%',
            maxHeight: '100%',
            width: '100%',
            height: '100%'
          }}>
            {allParticipants.map(({ participant, roomName, talkgroupName }, index) => {
              const connection = talkgroups.get(roomName);
              const priorityColor = connection ? PRIORITY_COLORS[connection.room.type as keyof typeof PRIORITY_COLORS] : THEME_COLORS.textMuted;
              const isActiveSpeaker = connection?.isActiveSpeaker || false;
              
              return (
                <div
                  key={`${roomName}-${participant.identity}`}
                  style={{
                    background: THEME_COLORS.cardBackground,
                    border: isActiveSpeaker ? `3px solid ${priorityColor}` : `1px solid ${THEME_COLORS.borderColor}`,
                    borderRadius: '12px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    minHeight: '200px',
                    transition: 'all 0.3s ease',
                    boxShadow: isActiveSpeaker ? `0 0 20px ${priorityColor}40` : 'none'
                  }}
                >
                  {/* Video placeholder */}
                  <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: `linear-gradient(45deg, ${priorityColor}40, ${priorityColor}60)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                    marginBottom: '1rem'
                  }}>
                    👤
                  </div>
                  
                  {/* Participant name */}
                  <div style={{
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: THEME_COLORS.textPrimary,
                    textAlign: 'center',
                    marginBottom: '0.5rem'
                  }}>
                    {participant.identity}
                  </div>
                  
                  {/* Talkgroup indicator */}
                  <div style={{
                    fontSize: '0.75rem',
                    color: THEME_COLORS.textSecondary,
                    background: `${priorityColor}20`,
                    padding: '0.25rem 0.5rem',
                    borderRadius: '12px',
                    border: `1px solid ${priorityColor}60`
                  }}>
                    {talkgroupName}
                  </div>
                  
                  {/* Active speaker indicator */}
                  {isActiveSpeaker && (
                    <div style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      background: priorityColor,
                      color: 'white',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      animation: 'pulse 1s infinite'
                    }}>
                      🎙️
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '1rem',
            color: THEME_COLORS.textMuted,
            fontSize: '1.125rem'
          }}>
            <div style={{ fontSize: '4rem', opacity: 0.5 }}>📹</div>
            <div>No participants connected</div>
            <div style={{ fontSize: '0.875rem', textAlign: 'center', maxWidth: '300px' }}>
              Join a talkgroup below to start communicating
            </div>
          </div>
        )}
      </div>

      {/* Bottom Talkgroup Controls Panel */}
      <div style={{ 
        background: THEME_COLORS.headerBackground, 
        padding: '1.5rem 2rem',
        borderTop: `2px solid ${THEME_COLORS.borderColor}`
      }}>
        {/* Microphone Transmission Instructions */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          gap: '2rem',
          marginBottom: '1.5rem'
        }}>
          {/* Large Microphone Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => {
                // Toggle microphone for selected room
                if (selectedTransmitRoom && clientRef.current) {
                  // This would toggle push-to-talk
                  console.log(`🎙️ Transmitting on ${selectedTransmitRoom}`);
                }
              }}
              disabled={!selectedTransmitRoom}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: selectedTransmitRoom 
                  ? `linear-gradient(45deg, ${THEME_COLORS.accent}, ${THEME_COLORS.accentHover})` 
                  : THEME_COLORS.textMuted,
                border: selectedConnection ? `4px solid ${PRIORITY_COLORS[selectedConnection.room.type as keyof typeof PRIORITY_COLORS]}` : `2px solid ${THEME_COLORS.borderColor}`,
                color: selectedTransmitRoom ? THEME_COLORS.background : THEME_COLORS.textSecondary,
                cursor: selectedTransmitRoom ? 'pointer' : 'not-allowed',
                fontSize: '2rem',
                fontWeight: 'bold',
                transition: 'all 0.2s ease',
                boxShadow: selectedConnection ? `0 0 20px ${PRIORITY_COLORS[selectedConnection.room.type as keyof typeof PRIORITY_COLORS]}60` : 'none'
              }}
              onMouseOver={(e) => {
                if (selectedTransmitRoom) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseOut={(e) => {
                if (selectedTransmitRoom) {
                  e.currentTarget.style.transform = 'scale(1)';
                }
              }}
            >
              🎙️
            </button>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ 
                fontSize: '1rem', 
                color: THEME_COLORS.textPrimary,
                fontWeight: '600'
              }}>
                {selectedConnection 
                  ? `Transmitting on ${selectedConnection.room.talkgroupName}`
                  : 'Click a talkgroup below to select for transmission'}
              </div>
              
              <div style={{ 
                fontSize: '0.75rem', 
                color: selectedConnection ? PRIORITY_COLORS[selectedConnection.room.type as keyof typeof PRIORITY_COLORS] : THEME_COLORS.textMuted,
                fontWeight: '400'
              }}>
                {selectedConnection 
                  ? `${selectedConnection.room.type.replace('-', ' ').toUpperCase()} • Priority ${selectedConnection.room.priority}`
                  : '1. JOIN a talkgroup, then 2. CLICK to select for transmission'}
              </div>
            </div>
          </div>
          
          {/* Audio Ducking Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              id="ducking-toggle"
              type="checkbox"
              checked={isDuckingEnabled}
              onChange={(e) => setDuckingEnabled(e.target.checked)}
              style={{ 
                width: '18px', 
                height: '18px',
                accentColor: THEME_COLORS.accent
              }}
            />
            <label htmlFor="ducking-toggle" style={{ 
              color: THEME_COLORS.textPrimary, 
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}>
              🔇 Audio Ducking
            </label>
          </div>
        </div>

        {/* Helper Text */}
        <div style={{
          textAlign: 'center',
          marginBottom: '1rem',
          padding: '1rem',
          background: `${THEME_COLORS.accent}15`,
          border: `1px solid ${THEME_COLORS.accent}60`,
          borderRadius: '8px',
          maxWidth: '600px',
          margin: '0 auto 1rem auto'
        }}>
          <div style={{
            fontSize: '1rem',
            color: THEME_COLORS.textPrimary,
            fontWeight: '600',
            marginBottom: '0.5rem'
          }}>
            📻 Click to select which talkgroup to transmit over
          </div>
          <div style={{
            fontSize: '0.875rem',
            color: THEME_COLORS.textSecondary
          }}>
            1. JOIN a talkgroup to start listening • 2. CLICK the talkgroup card to select for transmission
          </div>
        </div>

        {/* Talkgroups Row */}
        <div style={{ 
          display: 'flex', 
          gap: '1rem',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          {priorityOrder.map(roomId => {
            const connection = talkgroups.get(roomId);
            if (!connection) return null;

            const { room, isJoined, isMuted, volume, isActiveSpeaker } = connection;
            const priorityColor = PRIORITY_COLORS[room.type as keyof typeof PRIORITY_COLORS];
            const isSelected = selectedTransmitRoom === roomId;

            return (
              <div
                key={roomId}
                onClick={(event) => handleTalkgroupCardClick(event, roomId)}
                style={{
                  minWidth: '220px',
                  maxWidth: '280px',
                  border: isSelected 
                    ? `3px solid ${THEME_COLORS.accent}` 
                    : isActiveSpeaker 
                      ? `2px solid ${priorityColor}` 
                      : `1px solid ${THEME_COLORS.borderColor}`,
                  borderRadius: '12px',
                  padding: '1rem',
                  background: isSelected 
                    ? `${THEME_COLORS.accent}10` 
                    : isActiveSpeaker 
                      ? `${priorityColor}20` 
                      : THEME_COLORS.cardBackground,
                  transition: 'all 0.3s ease',
                  boxShadow: isSelected ? `0 0 20px ${THEME_COLORS.accent}40` : 'none',
                  cursor: isJoined ? 'pointer' : 'not-allowed',
                  opacity: isJoined ? 1 : 0.7
                }}
              >
                {/* Talkgroup Header */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: priorityColor,
                      marginRight: '0.75rem',
                      animation: isActiveSpeaker ? 'pulse 1s infinite' : 'none',
                    }}
                  />
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontSize: '1rem', 
                      fontWeight: '700',
                      color: THEME_COLORS.textPrimary,
                      marginBottom: '0.25rem'
                    }}>
                      {room.talkgroupName}
                    </div>
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: priorityColor,
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      {room.type.replace('-', ' ')}
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '1.25rem' }}>
                    {isActiveSpeaker ? '🎙️' : isJoined ? '👂' : '📵'}
                  </div>
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      isJoined ? handleLeaveRoom(roomId) : handleJoinRoom(roomId);
                    }}
                    style={{ 
                      flex: 1,
                      padding: '0.5rem',
                      background: isJoined ? THEME_COLORS.success : THEME_COLORS.textMuted,
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {isJoined ? 'LISTENING' : 'JOIN'}
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleToggleMute(roomId);
                    }}
                    disabled={!isJoined}
                    style={{ 
                      padding: '0.5rem 0.75rem',
                      background: isMuted ? THEME_COLORS.danger : THEME_COLORS.textMuted,
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      cursor: !isJoined ? 'not-allowed' : 'pointer',
                      opacity: !isJoined ? 0.5 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    {isMuted ? '🔇' : '🔊'}
                  </button>
                  
                  {room.type === 'static-priority' && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEmergencyOverride(roomId);
                      }}
                      style={{ 
                        padding: '0.5rem 0.75rem',
                        background: THEME_COLORS.danger,
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '1rem',
                        cursor: 'pointer',
                        animation: 'pulse 2s infinite'
                      }}
                    >
                      🚨
                    </button>
                  )}
                </div>

                {/* Volume Control */}
                {isJoined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', color: THEME_COLORS.textSecondary, minWidth: '20px' }}>🔊</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={volume}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleVolumeChange(roomId, parseFloat(e.target.value));
                      }}
                      style={{ 
                        flex: 1, 
                        height: '6px',
                        accentColor: priorityColor
                      }}
                    />
                    <span style={{ 
                      fontSize: '0.75rem', 
                      color: THEME_COLORS.textSecondary,
                      minWidth: '35px',
                      fontWeight: '600'
                    }}>
                      {Math.round(volume * 100)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
