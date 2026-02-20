
import React, { useState, useEffect } from 'react';
import { ColorBlindType, UserSettings } from './types';
import { ColorTest } from './components/ColorTest';
import { LiveAssistant } from './components/LiveAssistant';
import { Settings } from './components/Settings';
import { speak } from './utils/audio';

const App: React.FC = () => {
  const [view, setView] = useState<'home' | 'test' | 'assist' | 'settings'>('home');
  const [settings, setSettings] = useState<UserSettings>({
    colorBlindType: ColorBlindType.NONE,
    voiceSpeed: 1.0,
    cameraType: 'browser',
    esp32Url: 'http://192.168.1.100:81/stream'
  });

  useEffect(() => {
    speak("Welcome to Vision Ally. Use the large buttons to navigate. Double tap to confirm.");
  }, []);

  const handleTestComplete = (type: ColorBlindType) => {
    setSettings(prev => ({ ...prev, colorBlindType: type }));
    setView('home');
  };

  const NavButton = ({ title, desc, onClick, color = "bg-zinc-800", textColor = "text-white" }: any) => (
    <button
      onClick={onClick}
      className={`${color} w-full p-8 rounded-3xl flex flex-col items-start gap-2 shadow-xl border-4 border-transparent active:border-white transition-all`}
    >
      <span className={`text-3xl font-black ${textColor} uppercase`}>{title}</span>
      <span className={`text-lg ${textColor === 'text-black' ? 'text-black/60' : 'text-white/60'} text-left`}>{desc}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black text-white select-none">
      {view === 'home' && (
        <div className="h-full flex flex-col p-6 overflow-y-auto gap-4">
          <header className="py-8">
            <h1 className="text-5xl font-black text-white italic tracking-tighter">VISION ALLY</h1>
            <p className="text-zinc-400 mt-2">AI Mobility & Perception System</p>
          </header>

          <NavButton 
            title="Start Assistant" 
            desc="Real-time environment and object reading"
            color="bg-white"
            textColor="text-black"
            onClick={() => {
              speak("Assistant active.");
              setView('assist');
            }}
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NavButton 
              title="Vision Test" 
              desc="Calibrate for color blindness"
              onClick={() => {
                speak("Beginning vision test.");
                setView('test');
              }}
            />
            <NavButton 
              title="Settings" 
              desc="Hardware & Voice options"
              onClick={() => {
                speak("Settings menu open.");
                setView('settings');
              }}
            />
          </div>

          <div className="mt-auto p-4 border-t border-zinc-800 text-center">
             <span className="text-xs text-zinc-600 font-mono">CORE v2.5.0-FLASH</span>
          </div>
        </div>
      )}

      {view === 'test' && (
        <ColorTest onComplete={handleTestComplete} />
      )}

      {view === 'assist' && (
        <LiveAssistant settings={settings} onClose={() => setView('home')} />
      )}

      {view === 'settings' && (
        <div className="h-full relative">
          <Settings settings={settings} onChange={setSettings} />
          <button 
            onClick={() => setView('home')}
            className="absolute top-4 right-4 p-4 bg-white text-black rounded-full font-bold uppercase text-xs"
          >
            CLOSE
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
