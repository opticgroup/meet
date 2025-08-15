import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Simple endpoint that returns current server time and deployment info
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    message: 'Debug endpoint working',
    deployment: {
      build: '74d9049',
      stage: 'production',
      serverTime: Date.now()
    },
    instructions: [
      'This confirms the API is working',
      'For debugging talkgroup issues:',
      '1. Open browser dev tools (F12)',
      '2. Go to Console tab',
      '3. Navigate to /talkgroups and use the app',
      '4. Report any red errors you see in console'
    ]
  });
}
