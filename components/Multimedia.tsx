
import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Maximize2, Camera, FolderOpen, Heart, Share2 } from 'lucide-react';

interface MultimediaProps {
  mediaState: {
    isPlaying: boolean;
    currentTrack: string;
    artist: string;
    flashActive: boolean;
  };
  setMediaState: React.Dispatch<React.SetStateAction<any>>;
}

const Multimedia: React.FC<MultimediaProps> = ({ mediaState, setMediaState }) => {
  const photos = [
    { id: 1, url: 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=400&h=300&auto=format&fit=crop' },
    { id: 2, url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=400&h=300&auto=format&fit=crop' },
    { id: 3, url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=400&h=300&auto=format&fit=crop' },
    { id: 4, url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=400&h=300&auto=format&fit=crop' },
  ];

  const togglePlayback = () => setMediaState((s: any) => ({ ...s, isPlaying: !s.isPlaying }));

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Dynamic Player */}
      <div className="glass-panel rounded-[2rem] p-8 bg-gradient-to-br from-slate-900 to-blue-900/20 border-blue-500/10 flex flex-col md:flex-row items-center gap-8 shadow-2xl">
        <div className={`w-32 h-32 rounded-3xl overflow-hidden shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-transform duration-500 ${mediaState.isPlaying ? 'scale-105 animate-float' : 'scale-95'}`}>
          <img src="https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&h=200&auto=format&fit=crop" alt="Album Art" className="w-full h-full object-cover" />
        </div>
        
        <div className="flex-1 text-center md:text-left space-y-2">
          <div className="flex items-center justify-center md:justify-start gap-2">
            <span className="text-blue-500 text-[10px] font-black uppercase tracking-[0.3em]">Now Playing</span>
            {mediaState.isPlaying && <div className="flex gap-0.5"><div className="w-1 h-3 bg-blue-500 animate-pulse"></div><div className="w-1 h-3 bg-blue-500 animate-pulse delay-75"></div></div>}
          </div>
          <h2 className="text-3xl font-black tracking-tight">{mediaState.currentTrack}</h2>
          <p className="text-slate-400 font-medium">{mediaState.artist}</p>
          
          <div className="pt-4 flex items-center gap-4">
             <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full bg-blue-500 transition-all duration-1000 ${mediaState.isPlaying ? 'w-1/3' : 'w-[5%]'}`} />
             </div>
             <span className="text-[10px] text-slate-500 font-black tabular-nums">{mediaState.isPlaying ? '01:24' : '00:00'} / 04:12</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button className="text-slate-500 hover:text-white transition-colors"><SkipBack size={28} /></button>
          <button 
            onClick={togglePlayback}
            className="w-20 h-20 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/40 active:scale-90"
          >
            {mediaState.isPlaying ? <Pause size={36} fill="white" /> : <Play size={36} fill="white" className="ml-1" />}
          </button>
          <button className="text-slate-500 hover:text-white transition-colors"><SkipForward size={28} /></button>
        </div>
      </div>

      {/* Gallery */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">
            <Camera className="text-blue-500" /> V1 ARCHIVES
          </h3>
          <button className="flex items-center gap-2 px-6 py-2 bg-slate-900 border border-slate-800 rounded-2xl hover:bg-slate-800 transition-all font-bold text-sm">
            <FolderOpen size={18} />
            <span>Open Vault</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {photos.map(photo => (
            <div key={photo.id} className="group relative rounded-[2rem] overflow-hidden aspect-[4/3] glass-panel cursor-pointer shadow-lg hover:shadow-blue-500/10 transition-all border-slate-800 hover:border-blue-500/50">
              <img src={photo.url} alt="Media" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-6">
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <button className="p-2.5 bg-blue-600 rounded-xl"><Maximize2 size={18} /></button>
                    <button className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md hover:bg-white/20"><Heart size={18} /></button>
                  </div>
                  <button className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md hover:bg-white/20"><Share2 size={18} /></button>
                </div>
              </div>
            </div>
          ))}
          <div className="rounded-[2rem] border-4 border-dashed border-slate-800 flex flex-col items-center justify-center gap-4 text-slate-600 hover:border-blue-500/30 hover:text-blue-400 transition-all group cursor-pointer h-full min-h-[150px]">
            <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform shadow-xl">
              <Camera size={32} />
            </div>
            <span className="font-black text-[10px] uppercase tracking-widest">New Capture</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Multimedia;
