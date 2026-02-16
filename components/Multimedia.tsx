
import React from 'react';
import { Play, SkipBack, SkipForward, Maximize2, Camera, FolderOpen, Heart, Share2 } from 'lucide-react';

const Multimedia: React.FC = () => {
  const photos = [
    { id: 1, url: 'https://picsum.photos/seed/tech1/400/300' },
    { id: 2, url: 'https://picsum.photos/seed/nature1/400/300' },
    { id: 3, url: 'https://picsum.photos/seed/city1/400/300' },
    { id: 4, url: 'https://picsum.photos/seed/art1/400/300' },
  ];

  return (
    <div className="space-y-8">
      {/* Now Playing Bar */}
      <div className="glass-panel rounded-3xl p-6 bg-gradient-to-r from-slate-900 to-blue-900/30 border-blue-500/20 flex flex-col md:flex-row items-center gap-6">
        <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-2xl">
          <img src="https://picsum.photos/seed/album1/200" alt="Album Art" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 text-center md:text-left">
          <div className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-1">Now Playing</div>
          <h2 className="text-2xl font-bold">Infinite Horizon</h2>
          <p className="text-slate-400">Atmospheric Dreams - Synthwave Mix</p>
          <div className="mt-4 flex items-center gap-4 justify-center md:justify-start">
             <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden hidden sm:block">
                <div className="w-1/3 h-full bg-blue-500" />
             </div>
             <span className="text-[10px] text-slate-500 font-bold">1:24 / 4:12</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-3 text-slate-400 hover:text-white transition-colors"><SkipBack size={24} /></button>
          <button className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/30 active:scale-90">
            <Play size={32} fill="white" />
          </button>
          <button className="p-3 text-slate-400 hover:text-white transition-colors"><SkipForward size={24} /></button>
        </div>
      </div>

      {/* Gallery Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold flex items-center gap-3">
            <Camera className="text-blue-500" /> Recent Media
          </h3>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-colors">
              <FolderOpen size={18} />
              <span>Albums</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {photos.map(photo => (
            <div key={photo.id} className="group relative rounded-3xl overflow-hidden aspect-[4/3] glass-panel cursor-pointer">
              <img src={photo.url} alt="Media" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-between p-4">
                <div className="flex justify-end">
                   <button className="p-2 bg-white/10 rounded-xl hover:bg-white/20"><Heart size={18} /></button>
                </div>
                <div className="flex justify-center gap-4">
                  <button className="p-3 bg-blue-600 rounded-full"><Maximize2 size={20} /></button>
                  <button className="p-3 bg-white/20 rounded-full"><Share2 size={20} /></button>
                </div>
              </div>
            </div>
          ))}
          <div className="rounded-3xl border-2 border-dashed border-slate-800 flex flex-col items-center justify-center gap-3 text-slate-600 hover:border-slate-700 hover:text-slate-500 transition-all group cursor-pointer">
            <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Camera size={24} />
            </div>
            <span className="font-bold text-sm">Capture New</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Multimedia;
