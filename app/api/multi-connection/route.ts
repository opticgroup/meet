import { randomString } from '@/lib/client-utils';
import { getLiveKitURL } from '@/lib/getLiveKitURL';
import { MultiConnectionDetails, TalkgroupRoom, TalkgroupType, TALKGROUP_PRIORITIES } from '@/lib/types';
import { AccessToken, AccessTokenOptions, VideoGrant } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const COOKIE_KEY = 'random-participant-postfix';

interface MultiConnectionRequest {
  participantName: string;
  talkgroupIds: number[];
  metadata?: string;
  region?: string;
}

interface TalkgroupData {
  id: number;
  name: string;
  type: TalkgroupType;
  priority: number;
  holdTimeSeconds: number;
  canTransmit: boolean;
  isActive: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: MultiConnectionRequest = await request.json();
    const { participantName, talkgroupIds, metadata = '', region } = body;

    if (!LIVEKIT_URL) {
      throw new Error('LIVEKIT_URL is not defined');
    }

    // Validate required fields
    if (!participantName || !talkgroupIds || !Array.isArray(talkgroupIds)) {
      return new NextResponse('Missing required fields: participantName, talkgroupIds', { 
        status: 400 
      });
    }

    if (talkgroupIds.length === 0) {
      return new NextResponse('At least one talkgroup ID is required', { 
        status: 400 
      });
    }

    // Limit simultaneous talkgroups for performance (DMR radios typically support 5-10)
    if (talkgroupIds.length > 10) {
      return new NextResponse('Maximum 10 talkgroups allowed simultaneously', { 
        status: 400 
      });
    }

    const livekitServerUrl = region ? getLiveKitURL(LIVEKIT_URL, region) : LIVEKIT_URL;
    if (livekitServerUrl === undefined) {
      throw new Error('Invalid region');
    }

    // Get participant postfix from cookie or generate new one
    let randomParticipantPostfix = request.cookies.get(COOKIE_KEY)?.value;
    if (!randomParticipantPostfix) {
      randomParticipantPostfix = randomString(4);
    }

    // Mock talkgroup data fetch (replace with actual database call)
    const talkgroupsData = await fetchTalkgroupsData(talkgroupIds);
    
    if (talkgroupsData.length !== talkgroupIds.length) {
      return new NextResponse('One or more talkgroups not found', { 
        status: 404 
      });
    }

    // Check if any talkgroups are inactive
    const inactiveTalkgroups = talkgroupsData.filter(tg => !tg.isActive);
    if (inactiveTalkgroups.length > 0) {
      return new NextResponse(`Inactive talkgroups: ${inactiveTalkgroups.map(tg => tg.name).join(', ')}`, { 
        status: 400 
      });
    }

    // Generate single token with multiple room grants
    const participantToken = await createMultiRoomToken({
      identity: `${participantName}__${randomParticipantPostfix}`,
      name: participantName,
      metadata,
    }, talkgroupsData);

    // Build room data for client
    const rooms: TalkgroupRoom[] = talkgroupsData.map(talkgroup => ({
      roomName: getRoomNameForTalkgroup(talkgroup),
      talkgroupId: talkgroup.id,
      talkgroupName: talkgroup.name,
      type: talkgroup.type,
      priority: talkgroup.priority,
      holdTimeSeconds: talkgroup.holdTimeSeconds,
      canPublish: talkgroup.canTransmit,
      canSubscribe: true, // Always allow listening
    }));

    // Sort rooms by priority (highest first) for client convenience
    rooms.sort((a, b) => b.priority - a.priority);

    // Return multi-connection details
    const data: MultiConnectionDetails = {
      serverUrl: livekitServerUrl,
      participantToken,
      participantName,
      rooms,
    };

    return new NextResponse(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `${COOKIE_KEY}=${randomParticipantPostfix}; Path=/; HttpOnly; SameSite=Strict; Secure; Expires=${getCookieExpirationTime()}`,
      },
    });
  } catch (error) {
    console.error('Error creating multi-connection:', error);
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 500 });
    }
    return new NextResponse('Internal server error', { status: 500 });
  }
}

/**
 * Create a single JWT token with grants for multiple talkgroup rooms
 */
async function createMultiRoomToken(
  userInfo: AccessTokenOptions, 
  talkgroups: TalkgroupData[]
): Promise<string> {
  const token = new AccessToken(API_KEY, API_SECRET, userInfo);
  token.ttl = '10m'; // Longer TTL for multi-room connections

  // Add a grant for each talkgroup room
  talkgroups.forEach(talkgroup => {
    const roomName = getRoomNameForTalkgroup(talkgroup);
    const grant: VideoGrant = {
      room: roomName,
      roomJoin: true,
      canPublish: talkgroup.canTransmit,
      canPublishData: true,
      canSubscribe: true,
    };
    token.addGrant(grant);
  });

  return await token.toJwt();
}

/**
 * Generate consistent room names for talkgroups
 */
function getRoomNameForTalkgroup(talkgroup: TalkgroupData): string {
  const sanitizedName = talkgroup.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `talkgroup_${talkgroup.id}_${sanitizedName}`;
}

/**
 * Mock function to fetch talkgroup data
 * Replace this with actual database queries
 */
async function fetchTalkgroupsData(talkgroupIds: number[]): Promise<TalkgroupData[]> {
  // This is a mock implementation - replace with actual database calls
  // Default talkgroups for talkgroup.ai
  
  const mockTalkgroups: TalkgroupData[] = [
    {
      id: 1,
      name: '911',
      type: 'static-priority',
      priority: 100,
      holdTimeSeconds: 0, // No hold time - always plays audio to all members
      canTransmit: true,
      isActive: true,
    },
    {
      id: 2,
      name: 'General',
      type: 'static-secondary',
      priority: 80,
      holdTimeSeconds: 120, // 2 minute default TTL timer
      canTransmit: true,
      isActive: true,
    },
    {
      id: 3,
      name: 'R&D',
      type: 'dynamic',
      priority: 50,
      holdTimeSeconds: 0, // Only locked if people are actively talking
      canTransmit: true,
      isActive: true,
    },
  ];

  // Filter to requested IDs
  return mockTalkgroups.filter(tg => talkgroupIds.includes(tg.id));

  // TODO: Replace with actual database query like:
  /*
  const query = `
    SELECT id, name, type, priority, hold_time_seconds as holdTimeSeconds, is_active as isActive
    FROM talkgroups 
    WHERE id = ANY($1) AND is_active = true
    ORDER BY priority DESC
  `;
  return await db.query(query, [talkgroupIds]);
  */
}

function getCookieExpirationTime(): string {
  const now = new Date();
  const time = now.getTime();
  const expireTime = time + 60 * 120 * 1000; // 2 hours
  now.setTime(expireTime);
  return now.toUTCString();
}
