
import React from 'react';
import { Bell, MoreHorizontal, MessageSquare, Instagram, Slack, Check, BrainCircuit } from 'lucide-react';
import { AppNotification } from '../types';

const NotificationManager: React.FC = () => {
  const notifications: AppNotification[] = [
    { id: '1', app: 'WhatsApp', sender: 'Mom', content: 'Did you finish your assignment?', timestamp: '5m ago' },
    { id: '2', app: 'Instagram', sender: 'John Doe', content: 'Liked your photo', timestamp: '12m ago' },
    { id: '3', app: 'Slack', sender: 'Dev Team', content: 'New deployment finished. Check the logs.', timestamp: '30m ago' },
  ];

  const getAppIcon = (app: string) => {
    switch (app) {
      case 'WhatsApp': return <div className="p-2 bg-emerald-500/20 text-emerald-500 rounded-lg"><MessageSquare size={16} /></div>;
      case 'Instagram': return <div className="p-2 bg-pink-500/20 text-pink-500 rounded-lg"><Instagram size={16} /></div>;
      case 'Slack': return <div className="p-2 bg-purple-500/20 text-purple-500 rounded-lg"><Slack size={16} /></div>;
      default: return <Bell size={16} />;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="glass-panel rounded-3xl p-8 bg-gradient-to-br from-blue-900/40 via-slate-900 to-slate-950 border-blue-500/20 flex flex-col md:flex-row items-center gap-6">
        <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
          <BrainCircuit size={48} />
        </div>
        <div className="flex-1 text-center md:text-left">
          <h2 className="text-2xl font-bold mb-2">Smart Notification Summary</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            V1 has analyzed 12 notifications in the last hour. You have 3 urgent messages and 2 reminders. Would you like me to read them out?
          </p>
        </div>
        <button className="px-6 py-3 bg-white text-slate-950 rounded-2xl font-bold hover:bg-slate-200 transition-colors whitespace-nowrap">
          Read Summary
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-4">
          <h3 className="font-bold text-slate-400 uppercase text-xs tracking-widest">Recent Alerts</h3>
          <button className="text-sm font-medium text-blue-400 hover:text-blue-300">Mark all as read</button>
        </div>

        <div className="grid gap-3">
          {notifications.map(notif => (
            <div key={notif.id} className="glass-panel p-4 rounded-2xl hover:bg-slate-900/80 transition-all flex items-center gap-4 group">
              {getAppIcon(notif.app)}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-sm">{notif.sender} <span className="text-slate-500 font-normal">via</span> {notif.app}</span>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">{notif.timestamp}</span>
                </div>
                <p className="text-sm text-slate-300">{notif.content}</p>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-2 hover:bg-blue-600/20 text-blue-400 rounded-lg transition-colors">
                  <Check size={18} />
                </button>
                <button className="p-2 hover:bg-slate-800 text-slate-400 rounded-lg transition-colors">
                  <MoreHorizontal size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NotificationManager;
