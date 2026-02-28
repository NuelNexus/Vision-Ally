
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { ColorBlindType, UserSettings } from '../types';
import { encodeAudio, decodeAudio, decodeAudioData, speak } from '../utils/audio';

interface LiveAssistantProps {
  settings: UserSettings;
  onClose: () => void;
}

const FRAME_RATE = 2; 
const JPEG_QUALITY = 0.7;

type DetectionMode = 'object' | 'text' | 'color';

export const LiveAssistant: React.FC<LiveAssistantProps> = ({ settings, onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('Initializing...');
  const [isProcessingAction, setIsProcessingAction] = useState<DetectionMode | null>(null);
  const [isAutonomous, setIsAutonomous] = useState(false);
  
  const isActiveRef = useRef(false);
  const isAutonomousRef = useRef(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const autonomousTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autonomousScanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(async () => {
    setIsActive(false);
    isActiveRef.current = false;
    setIsAutonomous(false);
    isAutonomousRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (autonomousScanIntervalRef.current) {
      clearInterval(autonomousScanIntervalRef.current);
      autonomousScanIntervalRef.current = null;
    }
    if (autonomousTimeoutRef.current) {
      clearTimeout(autonomousTimeoutRef.current);
      autonomousTimeoutRef.current = null;
    }
    if (sessionRef.current) {
      try {
        await sessionRef.current.close();
      } catch (e) {
        console.warn('Error closing session:', e);
      }
      sessionRef.current = null;
    }
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { await audioContextRef.current.close(); } catch (e) {}
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      try { await outputAudioContextRef.current.close(); } catch (e) {}
    }
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
        object: "Identify the main objects in this image and their approximate distance. Be extremely concise. Do NOT use bounding boxes or coordinates. No markdown.",
        text: "Extract and read all text from this image. Do not use any markdown formatting.",
        color: `Identify the dominant colors in this scene. For a user with ${settings.colorBlindType}, explain what these colors are in plain English (e.g., 'The shirt is forest green'). Be precise and avoid markdown.`
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

  const handleAutonomousScan = async () => {
    if (!isActiveRef.current || !canvasRef.current || isProcessingAction) return;
    
    // Don't interrupt if the live model is currently speaking
    if (sourcesRef.current.size > 0) return;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const imageData = canvasRef.current.toDataURL('image/jpeg', 0.8).split(',')[1];
      
      const prompt = "Perform a comprehensive autonomous scan. 1. Identify main objects and distances. 2. Read any visible text. 3. Identify dominant colors for a user with " + settings.colorBlindType + ". Be extremely concise, natural, and do NOT use technical labels or bounding boxes. No markdown.";

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: imageData } },
              { text: prompt }
            ]
          }
        ]
      });

      if (isActiveRef.current && isAutonomousRef.current) {
        const resultText = response.text || "";
        if (resultText) {
          speak(resultText, settings.voiceSpeed);
        }
      }
    } catch (error) {
      console.error('Autonomous scan error:', error);
    }
  };

  useEffect(() => {
    isAutonomousRef.current = isAutonomous;
    if (isAutonomous) {
      speak("Autonomous detection enabled.");
      autonomousScanIntervalRef.current = setInterval(handleAutonomousScan, 15000);
    } else {
      if (autonomousScanIntervalRef.current) {
        clearInterval(autonomousScanIntervalRef.current);
        autonomousScanIntervalRef.current = null;
        speak("Autonomous detection disabled.");
      }
    }
    return () => {
      if (autonomousScanIntervalRef.current) {
        clearInterval(autonomousScanIntervalRef.current);
      }
    };
  }, [isAutonomous]);

  const startSession = async () => {
    try {
      setStatus('Connecting...');
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: settings.cameraType === 'browser' ? { 
          deviceId: settings.selectedDeviceId ? { exact: settings.selectedDeviceId } : undefined,
          facingMode: settings.selectedDeviceId ? undefined : 'environment' 
        } : false 
      });

      if (settings.cameraType === 'browser' && videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const systemInstruction = `
        You are VisionAlly, a proactive AI assistant for blind and color-blind users.
        User Condition: ${settings.colorBlindType}.
        
        Your goal is to provide real-time, autonomous audio descriptions of the environment.
        - **Frequency**: Every 15 seconds, provide a brief update on the environment. If the main objects haven't changed, look for new details, textures, or secondary objects to describe.
        - Be proactive: Describe changes in the scene, obstacles, or interesting objects.
        - **Avoid Repetition**: Do not repeat the exact same descriptions.
        - **No Technical Data**: Do NOT include bounding boxes, coordinates, or labels like "box_2d". Describe objects naturally.
        - Be concise: Use short, clear sentences.
        - Color Accuracy: Pay close attention to colors. Describe them clearly (e.g., "bright red", "navy blue").
        - No Markdown: Do not use asterisks or any markdown formatting.
        - Tone: Professional, helpful, and calm.
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
            isActiveRef.current = true;
            setStatus('Active');
            speak("Assistant ready.");

            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              if (!isActiveRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              const audioPart = {
                data: encodeAudio(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then(s => {
                if (s && isActiveRef.current) {
                  s.sendRealtimeInput({ media: audioPart });
                }
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);

            const interval = setInterval(() => {
              if (!isActiveRef.current) return;
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
                   if (canvasRef.current && isActiveRef.current) {
                     canvasRef.current.width = img.width;
                     canvasRef.current.height = img.height;
                     const innerCtx = canvasRef.current.getContext('2d');
                     innerCtx?.drawImage(img, 0, 0);
                   }
                };
              }

              canvasRef.current.toBlob(async (blob) => {
                if (blob && isActiveRef.current) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    sessionPromise.then(s => {
                      if (s && isActiveRef.current) {
                        s.sendRealtimeInput({
                          media: { data: base64, mimeType: 'image/jpeg' }
                        });
                      }
                    });
                  };
                  reader.readAsDataURL(blob);
                }
              }, 'image/jpeg', JPEG_QUALITY);
            }, 1000 / FRAME_RATE);

            intervalRef.current = interval;

            // Autonomous periodic updates with overlap prevention
            const runAutonomousUpdate = async () => {
              if (!isActiveRef.current) return;
              
              try {
                const session = await sessionPromise;
                if (session && sourcesRef.current.size === 0) {
                  // We can't send text via sendRealtimeInput, so we rely on the system instruction
                  // and the continuous video stream. If the model is silent, we can try to 
                  // "poke" it by sending a redundant video frame or just wait for its proactivity.
                  
                  // Schedule next check in 15 seconds
                  autonomousTimeoutRef.current = setTimeout(runAutonomousUpdate, 15000);
                } else {
                  // If busy or no session, check again in 3 seconds
                  autonomousTimeoutRef.current = setTimeout(runAutonomousUpdate, 3000);
                }
              } catch (err) {
                console.error("Autonomous update error:", err);
                autonomousTimeoutRef.current = setTimeout(runAutonomousUpdate, 5000);
              }
            };

            // Initial delay before first autonomous update
            autonomousTimeoutRef.current = setTimeout(runAutonomousUpdate, 10000);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (!isActiveRef.current) return;
            const audioBase64 = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioBase64 && outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
              try {
                const ctx = outputAudioContextRef.current;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                const buffer = await decodeAudioData(decodeAudio(audioBase64), ctx, 24000, 1);
                if (ctx.state === 'closed') return;
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                source.onended = () => sourcesRef.current.delete(source);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
                sourcesRef.current.add(source);
              } catch (e) {
                console.warn('Error playing audio chunk:', e);
              }
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => {
                try { s.stop(); } catch (e) {}
              });
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
          className="absolute inset-0 w-full h-full object-cover opacity-60"
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

      {/* Autonomous Toggle Button */}
      <div className="z-20 w-full px-1 pb-1 bg-zinc-900">
        <button 
          onClick={() => setIsAutonomous(!isAutonomous)}
          className={`w-full py-4 rounded transition-all font-black uppercase text-xs border-2 ${isAutonomous ? 'bg-white text-black border-white' : 'bg-zinc-800 text-white border-zinc-700'}`}
        >
          {isAutonomous ? 'Autonomous Detection: ON' : 'Autonomous Detection: OFF'}
        </button>
      </div>

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
