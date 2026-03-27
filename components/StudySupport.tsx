
import React, { useState } from 'react';
import { Plus, Clock, StickyNote, Sparkles, CheckCircle2, ChevronRight, Trash2, X } from 'lucide-react';
import { Task, Note } from '../types';

interface StudySupportProps {
  tasks: Task[];
  notes: Note[];
  onToggleTask: (id: string, completed: boolean) => void;
  onDeleteTask: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onAddTask: (text: string, category: 'study' | 'personal' | 'work') => void;
  onAddNote: (title: string, content: string) => void;
}

const StudySupport: React.FC<StudySupportProps> = ({ 
  tasks, 
  notes, 
  onToggleTask, 
  onDeleteTask, 
  onDeleteNote,
  onAddTask,
  onAddNote
}) => {
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState<'study' | 'personal' | 'work'>('study');
  
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskText.trim()) {
      onAddTask(newTaskText, newTaskCategory);
      setNewTaskText('');
      setShowTaskForm(false);
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (newNoteTitle.trim() && newNoteContent.trim()) {
      onAddNote(newNoteTitle, newNoteContent);
      setNewNoteTitle('');
      setNewNoteContent('');
      setShowNoteForm(false);
    }
  };

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
            <button 
              onClick={() => setShowTaskForm(!showTaskForm)}
              className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
            >
              {showTaskForm ? <X size={20} /> : <Plus size={20} />}
            </button>
          </div>

          {showTaskForm && (
            <form onSubmit={handleAddTask} className="glass-panel p-4 rounded-2xl flex flex-col gap-4 animate-in slide-in-from-top-2 duration-200">
              <div className="flex gap-3">
                <input 
                  type="text" 
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  placeholder="What needs to be done?"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button type="submit" className="px-4 py-2 bg-blue-600 rounded-xl font-bold hover:bg-blue-500 transition-colors">Add</button>
              </div>
              <div className="flex gap-2">
                {(['study', 'personal', 'work'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setNewTaskCategory(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                      newTaskCategory === cat 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </form>
          )}

          <div className="grid gap-3">
            {tasks.length === 0 ? (
              <div className="text-center py-10 text-slate-500 italic">No tasks yet. Add one above!</div>
            ) : tasks.map(task => (
              <div key={task.id} className="glass-panel p-4 rounded-2xl flex items-center justify-between hover:border-slate-600 group">
                <div 
                  className="flex items-center gap-3 cursor-pointer flex-1"
                  onClick={() => onToggleTask(task.id, task.completed)}
                >
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${task.completed ? 'bg-blue-600 border-blue-600' : 'border-slate-700'}`}>
                    {task.completed && <CheckCircle2 size={14} className="text-white" />}
                  </div>
                  <div className="flex flex-col">
                    <span className={task.completed ? 'line-through text-slate-500' : ''}>{task.text}</span>
                    <span className="text-[10px] uppercase tracking-wider text-blue-400 font-black">{task.category}</span>
                  </div>
                </div>
                <button 
                  onClick={() => onDeleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-red-400 transition-all"
                >
                  <Trash2 size={18} />
                </button>
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
          <button 
            onClick={() => setShowNoteForm(!showNoteForm)}
            className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            {showNoteForm ? 'Cancel' : 'Add Note'}
          </button>
        </div>

        {showNoteForm && (
          <form onSubmit={handleAddNote} className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 animate-in slide-in-from-top-2 duration-200">
            <input 
              type="text" 
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
              placeholder="Note Title"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 focus:outline-none focus:border-blue-500"
              required
            />
            <textarea 
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              placeholder="Note Content"
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 focus:outline-none focus:border-blue-500 resize-none"
              required
            />
            <button type="submit" className="w-full py-2 bg-blue-600 rounded-xl font-bold hover:bg-blue-500 transition-colors">Save Note</button>
          </form>
        )}

        <div className="flex flex-col gap-4">
          {notes.length === 0 ? (
            <div className="text-center py-10 text-slate-500 italic">No notes yet.</div>
          ) : notes.map(note => (
            <div key={note.id} className="bg-slate-900 border border-slate-800 p-5 rounded-3xl hover:border-blue-500/50 group relative">
              <div className="flex justify-between items-start mb-2 pr-8">
                <h4 className="font-bold">{note.title}</h4>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{note.date}</span>
              </div>
              <p className="text-sm text-slate-400 line-clamp-3">{note.content}</p>
              <button 
                onClick={() => onDeleteNote(note.id)}
                className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-400 transition-all"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StudySupport;
