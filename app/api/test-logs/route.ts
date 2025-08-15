import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const logs = [
    {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'TEST',
      message: 'Logging system test - deployment working',
      metadata: {
        deploymentVersion: '50f6cec',
        timestamp: Date.now()
      }
    },
    {
      timestamp: new Date().toISOString(),
      level: 'INFO', 
      category: 'TEST',
      message: 'Debug logs endpoint should be available at /debug/logs',
      metadata: {
        note: 'If you can see this, the API is working'
      }
    }
  ];

  return NextResponse.json({
    success: true,
    message: 'Logging system test endpoint',
    logs,
    instructions: 'Visit /debug/logs for full logging interface'
  });
}
