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
  const [status, setStatus] = useState<string>('System Ready');
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

  useEffect(() => {
    const checkKey = async () => {
      if (typeof (window as any).aistudio !== 'undefined') {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey && !process.env.API_KEY) {
          setNeedsKey(true);
        }
      }
    };
    checkKey();
  }, []);

  const handleLinkKey = async () => {
    if (typeof (window as any).aistudio !== 'undefined') {
      try {
        await (window as any).aistudio.openSelectKey();
        // Assume success after triggering the dialog to avoid race condition
        setNeedsKey(false);
        setError(null);
      } catch (e) {
        console.error("Failed to open key selector", e);
      }
    }
  };

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
          title: { type: Type.STRING }, 
          content: { type: Type.STRING } 
        },
        required: ['title', 'content']
      }
    },
    {
      name: 'add_task',
      parameters: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING } },
        required: ['text']
      }
    },
    {
      name: 'get_current_time',
      parameters: { type: Type.OBJECT, properties: {} }
    },
    {
      name: 'open_website',
      parameters: {
        type: Type.OBJECT,
        properties: { target: { type: Type.STRING } },
        required: ['target']
      }
    },
    {
      name: 'control_multimedia',
      parameters: {
        type: Type.OBJECT,
        properties: { 
          action: { type: Type.STRING, description: 'play, pause, next, capture' } 
        },
        required: ['action']
      }
    },
    {
      name: 'stop_assistant',
      parameters: { type: Type.OBJECT, properties: {} }
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
    setStatus('System Ready');
    setInputLevel(0);
    nextStartTimeRef.current = 0;
  };

  const startSession = async () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      setNeedsKey(true);
      return;
    }

    try {
      setError(null);
      setStatus('Initializing...');
      
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
      const inCtx = new AudioCtx({ sampleRate: 16000 });
      const outCtx = new AudioCtx({ sampleRate: 24000 });
      
      await inCtx.resume();
      await outCtx.resume();
      
      inputAudioContextRef.current = inCtx;
      audioContextRef.current = outCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('V1 Online');
            setIsListening(true);
            const source = inCtx.createMediaStreamSource(stream);
            const processor = inCtx.createScriptProcessor(4096, 1, 1);
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
            source.connect(processor);
            processor.connect(inCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const src = ctx.createBufferSource();
              src.buffer = buffer;
              src.connect(ctx.destination);
              src.onended = () => sourcesRef.current.delete(src);
              src.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(src);
            }

            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const uText = currentInputTranscription.current.trim();
              const aText = currentOutputTranscription.current.trim();
              if (uText || aText) {
                setTranscription(prev => [...prev, 
                  ...(uText ? [{ type: 'user' as const, text: uText }] : []),
                  ...(aText ? [{ type: 'v1' as const, text: aText }] : [])
                ].slice(-10));
              }
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
            }

            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                let res: any = "Success";
                if (fc.name === 'get_current_time') res = handlers.getTime();
                else if (fc.name === 'open_website') res = handlers.openUrl(fc.args.target as string);
                else if (fc.name === 'add_note') res = handlers.addNote(fc.args.title as string, fc.args.content as string);
                else if (fc.name === 'add_task') res = handlers.addTask(fc.args.text as string);
                else if (fc.name === 'control_multimedia') res = handlers.controlMedia(fc.args.action as string);
                else if (fc.name === 'stop_assistant') {
                  res = "Shutting down...";
                  setTimeout(stopSession, 1000);
                }
                sessionPromise.then(s => s.sendToolResponse({
                  functionResponses: [{ id: fc.id, name: fc.name, response: { result: res } }]
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
            const msg = (e as any).message || 'Connection error';
            if (msg.includes('entity was not found') || msg.includes('API key')) setNeedsKey(true);
            setError(msg);
            stopSession();
          },
          onclose: () => {
             setIsListening(false);
             setStatus('System Ready');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          tools: [{ functionDeclarations: tools }],
          systemInstruction: "You are V1, a high-fidelity AI assistant. Help with time, browsing, media control, and organization. Be concise.",
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) {
      setError(err.message || 'Initialization error');
      setStatus('System Ready');
    }
  };

  useEffect(() => {
    return () => stopSession();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-5xl mx-auto px-6 gap-12">
      <div className="text-center space-y-6">
        <div className="flex justify-center relative">
          <div className={`absolute -inset-20 rounded-full bg-blue-500/10 blur-[120px] transition-all duration-1000 ${isListening ? 'opacity-100 scale-125' : 'opacity-0'}`} />
          <div className={`relative p-12 bg-slate-950/80 backdrop-blur-3xl border border-white/5 rounded-[4rem] shadow-2xl transition-all duration-700 ${isListening ? 'scale-110 shadow-blue-500/30 ring-1 ring-blue-500/20' : 'grayscale border-slate-800'}`}>
            <Zap size={64} className={`${isListening ? 'text-blue-400 animate-pulse' : 'text-slate-700'}`} />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-8xl font-black italic tracking-tighter bg-gradient-to-br from-white via-blue-100 to-indigo-600 bg-clip-text text-transparent uppercase">V1 CORE</h1>
          <p className="font-black text-[10px] tracking-[0.8em] uppercase flex items-center justify-center gap-3 text-slate-600">
            <Radio size={12} className={isListening ? 'animate-pulse text-blue-500' : ''} />
            Secure Neural Link
          </p>
        </div>
      </div>

      <div className="relative flex flex-col items-center gap-12 w-full">
        {needsKey ? (
          <div className="p-12 glass-panel rounded-[4rem] border-blue-500/20 text-center space-y-8 bg-slate-950/60 shadow-inner max-w-md w-full animate-in zoom-in duration-300">
            <Key size={48} className="mx-auto text-blue-400" />
            <h3 className="text-2xl font-black uppercase text-white">API Key Required</h3>
            <p className="text-slate-500 text-sm">Authentication is required to initialize high-latency neural streams.</p>
            <button onClick={handleLinkKey} className="w-full py-6 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-[0.25em] text-[10px] rounded-3xl transition-all">
              Authenticate Key
            </button>
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="block text-[9px] text-slate-700 hover:text-blue-500 uppercase font-black tracking-widest pt-4">
              Billing Documentation
            </a>
          </div>
        ) : (
          <button 
            onClick={isListening ? stopSession : startSession}
            className={`relative w-[24rem] h-[24rem] rounded-full flex flex-col items-center justify-center transition-all duration-1000 group ${isListening ? 'bg-blue-600/5 border-2 border-blue-400 shadow-[0_0_150px_rgba(59,130,246,0.25)]' : 'bg-slate-950 border-2 border-slate-900 hover:border-blue-500/40 shadow-2xl'}`}
          >
            {isListening ? (
              <div className="flex gap-3 h-32 items-center">
                {[...Array(24)].map((_, i) => (
                  <div key={i} className="w-1.5 bg-blue-500 rounded-full animate-bounce" style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 0.05}s`, opacity: 0.2 + (inputLevel * 20) }} />
                ))}
              </div>
            ) : (
              <Mic size={100} className="text-slate-800 group-hover:text-blue-500 transition-all duration-1000 transform group-hover:scale-110" />
            )}
            <span className={`absolute bottom-20 text-[12px] font-black uppercase tracking-[0.8em] transition-all duration-1000 ${isListening ? 'text-blue-400' : 'text-slate-800'}`}>
              {isListening ? 'STREAM LIVE' : 'INITIATE SYNC'}
            </span>
          </button>
        )}
      </div>

      <div className="w-full space-y-8">
        <div className="flex justify-between items-center px-10">
          <div className="flex items-center gap-6 px-10 py-4 rounded-full bg-slate-950 border border-white/5 text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">
             <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-emerald-400 animate-ping' : 'bg-slate-900'}`} />
             {status}
          </div>
          <button onClick={() => setTranscription([])} className="text-[9px] font-black text-slate-700 uppercase hover:text-white transition-all">Flush Logs</button>
        </div>

        <div className="glass-panel rounded-[4rem] p-16 min-h-[300px] max-h-[450px] overflow-y-auto custom-scrollbar border-white/5 flex flex-col gap-10 shadow-2xl bg-slate-950/30">
          {transcription.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-900 gap-8 opacity-10">
              <Terminal size={80} strokeWidth={1} />
              <p className="text-[14px] font-black uppercase tracking-[0.4em]">V1 Datastream Inert</p>
            </div>
          ) : transcription.map((t, i) => (
            <div key={i} className={`flex ${t.type === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-6 duration-500`}>
              <div className={`px-12 py-6 rounded-[3rem] text-lg font-medium max-w-[85%] ${t.type === 'user' ? 'bg-slate-900 text-slate-200 border border-white/5' : 'bg-blue-600/5 text-blue-50 border border-blue-500/20'}`}>
                {t.text}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-8 p-10 bg-red-950/20 border border-red-500/10 rounded-[4rem] animate-in slide-in-from-top-10 duration-700">
            <AlertCircle className="text-red-500 flex-shrink-0" size={40} />
            <div className="flex-1">
              <p className="text-red-400 text-[10px] font-black uppercase">Critical Exception</p>
              <p className="text-red-200/40 text-sm">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceInteraction;