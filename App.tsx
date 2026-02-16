
import React, { useState, useEffect } from 'react';
import { 
  Mic, 
  BookOpen, 
  Phone, 
  Bell, 
  Image as ImageIcon, 
  Settings, 
  User, 
  Home,
  MessageSquare
} from 'lucide-react';
import { ModuleType } from './types';
import VoiceInteraction from './components/VoiceInteraction';
import StudySupport from './components/StudySupport';
import Communication from './components/Communication';
import NotificationManager from './components/NotificationManager';
import Multimedia from './components/Multimedia';

const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<ModuleType>(ModuleType.VOICE);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const modules = [
    { id: ModuleType.VOICE, icon: Mic, label: 'Voice Assistant' },
    { id: ModuleType.STUDY, icon: BookOpen, label: 'Study Support' },
    { id: ModuleType.COMMUNICATION, icon: Phone, label: 'Calls & Texts' },
    { id: ModuleType.NOTIFICATIONS, icon: Bell, label: 'Notifications' },
    { id: ModuleType.MULTIMEDIA, icon: ImageIcon, label: 'Multimedia' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } flex flex-col transition-all duration-300 border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl z-50`}
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-500/20">V1</div>
          {isSidebarOpen && <span className="font-bold text-xl tracking-tight">Assistant</span>}
        </div>

        <nav className="flex-1 px-3 space-y-2 mt-4">
          {modules.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveModule(m.id)}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group ${
                activeModule === m.id 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <m.icon size={22} className={activeModule === m.id ? 'animate-pulse' : ''} />
              {isSidebarOpen && <span className="font-medium">{m.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full flex items-center gap-4 px-4 py-3 text-slate-400 hover:text-white transition-colors"
          >
            <Settings size={22} />
            {isSidebarOpen && <span className="font-medium text-sm">Collapse View</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 relative flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 px-8 flex items-center justify-between border-b border-slate-800/50 bg-slate-900/30 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Status:</span>
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Online
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold">User Profile</div>
              <div className="text-xs text-slate-400 italic">Advanced Plan</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-700 to-slate-500 flex items-center justify-center border border-slate-600">
              <User size={20} />
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
          <div className="max-w-6xl mx-auto w-full h-full">
            {activeModule === ModuleType.VOICE && <VoiceInteraction />}
            {activeModule === ModuleType.STUDY && <StudySupport />}
            {activeModule === ModuleType.COMMUNICATION && <Communication />}
            {activeModule === ModuleType.NOTIFICATIONS && <NotificationManager />}
            {activeModule === ModuleType.MULTIMEDIA && <Multimedia />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
