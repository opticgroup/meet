import { NextRequest, NextResponse } from 'next/server';
import { serverLogger, LogLevel, LogEntry } from '@/lib/serverLogger';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const level = searchParams.get('level') as LogLevel;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
  const stream = searchParams.get('stream') === 'true';

  try {
    if (stream) {
      // Server-Sent Events for real-time log streaming
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        start(controller) {
          // Send initial logs
          const initialLogs = serverLogger.getRecentLogs(limit);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'initial', logs: initialLogs })}\n\n`)
          );

          // Add listener for new logs
          const listener = (log: LogEntry) => {
            // Filter by category if specified
            if (category && log.category !== category) return;
            // Filter by level if specified  
            if (level && log.level !== level) return;

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'log', log })}\n\n`)
            );
          };

          serverLogger.addListener(listener);

          // Clean up on close
          request.signal.addEventListener('abort', () => {
            serverLogger.removeListener(listener);
            controller.close();
          });
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // Regular JSON response with filtered logs
      let logs: LogEntry[];

      if (category) {
        logs = serverLogger.getLogsByCategory(category, limit);
      } else if (level) {
        logs = serverLogger.getLogsByLevel(level, limit);
      } else {
        logs = serverLogger.getRecentLogs(limit);
      }

      return NextResponse.json({
        success: true,
        logs,
        total: logs.length,
        filters: { category, level, limit }
      });
    }
  } catch (error) {
    serverLogger.error('LOGS_API', 'Failed to retrieve logs', { error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
    
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve logs' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    serverLogger.clear();
    serverLogger.info('LOGS_API', 'Logs cleared by request');
    
    return NextResponse.json({
      success: true,
      message: 'Logs cleared'
    });
  } catch (error) {
    serverLogger.error('LOGS_API', 'Failed to clear logs', { error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
    
    return NextResponse.json(
      { success: false, error: 'Failed to clear logs' },
      { status: 500 }
    );
  }
}
