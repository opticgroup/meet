import { LocalAudioTrack, LocalVideoTrack, videoCodecs } from 'livekit-client';
import { VideoCodec } from 'livekit-client';

export interface SessionProps {
  roomName: string;
  identity: string;
  audioTrack?: LocalAudioTrack;
  videoTrack?: LocalVideoTrack;
  region?: string;
  turnServer?: RTCIceServer;
  forceRelay?: boolean;
}

export interface TokenResult {
  identity: string;
  accessToken: string;
}

export function isVideoCodec(codec: string): codec is VideoCodec {
  return videoCodecs.includes(codec as VideoCodec);
}

export type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

export interface MultiConnectionDetails {
  serverUrl: string;
  participantToken: string; // Single JWT with multiple room grants
  participantName: string;
  rooms: TalkgroupRoom[];
}

export interface TalkgroupRoom {
  roomName: string;
  talkgroupId: number;
  talkgroupName: string;
  type: TalkgroupType;
  priority: number;
  holdTimeSeconds: number;
  canPublish: boolean;
  canSubscribe: boolean;
  userSettings?: UserTalkgroupSettings;
}

export type TalkgroupType = 'static-priority' | 'static-secondary' | 'dynamic' | 'adhoc';

export interface UserTalkgroupSettings {
  userId: number;
  talkgroupId: number;
  isMuted: boolean;
  volume: number; // 0.0 - 1.0
  joinedAt: string;
}

export interface TalkgroupPriority {
  type: TalkgroupType;
  priority: number;
  description: string;
  duckingBehavior: DuckingBehavior;
}

export interface DuckingBehavior {
  overrides: TalkgroupType[]; // Which types this can duck
  duckedBy: TalkgroupType[]; // Which types can duck this
  duckLevel: number; // 0.0 = silent, 1.0 = full volume
  responseTimeMs: number; // How fast to apply ducking
  holdTimeMs: number; // How long to hold before restoring
}

// DMR Priority System
export const TALKGROUP_PRIORITIES: Record<TalkgroupType, TalkgroupPriority> = {
  'static-priority': {
    type: 'static-priority',
    priority: 100,
    description: 'Emergency/911 - Always overrides everything',
    duckingBehavior: {
      overrides: ['static-secondary', 'dynamic', 'adhoc'],
      duckedBy: [],
      duckLevel: 0.0, // Completely duck others
      responseTimeMs: 50,
      holdTimeMs: 0 // Never hold, immediately restore when done
    }
  },
  'static-secondary': {
    type: 'static-secondary',
    priority: 80,
    description: 'Department channels - Duck dynamic when active',
    duckingBehavior: {
      overrides: ['dynamic', 'adhoc'],
      duckedBy: ['static-priority'],
      duckLevel: 0.3, // Duck others to 30%
      responseTimeMs: 100,
      holdTimeMs: 2000 // 2 second hold time
    }
  },
  'dynamic': {
    type: 'dynamic',
    priority: 50,
    description: 'User-initiated conversations',
    duckingBehavior: {
      overrides: ['adhoc'],
      duckedBy: ['static-priority', 'static-secondary'],
      duckLevel: 0.6, // Duck adhoc to 60%
      responseTimeMs: 100,
      holdTimeMs: 3000 // 3 second hold time
    }
  },
  'adhoc': {
    type: 'adhoc',
    priority: 40,
    description: 'Temporary incident channels',
    duckingBehavior: {
      overrides: [],
      duckedBy: ['static-priority', 'static-secondary', 'dynamic'],
      duckLevel: 0.0, // Doesn't duck anything
      responseTimeMs: 150,
      holdTimeMs: 3000
    }
  }
};

export interface AudioDuckingState {
  activeSpeakers: Map<string, {
    roomId: string;
    priority: number;
    startTime: number;
    holdUntil?: number;
  }>;
  gainNodes: Map<string, GainNode>;
  roomPriorities: Map<string, number>;
  userSettings: Map<string, UserTalkgroupSettings>;
}

export interface ExtendedTalkgroup {
  id: number;
  name: string;
  description: string | null;
  type: TalkgroupType;
  priority: number;
  holdTimeSeconds: number;
  parentId: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Navigation properties
  members?: TalkgroupMember[];
  userSettings?: UserTalkgroupSettings;
}

export interface TalkgroupMember {
  userId: number;
  username: string;
  email: string;
  role: string;
  canTransmit: boolean;
  joinedAt: string;
}
