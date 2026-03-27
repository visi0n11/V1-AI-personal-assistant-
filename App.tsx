
import React, { useState, useEffect } from 'react';
import { 
  Mic, 
  BookOpen, 
  Phone, 
  Bell, 
  Image as ImageIcon, 
  Settings,
  Sparkles
} from 'lucide-react';
import { ModuleType, Task, Note, Message, AppNotification } from './types.ts';
import VoiceInteraction from './components/VoiceInteraction.tsx';
import StudySupport from './components/StudySupport.tsx';
import Communication from './components/Communication.tsx';
import NotificationManager from './components/NotificationManager.tsx';
import Multimedia from './components/Multimedia.tsx';

// Firebase imports
import { db } from './firebase.ts';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  getDocFromServer
} from 'firebase/firestore';

const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<ModuleType>(ModuleType.VOICE);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [envError, setEnvError] = useState<string | null>(null);

  useEffect(() => {
    if (!process.env.API_KEY && !process.env.GEMINI_API_KEY) {
      setEnvError("API_KEY is missing from the environment. Please set it in your environment variables.");
    }
  }, []);

  // Multimedia State
  const [mediaState, setMediaState] = useState({
    isPlaying: false,
    currentTrack: "Infinite Horizon",
    artist: "Atmospheric Dreams",
    flashActive: false
  });

  // Global Content State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const [notifications] = useState<AppNotification[]>([
    { id: '1', app: 'WhatsApp', sender: 'Mom', content: 'Did you finish your assignment?', timestamp: '5m ago' },
    { id: '2', app: 'Instagram', sender: 'John Doe', content: 'Liked your photo', timestamp: '12m ago' },
    { id: '3', app: 'Slack', sender: 'Dev Team', content: 'New deployment finished.', timestamp: '30m ago' },
  ]);

  // Firestore Listeners
  useEffect(() => {
    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    const tasksUnsubscribe = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(tasksData);
    }, (error) => console.error("Tasks listener error:", error));

    const notesUnsubscribe = onSnapshot(collection(db, 'notes'), (snapshot) => {
      const notesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note));
      setNotes(notesData);
    }, (error) => console.error("Notes listener error:", error));

    const messagesUnsubscribe = onSnapshot(query(collection(db, 'messages'), orderBy('timestamp', 'asc')), (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(messagesData);
    }, (error) => console.error("Messages listener error:", error));

    return () => {
      tasksUnsubscribe();
      notesUnsubscribe();
      messagesUnsubscribe();
    };
  }, []);

  // Firestore Actions
  const toggleTask = async (taskId: string, completed: boolean) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), { completed: !completed });
    } catch (error) {
      console.error("Error toggling task:", error);
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      await deleteDoc(doc(db, 'notes', noteId));
    } catch (error) {
      console.error("Error deleting note:", error);
    }
  };

  // AI Function Handlers
  const handlers = {
    addNote: async (title: string, content: string) => {
      try {
        const newNote = { title, content, date: new Date().toLocaleDateString() };
        await addDoc(collection(db, 'notes'), newNote);
        return "Successfully added note: " + title;
      } catch (error) {
        console.error("Error adding note:", error);
        return "Failed to add note.";
      }
    },
    addTask: async (text: string, category: 'study' | 'personal' | 'work' = 'study') => {
      try {
        const newTask = { text, completed: false, category };
        await addDoc(collection(db, 'tasks'), newTask);
        return `Added task to ${category} list: ${text}`;
      } catch (error) {
        console.error("Error adding task:", error);
        return "Failed to add task.";
      }
    },
    sendMessage: async (recipient: string, text: string) => {
      try {
        const newMsg = { 
          contactId: 'unknown', 
          text: `To ${recipient}: ${text}`, 
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
          incoming: false 
        };
        await addDoc(collection(db, 'messages'), newMsg);
        return `Message sent to ${recipient}.`;
      } catch (error) {
        console.error("Error sending message:", error);
        return "Failed to send message.";
      }
    },
    controlMedia: (action: string) => {
      if (action === 'play') setMediaState(s => ({ ...s, isPlaying: true }));
      if (action === 'pause') setMediaState(s => ({ ...s, isPlaying: false }));
      if (action === 'next') setMediaState(s => ({ ...s, currentTrack: "Neon Nights", artist: "Retro Wave" }));
      if (action === 'capture') {
        setMediaState(s => ({ ...s, flashActive: true }));
        setTimeout(() => setMediaState(s => ({ ...s, flashActive: false })), 300);
        return "Photo captured successfully!";
      }
      return `Media ${action}ed.`;
    },
    getNotifications: () => JSON.stringify(notifications),
    getTime: () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    openUrl: (target: string) => {
      let url = target.toLowerCase();
      if (url.includes('google')) url = 'https://google.com';
      else if (url.includes('youtube')) url = 'https://youtube.com';
      else if (!url.startsWith('http')) url = `https://${url}`;
      window.open(url, '_blank');
      return `Opening ${url}`;
    }
  };

  const modules = [
    { id: ModuleType.VOICE, icon: Mic, label: 'Voice Assistant' },
    { id: ModuleType.STUDY, icon: BookOpen, label: 'Study Support' },
    { id: ModuleType.COMMUNICATION, icon: Phone, label: 'Calls & Texts' },
    { id: ModuleType.NOTIFICATIONS, icon: Bell, label: 'Notifications' },
    { id: ModuleType.MULTIMEDIA, icon: ImageIcon, label: 'Multimedia' },
  ];

  return (
    <div className={`flex h-screen overflow-hidden bg-[#020617] text-slate-100 transition-colors duration-300 ${mediaState.flashActive ? 'bg-white' : ''}`}>
      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} flex flex-col transition-all duration-300 border-r border-slate-800 bg-slate-900/40 backdrop-blur-2xl z-50`}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-500/30">V1</div>
          {isSidebarOpen && <span className="font-bold text-xl tracking-tight">Assistant</span>}
        </div>
        <nav className="flex-1 px-3 space-y-2 mt-4">
          {modules.map((m) => (
            <button 
              key={m.id} 
              onClick={() => setActiveModule(m.id as ModuleType)} 
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group ${activeModule === m.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30 scale-[1.02]' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <m.icon size={22} className={activeModule === m.id ? 'animate-pulse' : ''} />
              {isSidebarOpen && <span className="font-medium">{m.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="w-full flex items-center gap-4 px-4 py-3 text-slate-400 hover:text-white transition-colors">
            <Settings size={22} />
            {isSidebarOpen && <span className="font-medium text-sm">Settings</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 relative flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 px-8 flex items-center justify-between border-b border-slate-800/50 bg-slate-900/30 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">System Status:</span>
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              Synchronized
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-bold">Public Assistant</div>
                <div className="text-[10px] text-blue-400 uppercase tracking-widest font-black">Level 5 Assistant</div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center border border-white/10 shadow-lg">
                <Sparkles size={20} className="text-white" />
              </div>
            </div>
          </div>
        </header>

        {/* Module Display */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
          <div className="max-w-6xl mx-auto w-full h-full">
            {envError && (
              <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-2xl text-red-200 flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                <Bell className="text-red-400" />
                <p className="text-sm font-medium">{envError}</p>
              </div>
            )}
            {activeModule === ModuleType.VOICE && <VoiceInteraction handlers={handlers} />}
            {activeModule === ModuleType.STUDY && (
              <StudySupport 
                tasks={tasks} 
                notes={notes} 
                onToggleTask={toggleTask}
                onDeleteTask={deleteTask}
                onDeleteNote={deleteNote}
                onAddTask={handlers.addTask}
                onAddNote={handlers.addNote}
              />
            )}
            {activeModule === ModuleType.COMMUNICATION && (
              <Communication 
                messages={messages} 
                onSendMessage={handlers.sendMessage}
              />
            )}
            {activeModule === ModuleType.NOTIFICATIONS && <NotificationManager notifications={notifications} />}
            {activeModule === ModuleType.MULTIMEDIA && <Multimedia mediaState={mediaState} setMediaState={setMediaState} />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
