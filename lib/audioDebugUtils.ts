/**
 * Audio debugging utilities for monitoring browser audio state
 */

export interface AudioElementInfo {
  id?: string;
  src?: string;
  srcObject?: boolean;
  volume: number;
  muted: boolean;
  paused: boolean;
  currentTime: number;
  duration: number;
  readyState: number;
  networkState: number;
  autoplay: boolean;
  controls: boolean;
  dataset: Record<string, string>;
}

export interface AudioContextInfo {
  state: AudioContextState;
  sampleRate: number;
  currentTime: number;
  baseLatency?: number;
  outputLatency?: number;
}

export interface WebAudioDebugInfo {
  audioElements: AudioElementInfo[];
  audioContext: AudioContextInfo | null;
  mediaDevices: {
    available: boolean;
    enumerateDevices: boolean;
    getUserMedia: boolean;
  };
  permissions: {
    microphone?: PermissionState;
    camera?: PermissionState;
  };
}

/**
 * Get detailed information about all audio elements on the page
 */
export function getAudioElementsInfo(): AudioElementInfo[] {
  const audioElements = document.querySelectorAll('audio');
  
  return Array.from(audioElements).map((audio, index) => ({
    id: audio.id || `audio-${index}`,
    src: audio.src,
    srcObject: !!audio.srcObject,
    volume: audio.volume,
    muted: audio.muted,
    paused: audio.paused,
    currentTime: audio.currentTime,
    duration: audio.duration,
    readyState: audio.readyState,
    networkState: audio.networkState,
    autoplay: audio.autoplay,
    controls: audio.controls,
    dataset: Object.fromEntries(Object.entries(audio.dataset).filter(([_, value]) => value !== undefined)) as Record<string, string>,
  }));
}

/**
 * Get AudioContext information
 */
export function getAudioContextInfo(audioContext: AudioContext | null): AudioContextInfo | null {
  if (!audioContext) return null;
  
  return {
    state: audioContext.state,
    sampleRate: audioContext.sampleRate,
    currentTime: audioContext.currentTime,
    baseLatency: audioContext.baseLatency,
    outputLatency: audioContext.outputLatency,
  };
}

/**
 * Check media devices capabilities
 */
export async function getMediaDevicesInfo() {
  const hasMediaDevices = 'mediaDevices' in navigator;
  const hasEnumerateDevices = hasMediaDevices && 'enumerateDevices' in navigator.mediaDevices;
  const hasGetUserMedia = hasMediaDevices && 'getUserMedia' in navigator.mediaDevices;
  
  return {
    available: hasMediaDevices,
    enumerateDevices: hasEnumerateDevices,
    getUserMedia: hasGetUserMedia,
  };
}

/**
 * Check permissions status
 */
export async function getPermissionsInfo() {
  const permissions: { microphone?: PermissionState; camera?: PermissionState } = {};
  
  try {
    if ('permissions' in navigator) {
      const micPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      permissions.microphone = micPermission.state;
      
      const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
      permissions.camera = cameraPermission.state;
    }
  } catch (error) {
    console.warn('Could not check permissions:', error);
  }
  
  return permissions;
}

/**
 * Get comprehensive web audio debug information
 */
export async function getWebAudioDebugInfo(audioContext?: AudioContext | null): Promise<WebAudioDebugInfo> {
  const [mediaDevices, permissions] = await Promise.all([
    getMediaDevicesInfo(),
    getPermissionsInfo(),
  ]);
  
  return {
    audioElements: getAudioElementsInfo(),
    audioContext: getAudioContextInfo(audioContext || null),
    mediaDevices,
    permissions,
  };
}

/**
 * Log comprehensive audio debug information to console
 */
export async function logAudioDebugInfo(audioContext?: AudioContext | null): Promise<void> {
  const debugInfo = await getWebAudioDebugInfo(audioContext);
  
  console.group('🎧 Audio Debug Information');
  
  console.log('📱 Media Devices:', debugInfo.mediaDevices);
  console.log('🔒 Permissions:', debugInfo.permissions);
  
  if (debugInfo.audioContext) {
    console.log('🎛️ AudioContext:', debugInfo.audioContext);
  } else {
    console.log('🎛️ AudioContext: Not available');
  }
  
  console.log(`🔊 Audio Elements (${debugInfo.audioElements.length}):`);
  debugInfo.audioElements.forEach((element, index) => {
    console.log(`  ${index + 1}. ${element.id}:`, element);
  });
  
  console.groupEnd();
}

/**
 * Set up periodic audio debugging (useful for troubleshooting)
 */
export function setupPeriodicAudioDebugging(
  intervalMs: number = 10000,
  audioContext?: AudioContext | null
): () => void {
  console.log(`🔍 Setting up periodic audio debugging every ${intervalMs}ms`);
  
  const interval = setInterval(() => {
    logAudioDebugInfo(audioContext);
  }, intervalMs);
  
  return () => {
    console.log('🛑 Stopping periodic audio debugging');
    clearInterval(interval);
  };
}

/**
 * Test if browser can play audio
 */
export async function testBrowserAudioPlayback(): Promise<boolean> {
  try {
    // Create a short sine wave audio buffer
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.1, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Generate a short tone
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.sin(2 * Math.PI * 440 * i / audioContext.sampleRate) * 0.1;
    }
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
    
    // Clean up
    setTimeout(() => {
      audioContext.close();
    }, 200);
    
    console.log('✅ Browser audio playback test: SUCCESS');
    return true;
  } catch (error) {
    console.error('❌ Browser audio playback test: FAILED', error);
    return false;
  }
}
