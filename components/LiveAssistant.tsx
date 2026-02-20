
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { ColorBlindType, UserSettings } from '../types';
import { encodeAudio, decodeAudio, decodeAudioData, speak } from '../utils/audio';

interface LiveAssistantProps {
  settings: UserSettings;
  onClose: () => void;
}

const FRAME_RATE = 1; 
const JPEG_QUALITY = 0.5;

type DetectionMode = 'object' | 'text' | 'color';

export const LiveAssistant: React.FC<LiveAssistantProps> = ({ settings, onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('Initializing...');
  const [isProcessingAction, setIsProcessingAction] = useState<DetectionMode | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const cleanup = useCallback(() => {
    setIsActive(false);
    if (sessionRef.current) {
      sessionRef.current = null;
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    if (audioContextRef.current) audioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
  }, []);

  const handleSnapshotAction = async (mode: DetectionMode) => {
    if (isProcessingAction || !canvasRef.current) return;
    
    setIsProcessingAction(mode);
    const modeLabels = {
      object: 'Scanning objects',
      text: 'Reading text',
      color: 'Checking colors'
    };
    
    speak(modeLabels[mode]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const imageData = canvasRef.current.toDataURL('image/jpeg', 0.8).split(',')[1];
      
      const prompts = {
        object: "Identify the main objects in this image and their approximate distance. Be extremely concise. No markdown.",
        text: "Extract and read all text from this image. Do not use any markdown formatting.",
        color: `Identify the dominant colors for a user with ${settings.colorBlindType}. Be concise and avoid markdown.`
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: imageData } },
              { text: prompts[mode] }
            ]
          }
        ]
      });

      const resultText = response.text || "No results found.";
      speak(resultText, settings.voiceSpeed);
    } catch (error) {
      console.error('Snapshot error:', error);
      speak("Error processing scan.");
    } finally {
      setIsProcessingAction(null);
    }
  };

  const startSession = async () => {
    try {
      setStatus('Connecting...');
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: settings.cameraType === 'browser' ? { facingMode: 'environment' } : false 
      });

      if (settings.cameraType === 'browser' && videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const systemInstruction = `
        You are VisionAlly for blind and color-blind users.
        User Condition: ${settings.colorBlindType}.
        Provide concise environment updates. Do not use markdown (no asterisks).
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction,
        },
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setStatus('Active');
            speak("Assistant ready.");
            
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob: Blob = {
                data: encodeAudio(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);

            const interval = setInterval(() => {
              if (!canvasRef.current || (!videoRef.current && settings.cameraType === 'browser')) return;
              const ctx = canvasRef.current.getContext('2d');
              if (!ctx) return;

              if (settings.cameraType === 'browser') {
                canvasRef.current.width = videoRef.current!.videoWidth;
                canvasRef.current.height = videoRef.current!.videoHeight;
                ctx.drawImage(videoRef.current!, 0, 0);
              } else {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.src = `${settings.esp32Url}?cache=${Date.now()}`;
                img.onload = () => {
                   canvasRef.current!.width = img.width;
                   canvasRef.current!.height = img.height;
                   ctx.drawImage(img, 0, 0);
                };
              }

              canvasRef.current.toBlob(async (blob) => {
                if (blob) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    sessionPromise.then(s => s.sendRealtimeInput({
                      media: { data: base64, mimeType: 'image/jpeg' }
                    }));
                  };
                  reader.readAsDataURL(blob);
                }
              }, 'image/jpeg', JPEG_QUALITY);
            }, 1000 / FRAME_RATE);

            (sessionRef as any).currentInterval = interval;
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioBase64 = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioBase64 && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decodeAudio(audioBase64), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => sourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Session error:', e);
            setStatus('Error');
          },
          onclose: () => {
            cleanup();
            setStatus('Off');
          }
        }
      });
      sessionRef.current = await sessionPromise;

    } catch (err) {
      console.error(err);
      setStatus('Failed');
      speak("Camera error.");
    }
  };

  useEffect(() => {
    startSession();
    return () => {
      cleanup();
      if ((sessionRef as any).currentInterval) clearInterval((sessionRef as any).currentInterval);
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col items-center">
      {settings.cameraType === 'browser' && (
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="absolute inset-0 w-full h-full object-cover opacity-60 grayscale"
        />
      )}
      <canvas ref={canvasRef} className="hidden" />
      
      <div className="z-20 w-full p-3 flex justify-between items-center bg-black/80 backdrop-blur-sm border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-white animate-pulse' : 'bg-zinc-600'}`} />
          <span className="font-bold text-xs uppercase tracking-tighter text-white">{status}</span>
        </div>
        <button onClick={onClose} className="px-3 py-1 bg-white text-black rounded text-[10px] font-black uppercase">Exit</button>
      </div>

      {isProcessingAction && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/10 pointer-events-none">
          <div className="text-white font-black text-2xl uppercase tracking-widest animate-pulse">Scanning</div>
        </div>
      )}

      {/* Manual Action Buttons - White theme, no emojis */}
      <div className="mt-auto z-20 w-full grid grid-cols-3 gap-1 p-1 bg-zinc-900 border-t border-zinc-800">
        <button 
          onClick={() => handleSnapshotAction('object')}
          disabled={!!isProcessingAction}
          className={`flex items-center justify-center py-5 rounded transition-all active:scale-95 ${isProcessingAction === 'object' ? 'bg-zinc-800 text-zinc-500' : 'bg-white text-black hover:bg-zinc-200'}`}
        >
          <span className="text-xs font-black uppercase">Objects</span>
        </button>

        <button 
          onClick={() => handleSnapshotAction('text')}
          disabled={!!isProcessingAction}
          className={`flex items-center justify-center py-5 rounded transition-all active:scale-95 ${isProcessingAction === 'text' ? 'bg-zinc-800 text-zinc-500' : 'bg-white text-black hover:bg-zinc-200'}`}
        >
          <span className="text-xs font-black uppercase">Text</span>
        </button>

        <button 
          onClick={() => handleSnapshotAction('color')}
          disabled={!!isProcessingAction}
          className={`flex items-center justify-center py-5 rounded transition-all active:scale-95 ${isProcessingAction === 'color' ? 'bg-zinc-800 text-zinc-500' : 'bg-white text-black hover:bg-zinc-200'}`}
        >
          <span className="text-xs font-black uppercase">Color</span>
        </button>
      </div>
    </div>
  );
};
