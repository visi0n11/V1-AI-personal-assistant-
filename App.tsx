
import React, { useState } from 'react';
import { 
  Mic, 
  BookOpen, 
  Phone, 
  Bell, 
  Image as ImageIcon, 
  Settings, 
  User, 
  LogOut,
  LogIn,
  UserPlus
} from 'lucide-react';
import { ModuleType, Task, Note, Message, AppNotification } from './types';
import VoiceInteraction from './components/VoiceInteraction';
import StudySupport from './components/StudySupport';
import Communication from './components/Communication';
import NotificationManager from './components/NotificationManager';
import Multimedia from './components/Multimedia';

const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<ModuleType>(ModuleType.VOICE);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Global State for Assistant Modules
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', text: 'Complete Calculus Assignment', completed: false, category: 'study' },
    { id: '2', text: 'Review Bio-Chemistry notes', completed: true, category: 'study' },
  ]);

  const [notes, setNotes] = useState<Note[]>([
    { id: '1', title: 'Neural Networks Basics', content: 'Focus on backpropagation and activation functions.', date: new Date().toLocaleDateString() },
  ]);

  const [messages, setMessages] = useState<Message[]>([
    { id: '1', contactId: '1', text: "Hey! Can we meet at 5?", timestamp: '2:15 PM', incoming: true },
  ]);

  const [notifications] = useState<AppNotification[]>([
    { id: '1', app: 'WhatsApp', sender: 'Mom', content: 'Did you finish your assignment?', timestamp: '5m ago' },
    { id: '2', app: 'Instagram', sender: 'John Doe', content: 'Liked your photo', timestamp: '12m ago' },
    { id: '3', app: 'Slack', sender: 'Dev Team', content: 'New deployment finished.', timestamp: '30m ago' },
  ]);

  // AI Function Handlers
  const handlers = {
    addNote: (title: string, content: string) => {
      const newNote: Note = { id: Date.now().toString(), title, content, date: new Date().toLocaleDateString() };
      setNotes(prev => [newNote, ...prev]);
      return "Successfully added note: " + title;
    },
    addTask: (text: string) => {
      const newTask: Task = { id: Date.now().toString(), text, completed: false, category: 'study' };
      setTasks(prev => [newTask, ...prev]);
      return "Added task to study list: " + text;
    },
    sendMessage: (recipient: string, text: string) => {
      const newMsg: Message = { id: Date.now().toString(), contactId: 'unknown', text: `To ${recipient}: ${text}`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), incoming: false };
      setMessages(prev => [...prev, newMsg]);
      return `Message sent to ${recipient}.`;
    },
    getNotifications: () => JSON.stringify(notifications)
  };

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
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} flex flex-col transition-all duration-300 border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl z-50`}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-500/20">V1</div>
          {isSidebarOpen && <span className="font-bold text-xl tracking-tight">Assistant</span>}
        </div>
        <nav className="flex-1 px-3 space-y-2 mt-4">
          {modules.map((m) => (
            <button key={m.id} onClick={() => setActiveModule(m.id)} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group ${activeModule === m.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
              <m.icon size={22} className={activeModule === m.id ? 'animate-pulse' : ''} />
              {isSidebarOpen && <span className="font-medium">{m.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="w-full flex items-center gap-4 px-4 py-3 text-slate-400 hover:text-white transition-colors">
            <Settings size={22} />
            {isSidebarOpen && <span className="font-medium text-sm">Collapse View</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 relative flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 px-8 flex items-center justify-between border-b border-slate-800/50 bg-slate-900/30 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">V1 System:</span>
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live
            </span>
          </div>

          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-semibold">Alex StudyAccount</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Premium User</div>
                </div>
                <div className="group relative">
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border border-slate-600 cursor-pointer hover:border-blue-500 transition-colors">
                    <User size={20} />
                  </div>
                  <div className="absolute right-0 top-12 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <button onClick={() => setIsLoggedIn(false)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                      <LogOut size={16} /> Log Out
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button onClick={() => setIsLoggedIn(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-xl transition-all">
                  <LogIn size={16} /> Log In
                </button>
                <button onClick={() => setIsLoggedIn(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95">
                  <UserPlus size={16} /> Register
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Module Display */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto w-full h-full">
            {activeModule === ModuleType.VOICE && <VoiceInteraction handlers={handlers} />}
            {activeModule === ModuleType.STUDY && <StudySupport tasks={tasks} notes={notes} />}
            {activeModule === ModuleType.COMMUNICATION && <Communication messages={messages} />}
            {activeModule === ModuleType.NOTIFICATIONS && <NotificationManager notifications={notifications} />}
            {activeModule === ModuleType.MULTIMEDIA && <Multimedia />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
