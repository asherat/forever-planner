import type { TSM } from "./tsm.ts";

declare global {
  interface Window {
    TSM: typeof TSM;
    start: () => void;
    startCrafting: () => void;
  }
}

export {};
