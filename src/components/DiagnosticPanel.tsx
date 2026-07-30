import React from 'react';

interface DiagnosticPanelProps {
  twitchUsername: string;
  sessionId: string | null;
  isMaster: boolean;
  chatStatus: string;
  joinStatus: string;
  lastMessageAt: string | null;
  lastFlushAt: string | null;
  lastRpcError: string | null;
  currentBatchSize: number;
  realtimeStatus: string;
}

export default function DiagnosticPanel(props: DiagnosticPanelProps) {
  return (
    <div className="absolute top-4 right-4 z-[999] bg-black/80 text-white p-4 rounded-lg border border-red-500/50 shadow-2xl text-xs font-mono max-w-sm pointer-events-none backdrop-blur-sm">
      <h3 className="text-red-400 font-bold mb-2 border-b border-red-500/30 pb-1">DIAGNOSTICS (DEBUG)</h3>
      <div className="space-y-1">
        <div><span className="text-gray-400">Username:</span> {props.twitchUsername || 'N/A'}</div>
        <div><span className="text-gray-400">Session ID:</span> {props.sessionId || 'N/A'}</div>
        <div><span className="text-gray-400">Is Master:</span> {props.isMaster ? <span className="text-green-400">YES</span> : <span className="text-red-400">NO</span>}</div>
        <div><span className="text-gray-400">Chat Status:</span> {props.chatStatus}</div>
        <div><span className="text-gray-400">Join Status:</span> {props.joinStatus}</div>
        <div><span className="text-gray-400">Realtime:</span> {props.realtimeStatus}</div>
        <div><span className="text-gray-400">Batch Size:</span> {props.currentBatchSize}</div>
        
        <div className="pt-1 mt-1 border-t border-gray-800">
          <span className="text-gray-400">Last Msg:</span> {props.lastMessageAt ? new Date(props.lastMessageAt).toLocaleTimeString() : 'Never'}
        </div>
        <div>
          <span className="text-gray-400">Last Flush:</span> {props.lastFlushAt ? new Date(props.lastFlushAt).toLocaleTimeString() : 'Never'}
        </div>
        
        {props.lastRpcError && (
          <div className="pt-2 mt-2 border-t border-red-900/50 text-red-400 break-words">
            <strong>RPC Error:</strong> {props.lastRpcError}
          </div>
        )}
      </div>
    </div>
  );
}
