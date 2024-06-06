// sessionStore.ts
export function getSessionStore(key: string) {
  return () => sessionStorage.getItem(key) || "[]";
}

export function subscribeSessionStore(callback: (event: StorageEvent) => void) {
  window.addEventListener("storage", callback);

  return () => window.removeEventListener("storage", callback);
}

export function setSessionStore(key: string, value: any[]) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new StorageEvent("storage"));
  }
}
