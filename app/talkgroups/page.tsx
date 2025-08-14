'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MultiConnectionDetails } from '@/lib/types';
import { MultiRoomLiveKitClient } from '@/lib/MultiRoomLiveKitClient';
import { useMultiTalkgroupStore } from '@/lib/multiTalkgroupStore';
import { formatChatMessageLinks, RoomContext, VideoConference, GridLayout, ParticipantTile } from '@livekit/components-react';
import { Room } from 'livekit-client';
import styles from '../../styles/Home.module.css';

const PRIORITY_COLORS = {
  'static-priority': '#ef4444', // red
  'static-secondary': '#f59e0b', // amber
  'dynamic': '#3b82f6', // blue
  'adhoc': '#8b5cf6', // purple
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
  }, [participantName]);

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

  const handleTransmitRoomChange = useCallback((roomId: string) => {
    setSelectedTransmitRoom(roomId);
    if (clientRef.current) {
      // Enable microphone only for selected room, disable for others
      const currentTalkgroups = Array.from(talkgroups.values());
      currentTalkgroups.forEach(async (connection) => {
        const shouldEnableMic = connection.room.roomName === roomId && connection.isJoined;
        await clientRef.current?.setPushToTalk(connection.room.roomName, shouldEnableMic);
      });
    }
    console.log(`📡 Transmitting to: ${roomId}`);
  }, [talkgroups]);

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

  if (!isConnected) {
    return (
      <main className={styles.main} data-lk-theme="default">
        <div className="header">
          <h1>🔊 TalkGroup.ai</h1>
          <h2>Mission Critical Communications</h2>
          <p>DMR-style multi-talkgroup system with priority-based audio ducking</p>
        </div>

        {error && (
          <div style={{ 
            background: '#ef4444', 
            color: 'white', 
            padding: '1rem', 
            borderRadius: '8px', 
            marginBottom: '1rem' 
          }}>
            ❌ {error}
          </div>
        )}

        <div style={{ maxWidth: '400px', margin: '0 auto' }}>
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
              border: '1px solid #d1d5db',
              marginBottom: '1rem',
              fontSize: '1rem',
            }}
          />
          
          <button
            onClick={handleConnect}
            disabled={isLoading || !participantName.trim()}
            className="lk-button"
            style={{ 
              width: '100%', 
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
            }}
          >
            {isLoading ? '🔄 Connecting...' : '📡 Connect to TalkGroups'}
          </button>

          <div style={{ 
            marginTop: '2rem', 
            padding: '1rem', 
            background: '#f3f4f6', 
            borderRadius: '8px',
            fontSize: '0.875rem',
            color: '#6b7280',
          }}>
            <p><strong>You&apos;ll be connected to:</strong></p>
            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
              <li>🚨 911 (Emergency Priority)</li>
              <li>📞 General (Static Secondary - 2min TTL)</li>
              <li>🔬 R&D (Dynamic)</li>
            </ul>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }} data-lk-theme="default">
      {/* Top Header Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '1rem 2rem',
        background: '#1f2937',
        color: 'white',
        minHeight: '60px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>📻 TalkGroup.ai</h1>
          <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>
            {participantName} • <span style={{ color: '#10b981' }}>●</span> Connected
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {isEmergencyActive && (
            <div style={{ 
              background: '#ef4444', 
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
              style={{ width: '60px' }}
            />
            <span>{Math.round(masterVolume * 100)}%</span>
          </div>
          
          <button
            onClick={handleDisconnect}
            className="lk-button"
            style={{ background: '#6b7280', padding: '0.5rem 1rem', fontSize: '0.75rem' }}
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Main Video Conference Area */}
      <div style={{ flex: 1, position: 'relative', background: '#111827' }}>
        {clientRef.current && clientRef.current.getAllRooms().size > 0 ? (
          <RoomContext.Provider value={Array.from(clientRef.current.getAllRooms().values())[0]}>
            <VideoConference
              chatMessageFormatter={formatChatMessageLinks}
              style={{ height: '100%' }}
            />
          </RoomContext.Provider>
        ) : (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            color: 'white',
            fontSize: '1.125rem'
          }}>
            📹 No active video connections
          </div>
        )}
      </div>

      {/* Bottom Talkgroup Controls */}
      <div style={{ 
        background: '#1f2937', 
        padding: '1rem 2rem',
        borderTop: '1px solid #374151'
      }}>
        {/* Microphone Transmission Selection */}
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <label style={{ color: 'white', fontSize: '0.875rem', fontWeight: '600' }}>🎙️ Transmit to:</label>
          <select 
            value={selectedTransmitRoom}
            onChange={(e) => handleTransmitRoomChange(e.target.value)}
            style={{ 
              padding: '0.5rem', 
              borderRadius: '4px', 
              border: '1px solid #6b7280',
              background: '#374151',
              color: 'white',
              fontSize: '0.875rem'
            }}
          >
            <option value="">Select Talkgroup...</option>
            {talkgroupsList.filter(c => c.isJoined).map(connection => (
              <option key={connection.room.roomName} value={connection.room.roomName}>
                {connection.room.talkgroupName} ({connection.room.type})
              </option>
            ))}
          </select>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={isDuckingEnabled}
              onChange={(e) => setDuckingEnabled(e.target.checked)}
            />
            <label style={{ color: 'white', fontSize: '0.75rem' }}>Audio Ducking</label>
          </div>
        </div>

        {/* Compact Talkgroups Row */}
        <div style={{ 
          display: 'flex', 
          gap: '1rem',
          overflowX: 'auto',
          paddingBottom: '0.5rem'
        }}>
          {priorityOrder.map(roomId => {
            const connection = talkgroups.get(roomId);
            if (!connection) return null;

            const { room, isJoined, isMuted, volume, isActiveSpeaker } = connection;
            const priorityColor = PRIORITY_COLORS[room.type as keyof typeof PRIORITY_COLORS];

            return (
              <div
                key={roomId}
                style={{
                  minWidth: '200px',
                  border: isActiveSpeaker ? `2px solid ${priorityColor}` : '1px solid #4b5563',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  background: isActiveSpeaker ? `${priorityColor}20` : '#374151',
                  color: 'white',
                  transition: 'all 0.3s ease',
                }}
              >
                {/* Compact Header */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: priorityColor,
                      marginRight: '0.5rem',
                      animation: isActiveSpeaker ? 'pulse 1s infinite' : 'none',
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: '600' }}>
                      {room.talkgroupName}
                    </div>
                    <div style={{ fontSize: '0.625rem', opacity: 0.7 }}>
                      {room.type.replace('-', ' ').toUpperCase()}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem' }}>
                    {isActiveSpeaker ? '🎙️' : isJoined ? '👂' : '📵'}
                  </div>
                </div>

                {/* Compact Controls */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    onClick={() => isJoined ? handleLeaveRoom(roomId) : handleJoinRoom(roomId)}
                    style={{ 
                      flex: 1,
                      padding: '0.25rem 0.5rem',
                      background: isJoined ? '#10b981' : '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    {isJoined ? 'ON' : 'OFF'}
                  </button>
                  
                  <button
                    onClick={() => handleToggleMute(roomId)}
                    disabled={!isJoined}
                    style={{ 
                      padding: '0.25rem 0.5rem',
                      background: isMuted ? '#ef4444' : '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: !isJoined ? 'not-allowed' : 'pointer',
                      opacity: !isJoined ? 0.5 : 1
                    }}
                  >
                    {isMuted ? '🔇' : '🔊'}
                  </button>
                  
                  {room.type === 'static-priority' && (
                    <button
                      onClick={() => handleEmergencyOverride(roomId)}
                      style={{ 
                        padding: '0.25rem 0.5rem',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      🚨
                    </button>
                  )}
                </div>

                {/* Volume slider for joined rooms */}
                {isJoined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={volume}
                      onChange={(e) => handleVolumeChange(roomId, parseFloat(e.target.value))}
                      style={{ flex: 1, height: '4px' }}
                    />
                    <span style={{ fontSize: '0.625rem', minWidth: '28px' }}>
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
