export type DeviceTag =
  | 'mobile'
  | 'mobile-landscape'
  | 'tablet'
  | 'tablet-landscape'
  | 'desktop'
  | 'ultrawide';

export interface Viewport {
  name: string;
  width: number;
  height: number;
  device: DeviceTag;
}

export const VIEWPORTS: readonly Viewport[] = [
  { name: 'galaxy-fold',       width: 344,  height: 882,  device: 'mobile' },
  { name: 'iphone-se',         width: 375,  height: 667,  device: 'mobile' },
  { name: 'iphone-15-pro',     width: 393,  height: 852,  device: 'mobile' },
  { name: 'pixel-7',           width: 412,  height: 915,  device: 'mobile' },
  { name: 'iphone-14-pro-max', width: 430,  height: 932,  device: 'mobile' },
  { name: 'iphone-landscape',  width: 852,  height: 393,  device: 'mobile-landscape' },
  { name: 'ipad-portrait',     width: 768,  height: 1024, device: 'tablet' },
  { name: 'ipad-landscape',    width: 1024, height: 768,  device: 'tablet-landscape' },
  { name: 'desktop-1280',      width: 1280, height: 800,  device: 'desktop' },
  { name: 'fhd',               width: 1920, height: 1080, device: 'desktop' },
  { name: '2k-dci',            width: 2048, height: 1080, device: 'desktop' },
  { name: 'qhd-1440p',         width: 2560, height: 1440, device: 'desktop' },
  { name: 'ultrawide',         width: 2560, height: 1080, device: 'ultrawide' },
] as const;

/** The Delve's PC sizes (Delve UI v1, Phase 4A): the Delve specs run over these, the classic ones over VIEWPORTS. */
export const PC_VIEWPORTS: readonly Viewport[] = [
  { name: 'hd-720',    width: 1280, height: 720,  device: 'desktop' },
  { name: 'deck',      width: 1280, height: 800,  device: 'desktop' },
  { name: 'fhd',       width: 1920, height: 1080, device: 'desktop' },
  { name: 'qhd-1440p', width: 2560, height: 1440, device: 'desktop' },
  { name: 'sxga',      width: 1280, height: 1024, device: 'desktop' },
  { name: 'ultrawide', width: 3440, height: 1440, device: 'ultrawide' },
] as const;
