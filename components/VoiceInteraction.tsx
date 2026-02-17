
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, AlertCircle, Sparkles, Activity, Terminal, ExternalLink, Clock, Power, Key, Cpu, Radio, Zap } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob, Type, FunctionDeclaration } from '@google/genai';

interface VoiceInteractionProps {
  handlers: {
    addNote: (title: string, content: string) => string;
    addTask: (text: string) => string;
    sendMessage: (recipient: string, text: string) => string;
    getNotifications: () => string;
    controlMedia: (action: string) => string;
    getTime: () => string;
    openUrl: (target: string) => string;
  };
}

const VoiceInteraction: React.FC<VoiceInteractionProps> = ({ handlers }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState<{ type: 'user' | 'v1'; text: string }[]>([]);
  const [status, setStatus] = useState<string>('Neural Link Standby');
  const [error, setError] = useState<string | null>(null);
  const [inputLevel, setInputLevel] = useState(0);
  const [needsKey, setNeedsKey] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  // Initial check for API Key availability via platform handshake
  useEffect(() => {
    const checkKey = async () => {
      if (typeof (window as any).aistudio !== 'undefined') {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey && (!process.env.API_KEY || process.env.API_KEY === '')) {
          setNeedsKey(true);
        }
      } else if (!process.env.API_KEY || process.env.API_KEY === '') {
        // Fallback for generic environment
        setNeedsKey(true);
      }
    };
    checkKey();
  }, []);

  const handleLinkKey = async () => {
    if (typeof (window as any).aistudio !== 'undefined') {
      await (window as any).aistudio.openSelectKey();
      // Assume selection was successful as per instructions (avoid race condition)
      setNeedsKey(false);
      setError(null);
    }
  };

  // Base64 Helpers
  function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  const tools: FunctionDeclaration[] = [
    {
      name: 'add_note',
      parameters: {
        type: Type.OBJECT,
        properties: { 
          title: { type: Type.STRING, description: 'Title of the note' }, 
          content: { type: Type.STRING, description: 'Content of the note' } 
        },
        required: ['title', 'content']
      }
    },
    {
      name: 'add_task',
      parameters: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING, description: 'Task description' } },
        required: ['text']
      }
    },
    {
      name: 'get_current_time',
      parameters: { type: Type.OBJECT, properties: {} },
      description: 'Check the current system time.'
    },
    {
      name: 'open_website',
      parameters: {
        type: Type.OBJECT,
        properties: { target: { type: Type.STRING, description: 'Website URL or name' } },
        required: ['target']
      }
    },
    {
      name: 'control_multimedia',
      parameters: {
        type: Type.OBJECT,
        properties: { 
          action: { type: Type.STRING, description: 'Media command: "play", "pause", "next", "capture"' } 
        },
        required: ['action']
      }
    },
    {
      name: 'stop_assistant',
      parameters: { type: Type.OBJECT, properties: {} },
      description: 'Ends the current V1 session.'
    }
  ];

  const stopSession = () => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(s => s.close()).catch(() => {});
      sessionPromiseRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    [inputAudioContextRef, audioContextRef].forEach(ref => {
      if (ref.current) {
        ref.current.close().catch(() => {});
        ref.current = null;
      }
    });
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
    sourcesRef.current.clear();
    
    setIsListening(false);
    setStatus('Neural Link Standby');
    setInputLevel(0);
    nextStartTimeRef.current = 0;
  };

  const startSession = async () => {
    try {
      setError(null);
      
      const apiKey = process.env.API_KEY;
      if (!apiKey || apiKey === '') {
        setNeedsKey(true);
        return;
      }

      setStatus('Synchronizing Neural Frequencies...');
      
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();
      
      inputAudioContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Instantiate only after verification
      const ai = new GoogleGenAI({ apiKey });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('V1 Synchronized');
            setIsListening(true);
            
            const micSource = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += Math.abs(inputData[i]);
              setInputLevel(sum / inputData.length);

              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              
              const pcmBlob: Blob = { 
                data: encode(new Uint8Array(int16.buffer)), 
                mimeType: 'audio/pcm;rate=16000' 
              };
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob })).catch(() => {});
            };
            
            micSource.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => sourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            // Transcriptions
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const uText = currentInputTranscription.current.trim();
              const aText = currentOutputTranscription.current.trim();
              if (uText || aText) {
                setTranscription(prev => [
                  ...prev, 
                  ...(uText ? [{ type: 'user' as const, text: uText }] : []),
                  ...(aText ? [{ type: 'v1' as const, text: aText }] : [])
                ].slice(-10));
              }
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
            }

            // Function Calling Logic
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                let response: any = "Success";
                try {
                  if (fc.name === 'get_current_time') response = handlers.getTime();
                  else if (fc.name === 'open_website') response = handlers.openUrl(fc.args.target as string);
                  else if (fc.name === 'add_note') response = handlers.addNote(fc.args.title as string, fc.args.content as string);
                  else if (fc.name === 'add_task') response = handlers.addTask(fc.args.text as string);
                  else if (fc.name === 'control_multimedia') response = handlers.controlMedia(fc.args.action as string);
                  else if (fc.name === 'stop_assistant') {
                    response = "V1 signing off. Neural link terminated.";
                    setTimeout(stopSession, 1500);
                  }
                } catch (e) { response = "Handled Exception: " + (e as Error).message; }

                sessionPromise.then(s => s.sendToolResponse({
                  functionResponses: [{ id: fc.id, name: fc.name, response: { result: response } }]
                }));
              }
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            const msg = e instanceof Error ? e.message : 'Encryption Failure';
            if (msg.includes('Requested entity was not found') || msg.includes('API Key')) {
              setNeedsKey(true);
            }
            setError('Neural Link Compromised: ' + msg);
            stopSession();
          },
          onclose: () => {
             setIsListening(false);
             setStatus('Neural Link Standby');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          tools: [{ functionDeclarations: tools }],
          systemInstruction: "You are V1, a high-fidelity AI personal assistant. Greet the user with 'V1 Interface initialized. How may I assist your productivity?'. Handle time, browsing, media control (play, pause, next track, capture photo), and organization. Be ultra-efficient and stay in character as a neural assistant.",
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) {
      setError('Bootstrap Error: ' + (err.message || 'HW Access Denied'));
      setStatus('Neural Link Standby');
    }
  };

  useEffect(() => {
    return () => stopSession();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-5xl mx-auto px-6 gap-12">
      {/* V1 HUD Display */}
      <div className="text-center space-y-6 animate-in fade-in zoom-in duration-1000">
        <div className="flex justify-center relative">
          <div className={`absolute -inset-20 rounded-full bg-blue-500/10 blur-[120px] transition-all duration-1000 ${isListening ? 'opacity-100 scale-125' : 'opacity-0'}`} />
          <div className={`relative p-12 bg-slate-950/80 backdrop-blur-3xl border border-white/5 rounded-[4rem] shadow-2xl transition-all duration-700 ${isListening ? 'scale-110 shadow-blue-500/30 ring-1 ring-blue-500/20' : 'grayscale border-slate-800'}`}>
            <Zap size={64} className={`${isListening ? 'text-blue-400 animate-pulse' : 'text-slate-700'}`} />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-8xl font-black italic tracking-tighter bg-gradient-to-br from-white via-blue-100 to-indigo-600 bg-clip-text text-transparent uppercase">V1 CORE</h1>
          <div className="flex items-center justify-center gap-6 text-slate-600">
             <div className="h-[1px] w-24 bg-gradient-to-r from-transparent to-slate-800" />
             <p className="font-black text-[10px] tracking-[0.8em] uppercase flex items-center gap-3">
               <Radio size={12} className={isListening ? 'animate-pulse text-blue-500' : ''} />
               Secure Neural Link
             </p>
             <div className="h-[1px] w-24 bg-gradient-to-l from-transparent to-slate-800" />
          </div>
        </div>
      </div>

      {/* Connection Interface */}
      <div className="relative flex flex-col items-center gap-12 w-full">
        {needsKey ? (
          <div className="flex flex-col items-center gap-8 animate-in slide-in-from-bottom-12 duration-700 w-full max-w-md">
            <div className="p-12 glass-panel rounded-[4rem] border-blue-500/20 text-center space-y-8 bg-slate-950/60 shadow-inner">
              <div className="w-24 h-24 bg-blue-600/5 rounded-[2.5rem] flex items-center justify-center mx-auto border border-blue-500/20 shadow-2xl animate-float">
                <Key size={48} className="text-blue-400" />
              </div>
              <div className="space-y-2 px-4">
                <h3 className="text-2xl font-black uppercase tracking-tight text-white">Neural Handshake Required</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">
                  Authentication is required to initialize high-latency neural streams. Link your platform key to continue.
                </p>
              </div>
              <button 
                onClick={handleLinkKey}
                className="w-full py-6 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-[0.25em] text-[10px] rounded-3xl shadow-[0_25px_50px_rgba(37,99,235,0.4)] transition-all active:scale-95 flex items-center justify-center gap-4 group"
              >
                Authenticate Neural Key
                <Zap size={16} className="group-hover:animate-ping" />
              </button>
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="block text-[9px] text-slate-700 hover:text-blue-500 transition-colors uppercase font-black tracking-widest border-t border-white/5 pt-8">
                Official Billing Documentation
              </a>
            </div>
          </div>
        ) : (
          <button 
            onClick={isListening ? stopSession : startSession}
            className={`relative w-[28rem] h-[28rem] rounded-full flex flex-col items-center justify-center transition-all duration-1000 group ${isListening ? 'bg-blue-600/5 border-2 border-blue-400 shadow-[0_0_180px_rgba(59,130,246,0.25)]' : 'bg-slate-950 border-2 border-slate-900 hover:border-blue-500/40 shadow-2xl'}`}
          >
            {isListening ? (
              <div className="flex gap-4 h-40 items-center">
                {[...Array(32)].map((_, i) => (
                  <div 
                    key={i} 
                    className="w-1.5 bg-blue-500 rounded-full animate-bounce" 
                    style={{ 
                      height: `${10 + Math.random() * 90}%`, 
                      animationDelay: `${i * 0.03}s`,
                      opacity: 0.1 + (inputLevel * 30)
                    }} 
                  />
                ))}
              </div>
            ) : (
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 blur-[80px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                <Mic size={130} className="text-slate-800 group-hover:text-blue-500 transition-all duration-1000 transform group-hover:scale-110" />
              </div>
            )}
            <div className="absolute bottom-24 flex flex-col items-center gap-5">
              <span className={`text-[14px] font-black uppercase tracking-[1em] transition-all duration-1000 ${isListening ? 'text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]' : 'text-slate-800'}`}>
                {isListening ? 'STREAM LIVE' : 'INITIATE SYNC'}
              </span>
            </div>
          </button>
        )}
      </div>

      {/* Systems Panel */}
      <div className="w-full space-y-12">
        <div className="flex justify-between items-center px-10">
          <div className="flex items-center gap-6 px-10 py-5 rounded-full bg-slate-950 border border-white/5 text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] backdrop-blur-3xl shadow-inner">
             <div className={`w-3.5 h-3.5 rounded-full ${isListening ? 'bg-emerald-400 animate-ping shadow-[0_0_15px_#10b981]' : 'bg-slate-900'}`} />
             {status}
          </div>
          <button 
            onClick={() => setTranscription([])} 
            className="px-8 py-3 rounded-full border border-slate-900 text-[9px] font-black text-slate-700 uppercase tracking-widest hover:text-white hover:border-white/10 transition-all active:scale-95"
          >
            Purge Transmissions
          </button>
        </div>

        <div className="glass-panel rounded-[5rem] p-20 min-h-[350px] max-h-[550px] overflow-y-auto custom-scrollbar border-white/5 flex flex-col gap-12 shadow-2xl relative bg-slate-950/30">
          {transcription.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-900 gap-12 opacity-10 select-none grayscale">
              <Terminal size={100} strokeWidth={1} />
              <div className="text-center space-y-4">
                <p className="text-[20px] font-black italic tracking-[0.6em] uppercase">V1 DATASTREAM INERT</p>
                <p className="text-[12px] font-bold tracking-[0.4em] uppercase">Ready for transmission handshake...</p>
              </div>
            </div>
          ) : transcription.map((t, i) => (
            <div key={i} className={`flex ${t.type === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-10 duration-700`}>
              <div className={`group relative px-14 py-8 rounded-[4rem] text-xl font-medium max-w-[85%] leading-relaxed transition-all ${t.type === 'user' ? 'bg-slate-900 text-slate-200 border border-white/5' : 'bg-blue-600/5 text-blue-50 border border-blue-500/20 shadow-[0_0_80px_rgba(59,130,246,0.08)]'}`}>
                {t.text}
                <div className={`absolute -bottom-12 flex items-center gap-5 opacity-0 group-hover:opacity-100 transition-all duration-700 ${t.type === 'user' ? 'right-12' : 'left-12'}`}>
                   <span className="text-[11px] font-black uppercase tracking-[0.5em] text-slate-800">
                     {t.type === 'user' ? 'UPLINK CONFIRMED' : 'V1 SYNTHESIS'}
                   </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-10 p-12 bg-red-950/20 border border-red-500/10 rounded-[5rem] animate-in slide-in-from-top-12 duration-700 shadow-2xl">
            <div className="p-6 bg-red-500/10 rounded-3xl shadow-inner"><AlertCircle className="text-red-500" size={48} /></div>
            <div className="flex-1 space-y-4">
              <p className="text-red-400 text-[10px] font-black uppercase tracking-[0.6em]">Critical Protocol Override</p>
              <p className="text-red-200/40 text-lg font-medium leading-relaxed">{error}</p>
            </div>
            {error.toLowerCase().includes('key') && (
              <button onClick={handleLinkKey} className="px-12 py-5 bg-red-600/20 hover:bg-red-600/40 text-red-50 text-[11px] font-black uppercase tracking-widest rounded-full border border-red-500/30 transition-all shadow-xl shadow-red-500/10">Repair Link</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceInteraction;
