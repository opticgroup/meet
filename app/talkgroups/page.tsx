'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MultiConnectionDetails } from '@/lib/types';
import { MultiRoomLiveKitClient } from '@/lib/MultiRoomLiveKitClient';
import { useMultiTalkgroupStore } from '@/lib/multiTalkgroupStore';
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
  const DEFAULT_TALKGROUPS = [1, 2, 4]; // Emergency, Fire Dispatch, Tactical-1

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
              <li>🚨 911-EMERGENCY (Priority)</li>
              <li>🔥 FIRE-DISPATCH (Secondary)</li>
              <li>💬 TACTICAL-1 (Dynamic)</li>
            </ul>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main} data-lk-theme="default">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>📻 Active TalkGroups</h1>
          <p>Connected as <strong>{participantName}</strong> • Status: <span style={{ color: '#10b981' }}>●</span> Connected</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {isEmergencyActive && (
            <div style={{ 
              background: '#ef4444', 
              color: 'white', 
              padding: '0.5rem 1rem', 
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              animation: 'pulse 1s infinite',
            }}>
              🚨 EMERGENCY ACTIVE
            </div>
          )}
          
          <button
            onClick={handleDisconnect}
            className="lk-button"
            style={{ background: '#6b7280' }}
          >
            🔌 Disconnect
          </button>
        </div>
      </div>

      {/* Master Controls */}
      <div style={{ 
        background: '#f9fafb', 
        padding: '1rem', 
        borderRadius: '8px', 
        marginBottom: '2rem',
        display: 'flex',
        gap: '2rem',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: '600' }}>Master Volume:</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={masterVolume}
            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
            style={{ width: '100px' }}
          />
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{Math.round(masterVolume * 100)}%</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={isDuckingEnabled}
            onChange={(e) => setDuckingEnabled(e.target.checked)}
          />
          <label style={{ fontSize: '0.875rem' }}>Audio Ducking</label>
        </div>
        
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Active Speakers: {activeSpeakers.size}
        </div>
      </div>

      {/* Talkgroups Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', 
        gap: '1.5rem',
        marginBottom: '2rem',
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
                border: isActiveSpeaker ? `2px solid ${priorityColor}` : '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '1.5rem',
                background: isActiveSpeaker ? `${priorityColor}08` : 'white',
                boxShadow: isActiveSpeaker ? `0 0 20px ${priorityColor}40` : '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.3s ease',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: priorityColor,
                    marginRight: '0.75rem',
                    animation: isActiveSpeaker ? 'pulse 1s infinite' : 'none',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600' }}>
                    {room.talkgroupName}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {room.type.replace('-', ' ').toUpperCase()} • Priority {room.priority}
                  </div>
                </div>
                <div style={{ fontSize: '0.875rem', color: isActiveSpeaker ? priorityColor : '#6b7280' }}>
                  {isActiveSpeaker ? '🎙️ ACTIVE' : isJoined ? '👂 LISTENING' : '📵 OFF'}
                </div>
              </div>

              {/* Controls */}
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                <button
                  onClick={() => isJoined ? handleLeaveRoom(roomId) : handleJoinRoom(roomId)}
                  className="lk-button"
                  style={{ 
                    flex: 1,
                    background: isJoined ? '#10b981' : '#6b7280',
                    fontSize: '0.875rem',
                  }}
                >
                  {isJoined ? '📞 Joined' : '📱 Join'}
                </button>
                
                <button
                  onClick={() => handleToggleMute(roomId)}
                  disabled={!isJoined}
                  className="lk-button"
                  style={{ 
                    background: isMuted ? '#ef4444' : '#f3f4f6',
                    color: isMuted ? 'white' : '#374151',
                    fontSize: '0.875rem',
                  }}
                >
                  {isMuted ? '🔇' : '🔊'}
                </button>
                
                {room.type === 'static-priority' && (
                  <button
                    onClick={() => handleEmergencyOverride(roomId)}
                    className="lk-button"
                    style={{ 
                      background: '#ef4444',
                      fontSize: '0.875rem',
                    }}
                  >
                    🚨
                  </button>
                )}
              </div>

              {/* Volume Control */}
              {isJoined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Volume:</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={(e) => handleVolumeChange(roomId, parseFloat(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {Math.round(volume * 100)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Status Footer */}
      <div style={{ 
        background: '#f3f4f6', 
        padding: '1rem', 
        borderRadius: '8px',
        fontSize: '0.875rem',
        color: '#6b7280',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>DMR Audio Ducking:</strong> {isDuckingEnabled ? 'Enabled' : 'Disabled'}
          </div>
          <div>
            <strong>Connected Rooms:</strong> {talkgroupsList.length}
          </div>
          <div>
            <strong>Joined Rooms:</strong> {talkgroupsList.filter(c => c.isJoined).length}
          </div>
        </div>
      </div>
    </main>
  );
}
