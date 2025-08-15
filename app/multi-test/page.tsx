'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MultiConnectionDetails, TalkgroupRoom } from '@/lib/types';
import { MultiRoomLiveKitClient } from '@/lib/MultiRoomLiveKitClient';
import { useMultiTalkgroupStore } from '@/lib/multiTalkgroupStore';
import styles from '../../styles/Home.module.css';

interface TestState {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  connectionDetails: MultiConnectionDetails | null;
  selectedTalkgroups: number[];
}

// Mock talkgroup data for testing
const MOCK_TALKGROUPS = [
  { id: 1, name: '911-EMERGENCY', type: 'static-priority', priority: 100, description: 'Emergency dispatch channel' },
  { id: 2, name: 'FIRE-DISPATCH', type: 'static-secondary', priority: 80, description: 'Fire department dispatch' },
  { id: 3, name: 'POLICE-DISPATCH', type: 'static-secondary', priority: 80, description: 'Police dispatch channel' },
  { id: 4, name: 'TACTICAL-1', type: 'dynamic', priority: 50, description: 'Dynamic tactical channel' },
  { id: 5, name: 'INCIDENT-2024-001', type: 'adhoc', priority: 40, description: 'Incident response channel' },
];

const PRIORITY_COLORS = {
  'static-priority': '#ef4444', // red
  'static-secondary': '#f59e0b', // amber
  'dynamic': '#3b82f6', // blue
  'adhoc': '#8b5cf6', // purple
};

export default function MultiTalkgroupTest() {
  const [state, setState] = useState<TestState>({
    isConnected: false,
    isLoading: false,
    error: null,
    connectionDetails: null,
    selectedTalkgroups: [1, 2, 4], // Default selection
  });

  const handleTalkgroupToggle = useCallback((talkgroupId: number) => {
    setState(prev => ({
      ...prev,
      selectedTalkgroups: prev.selectedTalkgroups.includes(talkgroupId)
        ? prev.selectedTalkgroups.filter(id => id !== talkgroupId)
        : [...prev.selectedTalkgroups, talkgroupId].slice(0, 10) // Max 10
    }));
  }, []);

  const connectToTalkgroups = useCallback(async () => {
    if (state.selectedTalkgroups.length === 0) {
      setState(prev => ({ ...prev, error: 'Please select at least one talkgroup' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch('/api/multi-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          participantName: `Tester_${Math.random().toString(36).substr(2, 5)}`,
          talkgroupIds: state.selectedTalkgroups,
          metadata: 'DMR Audio Ducking Test',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const connectionDetails: MultiConnectionDetails = await response.json();
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        isLoading: false,
        connectionDetails,
      }));

      console.log('🔗 Multi-connection established:', connectionDetails);

      // TODO: Initialize LiveKit Room with multiple room grants
      // TODO: Initialize DMR Audio Ducking Engine
      
    } catch (error) {
      console.error('❌ Connection failed:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      }));
    }
  }, [state.selectedTalkgroups]);

  const disconnect = useCallback(() => {
    setState({
      isConnected: false,
      isLoading: false,
      error: null,
      connectionDetails: null,
      selectedTalkgroups: state.selectedTalkgroups, // Keep selection
    });
    console.log('🔌 Disconnected from all talkgroups');
  }, [state.selectedTalkgroups]);

  const testAudioDucking = useCallback(() => {
    if (!state.connectionDetails) return;

    console.log('🎙️ Testing audio ducking scenarios...');
    
    // Simulate different speaker events
    const testEvents = [
      { room: '911-EMERGENCY', priority: 100, duration: 2000 },
      { room: 'FIRE-DISPATCH', priority: 80, duration: 3000 },
      { room: 'TACTICAL-1', priority: 50, duration: 2500 },
    ];

    testEvents.forEach((event, index) => {
      setTimeout(() => {
        console.log(`🎯 Simulating speaker in ${event.room} (priority: ${event.priority})`);
        // TODO: Trigger DMRAudioDuckingEngine.onSpeakerEvent()
      }, index * 1000);
    });
  }, [state.connectionDetails]);

  return (
    <main className={styles.main} data-lk-theme="default">
      <div className="header">
        <h1>🔊 Multi-Talkgroup Test</h1>
        <p>Test DMR-style priority-based audio ducking across multiple talkgroups</p>
      </div>

      {state.error && (
        <div style={{ 
          background: '#ef4444', 
          color: 'white', 
          padding: '1rem', 
          borderRadius: '8px', 
          marginBottom: '1rem' 
        }}>
          ❌ {state.error}
        </div>
      )}

      {/* Talkgroup Selection */}
      <div style={{ marginBottom: '2rem' }}>
        <h3>📻 Select Talkgroups (Max 10)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          {MOCK_TALKGROUPS.map(talkgroup => (
            <div
              key={talkgroup.id}
              onClick={() => handleTalkgroupToggle(talkgroup.id)}
              style={{
                border: state.selectedTalkgroups.includes(talkgroup.id) ? '2px solid #3b82f6' : '1px solid #d1d5db',
                borderRadius: '8px',
                padding: '1rem',
                cursor: 'pointer',
                background: state.selectedTalkgroups.includes(talkgroup.id) ? '#eff6ff' : 'white',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: PRIORITY_COLORS[talkgroup.type as keyof typeof PRIORITY_COLORS],
                    marginRight: '0.5rem',
                  }}
                />
                <strong>{talkgroup.name}</strong>
                <span style={{ marginLeft: 'auto', fontSize: '0.875rem', color: '#6b7280' }}>
                  P{talkgroup.priority}
                </span>
              </div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                {talkgroup.description}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {talkgroup.type.replace('-', ' ')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Connection Controls */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        {!state.isConnected ? (
          <button
            onClick={connectToTalkgroups}
            disabled={state.isLoading || state.selectedTalkgroups.length === 0}
            className="lk-button"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            {state.isLoading ? '🔄 Connecting...' : `📡 Connect to ${state.selectedTalkgroups.length} Talkgroups`}
          </button>
        ) : (
          <>
            <button
              onClick={disconnect}
              className="lk-button"
              style={{ padding: '0.75rem 1.5rem', background: '#ef4444' }}
            >
              🔌 Disconnect
            </button>
            <button
              onClick={testAudioDucking}
              className="lk-button"
              style={{ padding: '0.75rem 1.5rem', background: '#3b82f6' }}
            >
              🎙️ Test Audio Ducking
            </button>
          </>
        )}
      </div>

      {/* Connection Details */}
      {state.connectionDetails && (
        <div style={{ background: '#f3f4f6', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
          <h3>🔗 Connection Details</h3>
          <div style={{ fontFamily: 'monospace', fontSize: '0.875rem', marginBottom: '1rem' }}>
            <div><strong>Participant:</strong> {state.connectionDetails.participantName}</div>
            <div><strong>Server URL:</strong> {state.connectionDetails.serverUrl}</div>
            <div><strong>Token Length:</strong> {state.connectionDetails.participantToken.length} chars</div>
          </div>

          <h4>📋 Connected Rooms ({state.connectionDetails.rooms.length})</h4>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {state.connectionDetails.rooms.map(room => (
              <div
                key={room.roomName}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.75rem',
                  background: 'white',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: PRIORITY_COLORS[room.type as keyof typeof PRIORITY_COLORS],
                    marginRight: '0.75rem',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <strong>{room.talkgroupName}</strong>
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                    {room.type} • Priority {room.priority} • Hold {room.holdTimeSeconds}s
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem' }}>
                  {room.canPublish && <span style={{ color: '#059669' }}>📤 TX</span>}
                  {room.canSubscribe && <span style={{ color: '#3b82f6' }}>📥 RX</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DMR Priority Legend */}
      <div style={{ background: '#f9fafb', padding: '1.5rem', borderRadius: '8px' }}>
        <h3>🎯 DMR Priority System</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {Object.entries(PRIORITY_COLORS).map(([type, color]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color, marginRight: '0.5rem' }} />
              <div>
                <div style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
                  {type.replace('-', ' ')}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {type === 'static-priority' && 'Always overrides everything'}
                  {type === 'static-secondary' && 'Ducks dynamic when active'}
                  {type === 'dynamic' && 'User-initiated conversations'}
                  {type === 'adhoc' && 'Temporary incident channels'}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Version Footer */}
        <div style={{ 
          marginTop: '1rem', 
          textAlign: 'center', 
          fontSize: '0.75rem', 
          color: '#6b7280'
        }}>
          v0.2.0 • {new Date().toISOString().split('T')[0]}
        </div>
      </div>
    </main>
  );
}
