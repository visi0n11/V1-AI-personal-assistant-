
import React, { useState } from 'react';
import { Book, Plus, Clock, StickyNote, Sparkles, CheckCircle2, ChevronRight } from 'lucide-react';
import { Task, Note } from '../types';

const StudySupport: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', text: 'Complete Calculus Assignment', completed: false, category: 'study' },
    { id: '2', text: 'Review Bio-Chemistry notes', completed: true, category: 'study' },
  ]);

  const [notes, setNotes] = useState<Note[]>([
    { id: '1', title: 'Neural Networks Basics', content: 'Layers, activation functions, backpropagation...', date: 'Oct 24, 2023' },
    { id: '2', title: 'World War II Timeline', content: 'Key events from 1939 to 1945...', date: 'Oct 23, 2023' },
  ]);

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      {/* Left Column: Schedule & Motivation */}
      <div className="lg:col-span-2 space-y-8">
        <div className="glass-panel rounded-3xl p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 text-blue-500/10 group-hover:text-blue-500/20 transition-colors">
            <Sparkles size={120} />
          </div>
          <div className="relative z-10 space-y-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="text-amber-400" /> 
              Daily Motivation
            </h2>
            <p className="text-lg text-slate-300 italic leading-relaxed">
              "The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice."
            </p>
            <div className="flex gap-4 pt-4">
              <div className="px-4 py-2 bg-blue-600/20 border border-blue-500/30 rounded-full text-sm font-medium">Focused Study: 4.5h today</div>
              <div className="px-4 py-2 bg-emerald-600/20 border border-emerald-500/30 rounded-full text-sm font-medium">Daily Goal Reached!</div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Clock className="text-blue-400" /> Upcoming Tasks
            </h3>
            <button className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors">
              <Plus size={20} />
            </button>
          </div>
          <div className="grid gap-3">
            {tasks.map(task => (
              <div key={task.id} className="glass-panel p-4 rounded-2xl flex items-center justify-between hover:border-slate-600 transition-colors cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${task.completed ? 'bg-blue-600 border-blue-600' : 'border-slate-700'}`}>
                    {task.completed && <CheckCircle2 size={14} className="text-white" />}
                  </div>
                  <span className={task.completed ? 'line-through text-slate-500' : ''}>{task.text}</span>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight size={18} className="text-slate-500" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Notes Management */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <StickyNote className="text-blue-400" /> Notes
          </h3>
          <button className="text-sm font-medium text-blue-400 hover:text-blue-300">View All</button>
        </div>
        <div className="flex flex-col gap-4">
          {notes.map(note => (
            <div key={note.id} className="bg-slate-900 border border-slate-800 p-5 rounded-3xl hover:border-blue-500/50 transition-all cursor-pointer">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold">{note.title}</h4>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{note.date}</span>
              </div>
              <p className="text-sm text-slate-400 line-clamp-2">{note.content}</p>
            </div>
          ))}
          <button className="w-full border-2 border-dashed border-slate-800 hover:border-slate-600 p-6 rounded-3xl flex flex-col items-center justify-center gap-2 text-slate-500 transition-colors group">
            <Plus size={32} className="group-hover:scale-110 transition-transform" />
            <span className="font-medium">Create New Note</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudySupport;
