import React from 'react';
import { DiagnosticData } from '@/hooks/useDiagnostics';

interface DiagnosticPanelProps {
  twitchUsername: string;
  sessionId: string | null;
  realtimeStatus: string;
  diag: DiagnosticData | null;
}

export default function DiagnosticPanel(props: DiagnosticPanelProps) {
  return (
    <div className="absolute top-4 right-4 z-[999] bg-black/80 text-white p-4 rounded-lg border border-red-500/50 shadow-2xl text-xs font-mono max-w-sm pointer-events-none backdrop-blur-sm">
      <h3 className="text-red-400 font-bold mb-2 border-b border-red-500/30 pb-1">DIAGNOSTICS (DEBUG)</h3>
      <div className="space-y-1">
        <div><span className="text-gray-400">Username:</span> {props.twitchUsername || 'N/A'}</div>
        <div><span className="text-gray-400">Session ID:</span> {props.sessionId || 'N/A'}</div>
        <div><span className="text-gray-400">Realtime:</span> {props.realtimeStatus}</div>
        
        <div className="pt-2 mt-2 border-t border-gray-800">
          <div><span className="text-gray-400">EventSub Status:</span> {props.diag?.subscription_status || 'UNKNOWN'}</div>
          <div className="truncate"><span className="text-gray-400">Sub ID:</span> {props.diag?.subscription_id || 'N/A'}</div>
        </div>

        <div className="pt-2 mt-2 border-t border-gray-800">
          <div><span className="text-gray-400">Last Webhook:</span> {props.diag?.last_webhook_received_at ? new Date(props.diag.last_webhook_received_at).toLocaleTimeString() : 'Never'}</div>
          <div><span className="text-gray-400">Last DB Inc:</span> {props.diag?.last_db_increment_at ? new Date(props.diag.last_db_increment_at).toLocaleTimeString() : 'Never'}</div>
          <div className="truncate"><span className="text-gray-400">Last Msg ID:</span> {props.diag?.last_message_id || 'None'}</div>
          <div><span className="text-gray-400">Last Chatter:</span> {props.diag?.last_chatter_username || 'None'}</div>
        </div>
        
        {props.diag?.last_webhook_error && (
          <div className="pt-2 mt-2 border-t border-red-900/50 text-red-400 break-words">
            <strong>Webhook Error:</strong> {props.diag.last_webhook_error}
          </div>
        )}
      </div>
    </div>
  );
}
