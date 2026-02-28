
export enum ColorBlindType {
  NONE = 'None',
  PROTANOPIA = 'Protanopia (Red-Blind)',
  PROTANOMALY = 'Protanomaly (Red-Weak)',
  DEUTERANOPIA = 'Deuteranopia (Green-Blind)',
  DEUTERANOMALY = 'Deuteranomaly (Green-Weak)',
  TRITANOPIA = 'Tritanopia (Blue-Blind)',
  TRITANOMALY = 'Tritanomaly (Blue-Weak)',
  ACHROMATOPSIA = 'Achromatopsia (Total Color Blind)',
  ACHROMATOMALY = 'Achromatomaly (Partial Total)',
}

export interface UserSettings {
  colorBlindType: ColorBlindType;
  voiceSpeed: number;
  cameraType: 'browser' | 'esp32';
  esp32Url: string;
  selectedDeviceId?: string;
}

export interface DetectionResult {
  objects: string[];
  colors: string[];
  distance: string;
  text: string;
}
