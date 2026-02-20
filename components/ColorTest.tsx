
import React, { useState, useEffect, useRef } from 'react';
import { ColorBlindType } from '../types';
import { speak } from '../utils/audio';

interface ColorTestProps {
  onComplete: (type: ColorBlindType) => void;
}

interface Plate {
  id: number;
  number: string;
  type: 'RG' | 'BY' | 'Total';
  fgColors: string[];
  bgColors: string[];
}

const PLATES: Plate[] = [
  { 
    id: 1, number: '12', type: 'Total', 
    fgColors: ['#E74C3C', '#C0392B', '#FF7675'], 
    bgColors: ['#2ECC71', '#27AE60', '#55E6C1'] 
  },
  { 
    id: 2, number: '8', type: 'RG', 
    fgColors: ['#F39C12', '#E67E22', '#F1C40F'], 
    bgColors: ['#16A085', '#1ABC9C', '#27AE60'] 
  },
  { 
    id: 3, number: '29', type: 'RG', 
    fgColors: ['#D980FA', '#FDA7DF', '#ED4C67'], 
    bgColors: ['#12CBC4', '#1289A7', '#0652DD'] 
  },
  { 
    id: 4, number: '5', type: 'RG', 
    fgColors: ['#FFC312', '#F79F1F', '#EE5A24'], 
    bgColors: ['#5758BB', '#9980FA', '#D980FA'] 
  },
  { 
    id: 5, number: '3', type: 'RG', 
    fgColors: ['#ED4C67', '#B53471', '#833471'], 
    bgColors: ['#A3CB38', '#C4E538', '#009432'] 
  },
  { 
    id: 6, number: '15', type: 'BY', 
    fgColors: ['#12CBC4', '#1289A7', '#0652DD'], 
    bgColors: ['#FFC312', '#F79F1F', '#EE5A24'] 
  },
  { 
    id: 7, number: '74', type: 'RG', 
    fgColors: ['#006266', '#009432', '#1B1464'], 
    bgColors: ['#D980FA', '#FDA7DF', '#ED4C67'] 
  },
  { 
    id: 8, number: '6', type: 'BY', 
    fgColors: ['#6F1E51', '#833471', '#B53471'], 
    bgColors: ['#FFC312', '#C4E538', '#A3CB38'] 
  },
  { 
    id: 9, number: '45', type: 'RG', 
    fgColors: ['#EA2027', '#EE5A24', '#F79F1F'], 
    bgColors: ['#009432', '#A3CB38', '#C4E538'] 
  },
  { 
    id: 10, number: '2', type: 'Total', 
    fgColors: ['#1B1464', '#0652DD', '#1289A7'], 
    bgColors: ['#FFC312', '#F79F1F', '#EE5A24'] 
  },
];

export const ColorTest: React.FC<ColorTestProps> = ({ onComplete }) => {
  const [currentPlateIndex, setCurrentPlateIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [errorCount, setErrorCount] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    speak("Diagnostic started. Focus on the dot pattern and enter the number you see. Zero if none.");
    drawCurrentPlate();
  }, []);

  useEffect(() => {
    drawCurrentPlate();
  }, [currentPlateIndex]);

  const drawCurrentPlate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const plate = PLATES[currentPlateIndex];
    const w = canvas.width;
    const h = canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = w / 2 - 5;

    // Create Mask
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    const mctx = maskCanvas.getContext('2d');
    if (!mctx) return;

    mctx.fillStyle = 'white';
    mctx.font = 'bold 180px sans-serif';
    mctx.textAlign = 'center';
    mctx.textBaseline = 'middle';
    mctx.fillText(plate.number, centerX, centerY + 10);
    const maskData = mctx.getImageData(0, 0, w, h).data;

    // Draw background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Generate Dots
    const dotCount = 2400; // Increased density
    for (let i = 0; i < dotCount; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      
      const dx = x - centerX;
      const dy = y - centerY;
      if (Math.sqrt(dx*dx + dy*dy) > radius - 4) continue;

      const idx = (Math.floor(y) * w + Math.floor(x)) * 4;
      const isFG = maskData[idx] > 128; // Check if mask is white there

      const dotRadius = 1.2 + Math.random() * 5.0;
      const colors = isFG ? plate.fgColors : plate.bgColors;
      const color = colors[Math.floor(Math.random() * colors.length)];

      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  };

  const handleNext = () => {
    const isWrong = inputValue !== PLATES[currentPlateIndex].number;
    if (isWrong) setErrorCount(prev => prev + 1);

    const newAnswers = [...answers, inputValue];
    if (currentPlateIndex < PLATES.length - 1) {
      setAnswers(newAnswers);
      setCurrentPlateIndex(prev => prev + 1);
      setInputValue('');
      speak(`Plate ${currentPlateIndex + 2}`);
    } else {
      processResults(newAnswers);
    }
  };

  const processResults = (finalAnswers: string[]) => {
    let rg = 0, by = 0, tot = 0;
    finalAnswers.forEach((ans, idx) => {
      const p = PLATES[idx];
      if (ans !== p.number) {
        if (p.type === 'RG') rg++;
        else if (p.type === 'BY') by++;
        else tot++;
      }
    });

    let res = ColorBlindType.NONE;
    const mistakes = rg + by + tot;

    if (tot > 1) res = mistakes > 7 ? ColorBlindType.ACHROMATOPSIA : ColorBlindType.ACHROMATOMALY;
    else if (rg >= 5) res = ColorBlindType.DEUTERANOPIA;
    else if (rg >= 2) res = ColorBlindType.DEUTERANOMALY;
    else if (by >= 2) res = ColorBlindType.TRITANOPIA;
    else if (by === 1) res = ColorBlindType.TRITANOMALY;

    speak(`Test complete. Result: ${res}. Calibration applied.`);
    onComplete(res);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-black text-white">
      <div className="absolute top-6 left-6 text-zinc-600 font-mono text-[10px] uppercase tracking-[0.2em]">
        Diagnostic Core / Errs: {errorCount}
      </div>
      
      <h1 className="text-3xl font-black mb-12 uppercase tracking-[0.3em] text-white">Vision Test</h1>
      
      <div className="relative w-80 h-80 rounded-full bg-zinc-950 flex items-center justify-center overflow-hidden border-[12px] border-zinc-900 shadow-[0_0_50px_rgba(255,255,255,0.05)] mb-12">
         <canvas 
           ref={canvasRef} 
           width={320} 
           height={320}
           className="w-full h-full block"
         />
      </div>

      <div className="w-full max-w-xs space-y-6">
        <input
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="w-full p-6 text-6xl text-center bg-zinc-900 border-4 border-white rounded-3xl text-white font-black focus:outline-none focus:ring-4 focus:ring-white/20"
          placeholder="?"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleNext()}
        />

        <button
          onClick={handleNext}
          className="w-full py-6 bg-white text-black text-2xl font-black rounded-3xl active:scale-95 transition-transform uppercase tracking-widest"
        >
          {currentPlateIndex === PLATES.length - 1 ? 'Complete' : 'Confirm'}
        </button>
      </div>
      
      <div className="mt-12 flex gap-3">
        {PLATES.map((_, i) => (
          <div 
            key={i} 
            className={`h-1.5 transition-all duration-500 rounded-full ${i === currentPlateIndex ? 'bg-white w-8' : i < currentPlateIndex ? 'bg-zinc-600 w-4' : 'bg-zinc-800 w-4'}`} 
          />
        ))}
      </div>
    </div>
  );
};
