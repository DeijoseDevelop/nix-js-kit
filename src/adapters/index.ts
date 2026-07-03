/**
 * Common options shared by all nix-js-kit deployment adapters.
 */
export interface AdapterOptions {
  /** Project root directory. */
  root: string;
  /** Pages directory relative to root (default: src/app). */
  appDir: string;
  /** Islands directory relative to root (default: src/islands). */
  islandsDir: string;
  /** Output directory relative to root (default: dist). */
  outDir: string;
  /** Public path for the client entry module (default: /_nix-js/entry-client.js). */
  clientEntry: string;
  /** HTML lang attribute (default: es). */
  lang: string;
  /** Import specifier for hydrateIslands in the generated client entry. */
  hydrateImport?: string;
}

/**
 * An adapter turns a nix-js-kit build into a deployment target output.
 */
export interface Adapter {
  name: string;
  build(options: AdapterOptions): Promise<void>;
}
