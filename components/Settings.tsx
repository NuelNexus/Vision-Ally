
import React from 'react';
import { ColorBlindType, UserSettings } from '../types';

interface SettingsProps {
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onChange }) => {
  return (
    <div className="p-6 bg-zinc-900 text-white h-full overflow-y-auto">
      <h2 className="text-3xl font-bold mb-8 border-b border-zinc-800 pb-4">Configuration</h2>
      
      <section className="mb-8">
        <label className="block text-zinc-400 text-sm font-bold mb-2 uppercase tracking-wide">
          Camera Source
        </label>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onChange({ ...settings, cameraType: 'browser' })}
            className={`p-4 rounded-xl border-2 transition-all ${settings.cameraType === 'browser' ? 'border-white bg-white/10' : 'border-zinc-700'}`}
          >
            Browser Camera
          </button>
          <button
            onClick={() => onChange({ ...settings, cameraType: 'esp32' })}
            className={`p-4 rounded-xl border-2 transition-all ${settings.cameraType === 'esp32' ? 'border-white bg-white/10' : 'border-zinc-700'}`}
          >
            ESP32-CAM
          </button>
        </div>
      </section>

      {settings.cameraType === 'esp32' && (
        <section className="mb-8">
          <label className="block text-zinc-400 text-sm font-bold mb-2 uppercase tracking-wide">
            ESP32 Stream URL
          </label>
          <input
            type="text"
            value={settings.esp32Url}
            onChange={(e) => onChange({ ...settings, esp32Url: e.target.value })}
            className="w-full p-4 bg-black border-2 border-zinc-700 rounded-xl text-white focus:border-white outline-none"
            placeholder="http://192.168.1.XX/mjpeg"
          />
        </section>
      )}

      <section className="mb-8">
        <label className="block text-zinc-400 text-sm font-bold mb-2 uppercase tracking-wide">
          Color Vision Profile
        </label>
        <select
          value={settings.colorBlindType}
          onChange={(e) => onChange({ ...settings, colorBlindType: e.target.value as ColorBlindType })}
          className="w-full p-4 bg-black border-2 border-zinc-700 rounded-xl text-white outline-none"
        >
          {Object.values(ColorBlindType).map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </section>

      <section>
        <label className="block text-zinc-400 text-sm font-bold mb-2 uppercase tracking-wide">
          Voice Speed
        </label>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={settings.voiceSpeed}
          onChange={(e) => onChange({ ...settings, voiceSpeed: parseFloat(e.target.value) })}
          className="w-full accent-white"
        />
        <div className="flex justify-between text-xs text-zinc-500 mt-2">
          <span>Slower</span>
          <span>Faster</span>
        </div>
      </section>
    </div>
  );
};
