
import React from 'react';
import { Bell, MessageSquare, Instagram, Slack, Check, BrainCircuit } from 'lucide-react';
import { AppNotification } from '../types';

interface NotificationManagerProps {
  notifications: AppNotification[];
}

const NotificationManager: React.FC<NotificationManagerProps> = ({ notifications }) => {
  const getIcon = (app: string) => {
    switch (app) {
      case 'WhatsApp': return <MessageSquare className="text-emerald-500" />;
      case 'Instagram': return <Instagram className="text-pink-500" />;
      case 'Slack': return <Slack className="text-purple-500" />;
      default: return <Bell />;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="glass-panel rounded-3xl p-8 bg-gradient-to-br from-blue-900/40 to-slate-950 border-blue-500/20 flex items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg"><BrainCircuit size={32} /></div>
        <div className="flex-1">
          <h2 className="text-xl font-bold">V1 Intelligence</h2>
          <p className="text-slate-400 text-sm">V1 is monitoring {notifications.length} notifications. Ask it to read them aloud!</p>
        </div>
        <button className="px-6 py-2 bg-white text-slate-950 rounded-xl font-bold">Read All</button>
      </div>

      <div className="space-y-3">
        {notifications.map(n => (
          <div key={n.id} className="glass-panel p-4 rounded-2xl flex items-center gap-4 hover:bg-slate-900/50">
            <div className="p-2 bg-slate-800 rounded-lg">{getIcon(n.app)}</div>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-sm">{n.sender} via {n.app}</span>
                <span className="text-[10px] text-slate-500">{n.timestamp}</span>
              </div>
              <p className="text-sm text-slate-400">{n.content}</p>
            </div>
            <button className="text-blue-500"><Check size={20} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotificationManager;
