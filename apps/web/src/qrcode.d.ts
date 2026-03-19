declare module "qrcode" {
  interface QRCodeOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: string;
    color?: {
      dark?: string;
      light?: string;
    };
  }
  function toDataURL(text: string, options?: QRCodeOptions): Promise<string>;
  const qrcode: { toDataURL: typeof toDataURL };
  export default qrcode;
}
