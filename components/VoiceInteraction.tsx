
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, MessageCircle, AlertCircle, Sparkles, Zap, Activity } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob, Type, FunctionDeclaration } from '@google/genai';

interface VoiceInteractionProps {
  handlers: {
    addNote: (title: string, content: string) => string;
    addTask: (text: string) => string;
    sendMessage: (recipient: string, text: string) => string;
    getNotifications: () => string;
    controlMedia: (action: string) => string;
  };
}

const VoiceInteraction: React.FC<VoiceInteractionProps> = ({ handlers }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('System Ready');
  const [error, setError] = useState<string | null>(null);
  const [inputLevel, setInputLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  // Manual encode implementation as per guidelines
  function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Manual decode implementation as per guidelines
  function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // Audio decoding logic for raw PCM streams as per guidelines
  async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
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
        properties: { title: { type: Type.STRING }, content: { type: Type.STRING } },
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
      name: 'send_message',
      parameters: {
        type: Type.OBJECT,
        properties: { recipient: { type: Type.STRING }, text: { type: Type.STRING } },
        required: ['recipient', 'text']
      }
    },
    {
      name: 'control_multimedia',
      parameters: {
        type: Type.OBJECT,
        properties: { 
          action: { type: Type.STRING, description: 'Action to perform: play, pause, next, capture' } 
        },
        required: ['action']
      }
    },
    { name: 'get_notifications', parameters: { type: Type.OBJECT, properties: {} } }
  ];

  const stopSession = () => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => session.close()).catch(() => {});
      sessionPromiseRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close().catch(() => {});
      inputAudioContextRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    setIsListening(false);
    setStatus('System Ready');
    setInputLevel(0);
    nextStartTimeRef.current = 0;
  };

  const startSession = async () => {
    try {
      setError(null);
      setStatus('Synchronizing...');
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();
      
      inputAudioContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('V1 Online');
            setIsListening(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
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
              
              // CRITICAL: initiate sendRealtimeInput only after session resolves to avoid race conditions
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob })).catch(() => {});
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Process transcription for both user and AI
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const uText = currentInputTranscription.current.trim();
              const aText = currentOutputTranscription.current.trim();
              if (uText || aText) {
                setTranscription(prev => [...prev, uText ? `User: ${uText}` : '', aText ? `AI: ${aText}` : ''].filter(Boolean));
              }
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
            }

            // Process model's audio output bytes
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.onended = () => sourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Handle session interruption (e.g., user speaking over the model)
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => {
                try { s.stop(); } catch (e) {}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }

            // Handle model-requested function calls
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                let result: any = "ok";
                try {
                  if (fc.name === 'add_note') result = handlers.addNote(fc.args.title as string, fc.args.content as string);
                  if (fc.name === 'add_task') result = handlers.addTask(fc.args.text as string);
                  if (fc.name === 'send_message') result = handlers.sendMessage(fc.args.recipient as string, fc.args.text as string);
                  if (fc.name === 'control_multimedia') result = handlers.controlMedia(fc.args.action as string);
                  if (fc.name === 'get_notifications') result = handlers.getNotifications();
                } catch (e) {
                  result = { error: (e as Error).message };
                }
                
                sessionPromise.then(s => s.sendToolResponse({
                  functionResponses: {
                    id: fc.id,
                    name: fc.name,
                    response: { result }
                  }
                }));
              }
            }
          },
          onerror: (e) => {
            console.error('Gemini Live API Error:', e);
            setError('System error. Please verify configuration.');
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
          systemInstruction: "You are V1, a high-performance personal assistant. You help with study tasks, notifications, and multimedia. Use tools when needed. Be concise and professional.",
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err) {
      setError((err as Error).message);
      setStatus('System Ready');
    }
  };

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  return (
    <div className="h-full flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-[3rem] p-8 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        
        {/* Connection Status Display */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`} />
            <span className="text-sm font-bold tracking-widest text-slate-400 uppercase">{status}</span>
          </div>
          <div className="flex gap-1">
            {[...Array(5)].map((_, i) => (
              <div 
                key={i} 
                className="w-1 bg-blue-500 rounded-full transition-all duration-75" 
                style={{ height: isListening ? `${Math.max(4, inputLevel * 300 * (Math.random() + 0.5))}px` : '4px' }}
              />
            ))}
          </div>
        </div>

        {/* Primary Interaction Button */}
        <div className="flex flex-col items-center gap-8 py-12">
          <button 
            onClick={isListening ? stopSession : startSession}
            className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl ${isListening ? 'bg-red-500 shadow-red-500/40 scale-110' : 'bg-blue-600 shadow-blue-600/40 hover:scale-105'}`}
          >
            {isListening ? (
              <div className="relative">
                <MicOff size={48} className="text-white" />
                <div className="absolute inset-0 bg-white/20 rounded-full animate-ping -z-10" />
              </div>
            ) : (
              <Mic size={48} className="text-white" />
            )}
          </button>
          
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-black tracking-tight uppercase">{isListening ? 'Assistant Active' : 'Activate Voice'}</h3>
            <p className="text-slate-500 font-medium max-w-xs mx-auto">"Read my notifications" or "Play some music"</p>
          </div>
        </div>

        {/* Dynamic Error Messaging */}
        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-sm font-bold">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Live Conversation Logs */}
        <div className="mt-8 border-t border-slate-800 pt-8 max-h-48 overflow-y-auto custom-scrollbar space-y-4">
          {transcription.map((text, i) => (
            <div key={i} className={`flex items-start gap-3 text-sm font-medium ${text.startsWith('User') ? 'text-slate-400' : 'text-blue-400'}`}>
              {text.startsWith('User') ? <Activity size={16} className="mt-0.5" /> : <Sparkles size={16} className="mt-0.5" />}
              <span>{text.split(': ')[1]}</span>
            </div>
          ))}
          {transcription.length === 0 && (
            <div className="text-center text-slate-600 text-xs font-bold uppercase tracking-widest py-4">
              Real-time Logs
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceInteraction;
