'use client';

import { useRouter } from 'next/navigation';
import { generateRoomId } from '@/lib/client-utils';
import styles from '../styles/Home.module.css';

// Force deployment refresh - v3 - Debug Logging Deploy

export default function Page() {
  const router = useRouter();
  
  return (
    <>
      <main className={styles.main} data-lk-theme="default">
        <div className="header">
          <img src="/images/talkgroup-home.svg" alt="TalkGroup.ai" width="480" height="80" />
          <h2>
            Mission Critical Communications
          </h2>
          <p style={{ opacity: 0.8, marginTop: '1rem' }}>
            DMR-style multi-talkgroup system with priority-based audio ducking
          </p>
        </div>
        
        {/* Main TalkGroup System */}
        <div style={{ maxWidth: '600px', margin: '2rem auto' }}>
          <div style={{ padding: '2rem', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '12px', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#FFD400' }}>🎙️ Default TalkGroups</h3>
            <p style={{ margin: '0 0 2rem 0', opacity: 0.9 }}>
              Connect to mission-critical communications with automatic priority handling
            </p>
            
            {/* Default Talkgroups Preview */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
              gap: '1rem', 
              marginBottom: '2rem' 
            }}>
              <div style={{ 
                padding: '1rem', 
                background: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid #ef4444', 
                borderRadius: '8px' 
              }}>
                <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.875rem' }}>🚨 911</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>Emergency Priority</div>
              </div>
              <div style={{ 
                padding: '1rem', 
                background: 'rgba(245, 158, 11, 0.1)', 
                border: '1px solid #f59e0b', 
                borderRadius: '8px' 
              }}>
                <div style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '0.875rem' }}>📞 General</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>Static Secondary</div>
              </div>
              <div style={{ 
                padding: '1rem', 
                background: 'rgba(59, 130, 246, 0.1)', 
                border: '1px solid #3b82f6', 
                borderRadius: '8px' 
              }}>
                <div style={{ color: '#3b82f6', fontWeight: 'bold', fontSize: '0.875rem' }}>🔬 R&D</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>Dynamic</div>
              </div>
            </div>
            
            <button 
              onClick={() => router.push('/talkgroups')}
              className="lk-button" 
              style={{ 
                fontSize: '1.1rem', 
                padding: '1rem 2rem', 
                width: '100%',
                marginBottom: '1rem'
              }}
            >
              📻 Join TalkGroups
            </button>
            
            <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
              Powered by LiveKit Cloud • No setup required
            </div>
          </div>
        </div>
        
        {/* Additional Options */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
          <button 
            onClick={() => router.push(`/rooms/${generateRoomId()}`)}
            className="lk-button" 
            style={{ 
              background: 'rgba(255, 255, 255, 0.2)',
              padding: '0.75rem 1rem' 
            }}
          >
            💬 Start Demo Meeting
          </button>
          <a href="/multi-test" className="lk-button" style={{ 
            textDecoration: 'none', 
            background: 'rgba(255, 255, 255, 0.2)',
            padding: '0.75rem 1rem' 
          }}>
            🧪 Test Interface
          </a>
        </div>
      </main>
      <footer data-lk-theme="default">
        Powered by{' '}
        <a href="https://livekit.io/cloud" rel="noopener">
          LiveKit Cloud
        </a>
        . Built for Mission Critical Teams.
        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.6 }}>
          v0.2.1 • 2025-08-15 • Debug Logging Available
        </div>
      </footer>
    </>
  );
}
