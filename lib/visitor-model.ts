"use client";
import { useSyncExternalStore } from "react";
import { credentialHeaders, validateVisitorModel, type VisitorModel } from "./visitor-credentials";

// Deliberately memory-only: keys are excluded from browser storage, workspace exports and URLs.
let current: VisitorModel | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => current;
const serverSnapshot = () => null;
export const useVisitorModel = () => useSyncExternalStore(subscribe, snapshot, serverSnapshot);
export function setVisitorModel(config: VisitorModel | null) {
  current = config ? validateVisitorModel(config) : null;
  for (const listener of listeners) listener();
}
export const visitorModelHeaders = () => credentialHeaders(current);
export const openApiSettings = () => window.dispatchEvent(new Event("datapilot:configure-api"));
