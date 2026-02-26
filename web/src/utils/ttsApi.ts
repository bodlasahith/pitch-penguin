import { apiFetch } from "./api";

export type ServerTtsRequest = {
  text: string;
  voiceProfile?: string;
  voiceId?: string;
};

const ttsBlobCache = new Map<string, Blob>();
const ttsInFlight = new Map<string, Promise<Blob | null>>();
const ttsFailedAt = new Map<string, number>();
const PREFETCH_RETRY_COOLDOWN_MS = 30_000;
const TTS_IDB_NAME = "pitch-penguin-tts-cache";
const TTS_IDB_VERSION = 1;
const TTS_IDB_STORE = "ttsAudio";
let ttsDbPromise: Promise<IDBDatabase | null> | null = null;

const ttsCacheKey = (payload: ServerTtsRequest) => {
  const voice = payload.voiceId?.trim() || payload.voiceProfile?.trim() || "default";
  return `${voice.toLowerCase()}::${payload.text.trim()}`;
};

type PersistedTtsRecord = {
  key: string;
  blob: Blob;
  createdAt: number;
};

const openTtsCacheDb = (): Promise<IDBDatabase | null> => {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  if (ttsDbPromise) {
    return ttsDbPromise;
  }

  ttsDbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(TTS_IDB_NAME, TTS_IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(TTS_IDB_STORE)) {
          db.createObjectStore(TTS_IDB_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return ttsDbPromise;
};

const readPersistedTtsAudio = async (key: string): Promise<Blob | null> => {
  const db = await openTtsCacheDb();
  if (!db) {
    return null;
  }

  return await new Promise((resolve) => {
    try {
      const tx = db.transaction(TTS_IDB_STORE, "readonly");
      const store = tx.objectStore(TTS_IDB_STORE);
      const request = store.get(key);
      request.onsuccess = () => {
        const value = request.result as PersistedTtsRecord | undefined;
        resolve(value?.blob ?? null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const persistTtsAudio = async (key: string, blob: Blob): Promise<void> => {
  const db = await openTtsCacheDb();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(TTS_IDB_STORE, "readwrite");
      const store = tx.objectStore(TTS_IDB_STORE);
      const value: PersistedTtsRecord = {
        key,
        blob,
        createdAt: Date.now(),
      };
      store.put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
};

const fetchServerTtsAudioUncached = async (payload: ServerTtsRequest): Promise<Blob | null> => {
  const response = await apiFetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    // 429 = rate limited, gracefully fall back to browser speech
    if (response.status === 429) {
      console.warn("[TTS] Server rate limited (429), falling back to browser speech");
      return null;
    }
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("audio/")) {
    return null;
  }

  const audioBlob = await response.blob();
  if (audioBlob.size === 0) {
    return null;
  }

  return audioBlob;
};

export const fetchServerTtsAudio = async (payload: ServerTtsRequest): Promise<Blob | null> => {
  const key = ttsCacheKey(payload);
  const cached = ttsBlobCache.get(key);
  if (cached) {
    return cached;
  }
  const persisted = await readPersistedTtsAudio(key);
  if (persisted) {
    ttsBlobCache.set(key, persisted);
    ttsFailedAt.delete(key);
    return persisted;
  }
  const existingRequest = ttsInFlight.get(key);
  if (existingRequest) {
    return existingRequest;
  }

  const requestPromise = fetchServerTtsAudioUncached(payload)
    .then((audioBlob) => {
      if (audioBlob) {
        ttsBlobCache.set(key, audioBlob);
        ttsFailedAt.delete(key);
        void persistTtsAudio(key, audioBlob);
      } else {
        ttsFailedAt.set(key, Date.now());
      }
      return audioBlob;
    })
    .catch((error) => {
      ttsFailedAt.set(key, Date.now());
      throw error;
    })
    .finally(() => {
      ttsInFlight.delete(key);
    });

  ttsInFlight.set(key, requestPromise);
  return requestPromise;
};

export const prefetchServerTtsAudio = async (payload: ServerTtsRequest): Promise<void> => {
  const key = ttsCacheKey(payload);
  const failedAt = ttsFailedAt.get(key);
  if (typeof failedAt === "number" && Date.now() - failedAt < PREFETCH_RETRY_COOLDOWN_MS) {
    return;
  }
  await fetchServerTtsAudio(payload);
};
