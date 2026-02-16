
import React, { useState } from 'react';
import { Phone, MessageSquare, Search, User, MoreVertical, Send, PhoneCall } from 'lucide-react';
import { Contact, Message } from '../types';

const Communication: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'calls' | 'messages'>('messages');
  
  const [contacts] = useState<Contact[]>([
    { id: '1', name: 'Alice Thompson', phone: '+1 234 567 890', avatar: 'https://picsum.photos/seed/alice/100' },
    { id: '2', name: 'Bob Wilson', phone: '+1 987 654 321', avatar: 'https://picsum.photos/seed/bob/100' },
    { id: '3', name: 'Charlie Davis', phone: '+1 555 000 111', avatar: 'https://picsum.photos/seed/charlie/100' },
  ]);

  const [messages] = useState<Message[]>([
    { id: '1', contactId: '1', text: "Hey! Can we meet at 5?", timestamp: '2:15 PM', incoming: true },
    { id: '2', contactId: '1', text: "Sure thing, see you then.", timestamp: '2:16 PM', incoming: false },
  ]);

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-slate-900 p-1 rounded-2xl border border-slate-800">
          <button 
            onClick={() => setActiveTab('messages')}
            className={`px-6 py-2 rounded-xl transition-all ${activeTab === 'messages' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Messages
          </button>
          <button 
            onClick={() => setActiveTab('calls')}
            className={`px-6 py-2 rounded-xl transition-all ${activeTab === 'calls' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Calls
          </button>
        </div>
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input 
            type="text" 
            placeholder="Search contacts..." 
            className="bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 w-64 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 grid md:grid-cols-3 gap-6 overflow-hidden">
        {/* Contact List */}
        <div className="glass-panel rounded-3xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-800">
            <h3 className="font-bold text-slate-400 uppercase text-xs tracking-widest">Recent Contacts</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {contacts.map(contact => (
              <button 
                key={contact.id} 
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-800 transition-all group"
              >
                <img src={contact.avatar} alt={contact.name} className="w-12 h-12 rounded-full border border-slate-700" />
                <div className="text-left flex-1 min-w-0">
                  <div className="font-bold truncate group-hover:text-blue-400 transition-colors">{contact.name}</div>
                  <div className="text-xs text-slate-500 truncate">{contact.phone}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Area / Recent Calls */}
        <div className="md:col-span-2 glass-panel rounded-3xl flex flex-col overflow-hidden">
          {activeTab === 'messages' ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold">A</div>
                  <div>
                    <div className="font-bold text-sm">Alice Thompson</div>
                    <div className="text-[10px] text-emerald-400 font-medium">Active now</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400">
                    <Phone size={20} />
                  </button>
                  <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400">
                    <MoreVertical size={20} />
                  </button>
                </div>
              </div>
              {/* Messages List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.incoming ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[70%] p-3 px-4 rounded-2xl text-sm ${msg.incoming ? 'bg-slate-800 text-slate-200' : 'bg-blue-600 text-white'}`}>
                      {msg.text}
                      <div className={`text-[10px] mt-1 opacity-60 ${msg.incoming ? 'text-slate-400' : 'text-blue-200'}`}>
                        {msg.timestamp}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Message Input */}
              <div className="p-4 bg-slate-900/50 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    placeholder="Type a message or use voice..." 
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500 text-sm"
                  />
                  <button className="p-2.5 bg-blue-600 rounded-xl hover:bg-blue-500 shadow-lg shadow-blue-600/20">
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
              <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                <PhoneCall size={40} className="text-slate-700" />
              </div>
              <p>No recent calls</p>
              <button className="px-6 py-2 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-500">
                New Call
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Communication;
