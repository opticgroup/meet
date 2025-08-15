'use client';

import { formatChatMessageLinks, RoomContext, VideoConference } from '@livekit/components-react';
import {
  ExternalE2EEKeyProvider,
  LogLevel,
  Room,
  RoomConnectOptions,
  RoomOptions,
  VideoPresets,
  type VideoCodec,
} from 'livekit-client';
import { DebugMode } from '@/lib/Debug';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardShortcuts } from '@/lib/KeyboardShortcuts';
import { SettingsMenu } from '@/lib/SettingsMenu';
import { useSetupE2EE } from '@/lib/useSetupE2EE';
import { useLowCPUOptimizer } from '@/lib/usePerfomanceOptimiser';

export function VideoConferenceClientImpl(props: {
  liveKitUrl: string;
  token: string;
  codec: VideoCodec | undefined;
}) {
  const keyProvider = new ExternalE2EEKeyProvider();
  const { worker, e2eePassphrase } = useSetupE2EE();
  const e2eeEnabled = !!(e2eePassphrase && worker);

  const [e2eeSetupComplete, setE2eeSetupComplete] = useState(false);

  const roomOptions = useMemo((): RoomOptions => {
    return {
      publishDefaults: {
        videoSimulcastLayers: [VideoPresets.h540, VideoPresets.h216],
        red: !e2eeEnabled,
        videoCodec: props.codec,
      },
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      e2ee: e2eeEnabled
        ? {
            keyProvider,
            worker,
          }
        : undefined,
    };
  }, [e2eeEnabled, props.codec, keyProvider, worker]);

  const room = useMemo(() => new Room(roomOptions), [roomOptions]);

  const connectOptions = useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
  }, []);

  useEffect(() => {
    if (e2eeEnabled) {
      keyProvider.setKey(e2eePassphrase).then(() => {
        room.setE2EEEnabled(true).then(() => {
          setE2eeSetupComplete(true);
        });
      });
    } else {
      setE2eeSetupComplete(true);
    }
  }, [e2eeEnabled, e2eePassphrase, keyProvider, room, setE2eeSetupComplete]);

  useEffect(() => {
    if (e2eeSetupComplete) {
      console.log('🔗 Attempting to connect to LiveKit room...');
      
      // Add connection timeout
      const connectWithTimeout = Promise.race([
        room.connect(props.liveKitUrl, props.token, connectOptions),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout after 15 seconds')), 15000);
        })
      ]);
      
      connectWithTimeout
        .then(() => {
          console.log('✅ Successfully connected to LiveKit room');
          
          // Try to enable camera and microphone, but don't fail if it doesn't work
          room.localParticipant.enableCameraAndMicrophone().catch((error) => {
            console.warn('⚠️ Could not enable camera/microphone:', error);
            // Try just microphone
            return room.localParticipant.setMicrophoneEnabled(true).catch((micError) => {
              console.warn('⚠️ Could not enable microphone only:', micError);
            });
          });
        })
        .catch((error) => {
          console.error('❌ Failed to connect to LiveKit room:', error);
          
          // Try reconnecting after a delay
          setTimeout(() => {
            console.log('🔄 Retrying connection...');
            room.connect(props.liveKitUrl, props.token, connectOptions).catch((retryError) => {
              console.error('❌ Retry connection failed:', retryError);
            });
          }, 3000);
        });
    }
  }, [room, props.liveKitUrl, props.token, connectOptions, e2eeSetupComplete]);

  useLowCPUOptimizer(room);

  useEffect(() => {
    if (!room) return;
    
    console.log('🔊 Listening to audio track state changes');

    const handleTrackSubscribed = (track: any) => {
      if (track.kind === 'audio') {
        console.log(`🎵 Audio track subscribed: id=${track.sid}, enabled=${track.isEnabled}`);
        track.on('enabled', () => console.log(`🔊 Audio track enabled: id=${track.sid}`));
        track.on('disabled', () => console.log(`🔇 Audio track disabled: id=${track.sid}`));
        track.on('started', () => console.log(`▶️ Audio track started: id=${track.sid}`));
        track.on('stopped', () => console.log(`⏹️ Audio track stopped: id=${track.sid}`));
      }
    };

    const handleTrackUnsubscribed = (track: any) => {
      if (track.kind === 'audio') {
        console.log(`🔇 Audio track unsubscribed: id=${track.sid}`);
      }
    };

    room.on('trackSubscribed', handleTrackSubscribed);
    room.on('trackUnsubscribed', handleTrackUnsubscribed);

    return () => {
      room.off('trackSubscribed', handleTrackSubscribed);
      room.off('trackUnsubscribed', handleTrackUnsubscribed);
    };
  }, [room]);

  return (
    <div className="lk-room-container" style={{ position: 'relative' }}>
      <RoomContext.Provider value={room}>
        <KeyboardShortcuts />
        <VideoConference
          chatMessageFormatter={formatChatMessageLinks}
          SettingsComponent={
            process.env.NEXT_PUBLIC_SHOW_SETTINGS_MENU === 'true' ? SettingsMenu : undefined
          }
        />
        <DebugMode logLevel={LogLevel.debug} />
        
        {/* Version overlay */}
        <div style={{
          position: 'absolute',
          bottom: '10px',
          right: '10px',
          fontSize: '0.75rem',
          color: 'rgba(255, 255, 255, 0.7)',
          background: 'rgba(0, 0, 0, 0.5)',
          padding: '4px 8px',
          borderRadius: '4px',
          pointerEvents: 'none',
          userSelect: 'none',
          fontFamily: 'monospace'
        }}>
          v0.2.1 • 2025-08-15
        </div>
      </RoomContext.Provider>
    </div>
  );
}
