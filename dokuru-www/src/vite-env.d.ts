/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "gifenc" {
  type GifPaletteColor = [number, number, number] | [number, number, number, number];
  type GifPalette = GifPaletteColor[];

  interface GifEncoderFrameOptions {
    palette?: GifPalette;
    transparent?: boolean;
    transparentIndex?: number;
    delay?: number;
    repeat?: number;
    dispose?: number;
  }

  interface GifEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: GifEncoderFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
  }

  export function GIFEncoder(opts?: { initialCapacity?: number; auto?: boolean }): GifEncoder;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: "rgb565" | "rgb444" | "rgba4444"; oneBitAlpha?: boolean | number }
  ): GifPalette;
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
    format?: "rgb565" | "rgb444" | "rgba4444"
  ): Uint8Array<ArrayBuffer>;
}
