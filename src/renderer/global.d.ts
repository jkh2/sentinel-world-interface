import type { SidlfApi } from '../preload/index';

declare global {
  interface Window {
    sidlf: SidlfApi;
  }
}

export {};
