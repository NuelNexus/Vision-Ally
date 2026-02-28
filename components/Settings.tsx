
import React, { useEffect, useState } from 'react';
import { ColorBlindType, UserSettings } from '../types';

interface SettingsProps {
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onChange }) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const getDevices = async () => {
    try {
      // Request permission first to get labels
      await navigator.mediaDevices.getUserMedia({ video: true });
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
      setDevices(videoDevices);
    } catch (err) {
      console.error("Error listing cameras:", err);
    }
  };

  useEffect(() => {
    getDevices();
  }, []);

  return (
    <div className="p-6 bg-zinc-900 text-white h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-4">
        <h2 className="text-3xl font-bold">Configuration</h2>
        <button 
          onClick={getDevices}
          className="text-[10px] font-black uppercase bg-zinc-800 px-3 py-1 rounded hover:bg-zinc-700 transition-colors"
        >
          Refresh Cameras
        </button>
      </div>
      
      <section className="mb-8">
        <label className="block text-zinc-400 text-sm font-bold mb-2 uppercase tracking-wide">
          Camera Source
        </label>
        <div className="grid grid-cols-2 gap-4 mb-4">
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

        {settings.cameraType === 'browser' && devices.length > 0 && (
          <div className="mt-4">
            <label className="block text-zinc-500 text-[10px] font-black uppercase mb-1">Select Camera Device</label>
            <select
              value={settings.selectedDeviceId || ''}
              onChange={(e) => onChange({ ...settings, selectedDeviceId: e.target.value })}
              className="w-full p-4 bg-black border-2 border-zinc-700 rounded-xl text-white outline-none focus:border-white"
            >
              <option value="">Default Camera</option>
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                </option>
              ))}
            </select>
          </div>
        )}
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
