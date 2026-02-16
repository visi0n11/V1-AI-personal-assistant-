
import React from 'react';
import { Plus, Clock, StickyNote, Sparkles, CheckCircle2, ChevronRight } from 'lucide-react';
import { Task, Note } from '../types';

interface StudySupportProps {
  tasks: Task[];
  notes: Note[];
}

const StudySupport: React.FC<StudySupportProps> = ({ tasks, notes }) => {
  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
        <div className="glass-panel rounded-3xl p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 text-blue-500/10 group-hover:text-blue-500/20 transition-colors">
            <Sparkles size={120} />
          </div>
          <div className="relative z-10 space-y-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="text-amber-400" /> Daily Motivation
            </h2>
            <p className="text-lg text-slate-300 italic leading-relaxed">
              "The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice."
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Clock className="text-blue-400" /> Study Checklist
            </h3>
            <button className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700"><Plus size={20} /></button>
          </div>
          <div className="grid gap-3">
            {tasks.map(task => (
              <div key={task.id} className="glass-panel p-4 rounded-2xl flex items-center justify-between hover:border-slate-600 cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${task.completed ? 'bg-blue-600 border-blue-600' : 'border-slate-700'}`}>
                    {task.completed && <CheckCircle2 size={14} className="text-white" />}
                  </div>
                  <span className={task.completed ? 'line-through text-slate-500' : ''}>{task.text}</span>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity"><ChevronRight size={18} className="text-slate-500" /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <StickyNote className="text-blue-400" /> Personal Notes
          </h3>
          <button className="text-sm font-medium text-blue-400">View All</button>
        </div>
        <div className="flex flex-col gap-4">
          {notes.map(note => (
            <div key={note.id} className="bg-slate-900 border border-slate-800 p-5 rounded-3xl hover:border-blue-500/50">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold">{note.title}</h4>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{note.date}</span>
              </div>
              <p className="text-sm text-slate-400 line-clamp-3">{note.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StudySupport;
