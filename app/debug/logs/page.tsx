'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

// Client-only component wrapper to prevent hydration issues
const ClientOnly = ({ children }: { children: React.ReactNode }) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return <>{children}</>;
};

interface LogEntry {
  timestamp: string;
  level: string;
  category: string;
  message: string;
  metadata?: Record<string, any>;
  requestId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const levelColors = {
    ERROR: 'text-red-400 bg-red-900/20 border-red-500',
    WARN: 'text-yellow-400 bg-yellow-900/20 border-yellow-500',
    INFO: 'text-blue-400 bg-blue-900/20 border-blue-500',
    DEBUG: 'text-gray-400 bg-gray-900/20 border-gray-500',
  };

  const categoryColors = {
    API_REQUEST: 'bg-green-900/20 text-green-400',
    API_RESPONSE: 'bg-green-900/20 text-green-400',
    LIVEKIT: 'bg-purple-900/20 text-purple-400',
    LIVEKIT_ERROR: 'bg-red-900/20 text-red-400',
    MULTI_CONNECTION_API: 'bg-orange-900/20 text-orange-400',
    REQUEST: 'bg-cyan-900/20 text-cyan-400',
    LOGS_API: 'bg-indigo-900/20 text-indigo-400',
  };

  useEffect(() => {
    const connectEventSource = () => {
      const eventSource = new EventSource('/api/logs?stream=true&limit=100');
      eventSourceRef.current = eventSource;
      
      eventSource.onopen = () => {
        setIsConnected(true);
        console.log('Connected to log stream');
      };
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'initial') {
            setLogs(data.logs);
          } else if (data.type === 'log') {
            setLogs(prevLogs => [...prevLogs, data.log]);
          }
        } catch (error) {
          console.error('Error parsing log event:', error);
        }
      };
      
      eventSource.onerror = () => {
        setIsConnected(false);
        console.log('Disconnected from log stream');
        
        // Reconnect after a delay
        setTimeout(() => {
          if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
            connectEventSource();
          }
        }, 3000);
      };
    };

    connectEventSource();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log => {
    if (filter && !log.message.toLowerCase().includes(filter.toLowerCase()) && 
        !JSON.stringify(log.metadata || {}).toLowerCase().includes(filter.toLowerCase())) {
      return false;
    }
    if (levelFilter && log.level !== levelFilter) {
      return false;
    }
    if (categoryFilter && log.category !== categoryFilter) {
      return false;
    }
    return true;
  });

  const clearLogs = async () => {
    try {
      await fetch('/api/logs', { method: 'DELETE' });
      setLogs([]);
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  const exportLogs = () => {
    const dataStr = JSON.stringify(filteredLogs, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `talkgroup-logs-${new Date().toISOString().slice(0, 19)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit'
    }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
  };

  const categories = Array.from(new Set(logs.map(log => log.category)));
  const levels = Array.from(new Set(logs.map(log => log.level)));

  return (
    <ClientOnly>
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-yellow-400">📻 TalkGroup.ai Debug Logs</h1>
              <p className="text-gray-400 mt-2">
                Real-time server logging for debugging talkgroup issues
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className={`px-3 py-1 rounded-full text-sm ${
                isConnected ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'
              }`}>
                {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </div>
              
              <button
                onClick={clearLogs}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white text-sm transition-colors"
              >
                Clear Logs
              </button>
              
              <button
                onClick={exportLogs}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm transition-colors"
              >
                Export Logs
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-4 mb-4 flex-wrap">
            <div className="flex-1 min-w-64">
              <input
                type="text"
                placeholder="Search logs..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400"
              />
            </div>
            
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
            >
              <option value="">All Levels</option>
              {levels.map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
            
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
            >
              <option value="">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded"
              />
              Auto-scroll
            </label>
          </div>

          {/* Stats */}
          <div className="text-sm text-gray-400 mb-4">
            Showing {filteredLogs.length} of {logs.length} logs
          </div>
        </div>

        {/* Logs Container */}
        <div 
          ref={logsContainerRef}
          className="bg-gray-800 rounded-lg border border-gray-700 h-[calc(100vh-320px)] overflow-y-auto p-4 font-mono text-sm"
        >
          {filteredLogs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              {logs.length === 0 ? 'No logs yet. Start using the app to see logs here.' : 'No logs match your filters.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log, index) => (
                <div 
                  key={index}
                  className={`border-l-4 pl-4 py-2 rounded ${
                    levelColors[log.level as keyof typeof levelColors] || 'text-gray-400 bg-gray-900/20 border-gray-500'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-400 font-mono text-xs">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      levelColors[log.level as keyof typeof levelColors]?.replace('text-', 'text-') || 'text-gray-400'
                    }`}>
                      {log.level}
                    </span>
                    
                    <span className={`px-2 py-1 rounded text-xs ${
                      categoryColors[log.category as keyof typeof categoryColors] || 'bg-gray-900/20 text-gray-400'
                    }`}>
                      {log.category}
                    </span>
                    
                    {log.requestId && (
                      <span className="px-2 py-1 bg-gray-900/20 text-gray-400 rounded text-xs font-mono">
                        req:{log.requestId}
                      </span>
                    )}
                  </div>
                  
                  <div className="font-medium mb-2">
                    {log.message}
                  </div>
                  
                  {(log.metadata || log.error) && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-gray-400 hover:text-white text-xs">
                        Show details
                      </summary>
                      <pre className="mt-2 text-xs bg-gray-900/50 p-2 rounded overflow-x-auto text-gray-300">
                        {JSON.stringify({ metadata: log.metadata, error: log.error }, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </ClientOnly>
  );
}
