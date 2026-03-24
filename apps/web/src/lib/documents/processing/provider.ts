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

    // Lazy import to avoid loading Adobe SDK when not needed
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
