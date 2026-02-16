
import React from 'react';
import { Phone, Send, PhoneCall } from 'lucide-react';
import { Message } from '../types';

interface CommunicationProps {
  messages: Message[];
}

const Communication: React.FC<CommunicationProps> = ({ messages }) => {
  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-slate-900 p-1 rounded-2xl border border-slate-800">
          <button className="px-6 py-2 rounded-xl bg-blue-600 text-white">Messages</button>
          <button className="px-6 py-2 rounded-xl text-slate-400">Calls</button>
        </div>
      </div>

      <div className="flex-1 grid md:grid-cols-3 gap-6 overflow-hidden">
        <div className="glass-panel rounded-3xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-800"><h3 className="font-bold text-slate-400 text-xs tracking-widest uppercase">Contacts</h3></div>
          <div className="p-4 flex items-center gap-3 hover:bg-slate-800 cursor-pointer rounded-2xl m-2">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold">AT</div>
            <div className="text-sm font-bold">Alice Thompson</div>
          </div>
        </div>

        <div className="md:col-span-2 glass-panel rounded-3xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 font-bold">Alice Thompson</div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.incoming ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[75%] p-3 px-4 rounded-2xl text-sm ${msg.incoming ? 'bg-slate-800' : 'bg-blue-600'}`}>
                  {msg.text}
                  <div className="text-[10px] mt-1 opacity-50">{msg.timestamp}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-slate-800 flex gap-2">
            <input type="text" placeholder="Type a message..." className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2" />
            <button className="p-2 bg-blue-600 rounded-xl"><Send size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Communication;
