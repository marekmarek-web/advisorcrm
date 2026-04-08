import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageAssetInput } from "../image-asset-input";
import {
  inferMimeTypeForIntakeAsset,
  normalizeHeicHeifIntakeAssetIfNeeded,
  normalizeIntakeImageAssetsForVision,
  parseDataUrl,
} from "../normalize-intake-image-input";

const sharpMock = vi.hoisted(() =>
  vi.fn(() => ({
    rotate: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
  })),
);

vi.mock("sharp", () => ({
  default: sharpMock,
}));

describe("parseDataUrl", () => {
  it("parses base64 data URL", () => {
    const p = parseDataUrl("data:image/png;base64,QUJD");
    expect(p).toEqual({ mime: "image/png", base64: "QUJD" });
  });

  it("returns null for invalid", () => {
    expect(parseDataUrl("not-a-data-url")).toBeNull();
    expect(parseDataUrl("data:text/plain,hello")).toBeNull();
  });
});

describe("inferMimeTypeForIntakeAsset", () => {
  it("fills HEIC from data URL when mime wrong", () => {
    const a: ImageAssetInput = {
      url: "data:image/heic;base64,QUJD",
      mimeType: "application/octet-stream",
    };
    const out = inferMimeTypeForIntakeAsset(a);
    expect(out.mimeType).toBe("image/heic");
  });

  it("fills from .heic filename", () => {
    const a: ImageAssetInput = {
      url: "data:application/octet-stream;base64,QUJD",
      mimeType: "",
      filename: "scan.heic",
    };
    const out = inferMimeTypeForIntakeAsset(a);
    expect(out.mimeType).toBe("image/heic");
  });
});

describe("normalizeHeicHeifIntakeAssetIfNeeded", () => {
  beforeEach(() => {
    sharpMock.mockClear();
    sharpMock.mockImplementation(() => ({
      rotate: vi.fn().mockReturnThis(),
      jpeg: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
    }));
  });

  it("passes through JPEG unchanged", async () => {
    const input: ImageAssetInput = {
      url: "data:image/jpeg;base64,/9j/4AAQ",
      mimeType: "image/jpeg",
      sizeBytes: 10,
    };
    const out = await normalizeHeicHeifIntakeAssetIfNeeded(input);
    expect(out).toEqual(input);
    expect(sharpMock).not.toHaveBeenCalled();
  });

  it("converts HEIC data URL to JPEG via sharp", async () => {
    const raw = Buffer.from("fake-heic-bytes");
    const b64 = raw.toString("base64");
    const input: ImageAssetInput = {
      url: `data:image/heic;base64,${b64}`,
      mimeType: "image/heic",
      filename: "photo.heic",
      sizeBytes: raw.length,
    };
    const out = await normalizeHeicHeifIntakeAssetIfNeeded(input);
    expect(out.mimeType).toBe("image/jpeg");
    expect(out.filename).toBe("photo.jpg");
    expect(out.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(sharpMock).toHaveBeenCalled();
  });
});

describe("normalizeIntakeImageAssetsForVision", () => {
  beforeEach(() => {
    sharpMock.mockClear();
    sharpMock.mockImplementation(() => ({
      rotate: vi.fn().mockReturnThis(),
      jpeg: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
    }));
  });

  it("normalizes batch with mixed JPEG and HEIC", async () => {
    const jpeg: ImageAssetInput = {
      url: "data:image/jpeg;base64,QUJD",
      mimeType: "image/jpeg",
    };
    const heicB64 = Buffer.from("x").toString("base64");
    const heic: ImageAssetInput = {
      url: `data:image/heic;base64,${heicB64}`,
      mimeType: "image/heic",
    };
    const res = await normalizeIntakeImageAssetsForVision([jpeg, heic]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.assets[0]).toEqual(jpeg);
    expect(res.assets[1]!.mimeType).toBe("image/jpeg");
  });
});
