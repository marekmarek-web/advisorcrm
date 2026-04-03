import type { DocumentProcessingProviderInterface } from "./types";
import { DisabledProvider } from "./disabled-provider";
import { getProcessingConfig } from "./config";

let _provider: DocumentProcessingProviderInterface | null = null;

export function getProcessingProvider(): DocumentProcessingProviderInterface {
  if (_provider) return _provider;

  const config = getProcessingConfig();

  if (!config.processingEnabled || config.provider === "disabled" || config.provider === "none") {
    _provider = new DisabledProvider();
    return _provider;
  }

  if (config.provider === "adobe") {
    if (!config.adobeClientId || !config.adobeClientSecret) {
      console.warn("[doc-processing] Adobe provider configured but credentials missing, falling back to disabled");
      _provider = new DisabledProvider();
      return _provider;
    }

    // Lazy require: keep Adobe SDK off the hot path until Adobe is selected (sync factory API).
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy CJS boundary
    const { AdobeProvider } = require("@/lib/documents/processing/adobe-provider") as {
      AdobeProvider: new () => DocumentProcessingProviderInterface;
    };
    _provider = new AdobeProvider();
    return _provider;
  }

  _provider = new DisabledProvider();
  return _provider;
}

export function resetProviderCache() {
  _provider = null;
}
