/**
 * pdfjs-dist (přes pdf-parse v2) na Node očekává browser API (DOMMatrix, Path2D, ImageData).
 * Na Vercelu chybí — pdfjs zkouší @napi-rs/canvas; bez něj padá "DOMMatrix is not defined" už při importu modulu.
 */
import "server-only";

let installed = false;

export async function installPdfJsNodePolyfills(): Promise<void> {
  if (installed) return;
  installed = true;

  const g = globalThis as unknown as Record<string, unknown>;
  if (
    typeof g.DOMMatrix !== "undefined" &&
    typeof g.Path2D !== "undefined" &&
    typeof g.ImageData !== "undefined"
  ) {
    return;
  }

  try {
    const canvas = await import("@napi-rs/canvas");
    if (typeof g.DOMMatrix === "undefined" && canvas.DOMMatrix) {
      g.DOMMatrix = canvas.DOMMatrix as unknown;
    }
    if (typeof g.Path2D === "undefined" && canvas.Path2D) {
      g.Path2D = canvas.Path2D as unknown;
    }
    if (typeof g.ImageData === "undefined" && canvas.ImageData) {
      g.ImageData = canvas.ImageData as unknown;
    }
  } catch (e) {
    console.warn("[pdfjs-node-polyfills] @napi-rs/canvas failed to load", e);
  }

  installMinimalStubsIfStillMissing(g);
}

function installMinimalStubsIfStillMissing(g: Record<string, unknown>): void {
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class DOMMatrixStub {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      constructor(_init?: string | number[]) {}
      multiplySelf() {
        return this;
      }
      invertSelf() {
        return this;
      }
    } as unknown;
  }
  if (typeof g.Path2D === "undefined") {
    g.Path2D = class Path2DStub {
      constructor(_path?: string) {}
    } as unknown;
  }
  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageDataStub {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(swOrData: number | Uint8ClampedArray, sh?: number) {
        if (typeof swOrData === "number" && typeof sh === "number") {
          this.width = swOrData;
          this.height = sh;
          this.data = new Uint8ClampedArray(swOrData * sh * 4);
        } else {
          this.data = swOrData as Uint8ClampedArray;
          this.width = 0;
          this.height = 0;
        }
      }
    } as unknown;
  }
}
