export type PhaseSound = "lobby" | "deal" | "pitch" | "reveal" | "vote" | "results" | "final-round";
export type ActionSound =
  | "join_lobby"
  | "start_round"
  | "submit_pitch"
  | "ai_challenge"
  | "end_game";
const SFX_STORAGE_KEY = "pp:sfx-enabled";

type Step = {
  freq: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
};

let audioContext: AudioContext | null = null;
const lastPlayedAt = new Map<string, number>();
let sfxEnabledCache: boolean | null = null;

const phasePatterns: Record<PhaseSound, Step[]> = {
  lobby: [
    { freq: 392, duration: 0.08, gain: 0.035, type: "sine" },
    { freq: 523.25, duration: 0.1, gain: 0.04, type: "triangle" },
  ],
  deal: [
    { freq: 261.63, duration: 0.1, gain: 0.04, type: "triangle" },
    { freq: 329.63, duration: 0.1, gain: 0.04, type: "triangle" },
    { freq: 392, duration: 0.12, gain: 0.045, type: "triangle" },
  ],
  pitch: [
    { freq: 440, duration: 0.08, gain: 0.04, type: "square" },
    { freq: 493.88, duration: 0.08, gain: 0.04, type: "square" },
    { freq: 587.33, duration: 0.1, gain: 0.045, type: "square" },
  ],
  reveal: [
    { freq: 196, duration: 0.08, gain: 0.04, type: "sawtooth" },
    { freq: 246.94, duration: 0.1, gain: 0.045, type: "sawtooth" },
    { freq: 329.63, duration: 0.12, gain: 0.05, type: "triangle" },
  ],
  vote: [
    { freq: 349.23, duration: 0.08, gain: 0.04, type: "sine" },
    { freq: 293.66, duration: 0.08, gain: 0.035, type: "sine" },
    { freq: 392, duration: 0.1, gain: 0.045, type: "triangle" },
  ],
  results: [
    { freq: 392, duration: 0.08, gain: 0.045, type: "triangle" },
    { freq: 523.25, duration: 0.1, gain: 0.05, type: "triangle" },
    { freq: 659.25, duration: 0.14, gain: 0.055, type: "triangle" },
  ],
  "final-round": [
    { freq: 293.66, duration: 0.08, gain: 0.045, type: "sawtooth" },
    { freq: 369.99, duration: 0.08, gain: 0.05, type: "sawtooth" },
    { freq: 493.88, duration: 0.1, gain: 0.055, type: "triangle" },
    { freq: 587.33, duration: 0.12, gain: 0.06, type: "triangle" },
  ],
};

const actionPatterns: Record<ActionSound, Step[]> = {
  join_lobby: [
    { freq: 523.25, duration: 0.07, gain: 0.04, type: "sine" },
    { freq: 659.25, duration: 0.09, gain: 0.045, type: "triangle" },
  ],
  start_round: [
    { freq: 261.63, duration: 0.08, gain: 0.04, type: "triangle" },
    { freq: 329.63, duration: 0.08, gain: 0.045, type: "triangle" },
    { freq: 392, duration: 0.1, gain: 0.05, type: "triangle" },
  ],
  submit_pitch: [
    { freq: 392, duration: 0.06, gain: 0.04, type: "square" },
    { freq: 523.25, duration: 0.08, gain: 0.045, type: "square" },
  ],
  ai_challenge: [
    { freq: 311.13, duration: 0.06, gain: 0.04, type: "sawtooth" },
    { freq: 261.63, duration: 0.06, gain: 0.035, type: "sawtooth" },
    { freq: 349.23, duration: 0.08, gain: 0.045, type: "triangle" },
  ],
  end_game: [
    { freq: 392, duration: 0.1, gain: 0.05, type: "triangle" },
    { freq: 523.25, duration: 0.12, gain: 0.055, type: "triangle" },
    { freq: 659.25, duration: 0.14, gain: 0.06, type: "triangle" },
    { freq: 783.99, duration: 0.16, gain: 0.065, type: "triangle" },
  ],
};

const getAudioContext = () => {
  if (typeof window === "undefined") {
    return null;
  }
  if (!audioContext) {
    const Ctx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      return null;
    }
    audioContext = new Ctx();
  }
  return audioContext;
};

const shouldThrottle = (key: string, cooldownMs: number) => {
  const now = Date.now();
  const last = lastPlayedAt.get(key) ?? 0;
  if (now - last < cooldownMs) {
    return true;
  }
  lastPlayedAt.set(key, now);
  return false;
};

export const isSoundEffectsEnabled = () => {
  if (sfxEnabledCache !== null) {
    return sfxEnabledCache;
  }
  if (typeof window === "undefined") {
    sfxEnabledCache = true;
    return sfxEnabledCache;
  }
  const stored = window.localStorage.getItem(SFX_STORAGE_KEY);
  sfxEnabledCache = stored !== "false";
  return sfxEnabledCache;
};

export const setSoundEffectsEnabled = (enabled: boolean) => {
  sfxEnabledCache = enabled;
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SFX_STORAGE_KEY, enabled ? "true" : "false");
};

const playSequence = (steps: Step[], key: string, cooldownMs: number) => {
  if (!isSoundEffectsEnabled()) {
    return;
  }
  if (shouldThrottle(key, cooldownMs)) {
    return;
  }

  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  let offset = 0;
  const start = ctx.currentTime;
  steps.forEach((step) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = step.type ?? "sine";
    osc.frequency.value = step.freq;

    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(step.gain, start + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + step.duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start + offset);
    osc.stop(start + offset + step.duration + 0.015);

    offset += step.duration + 0.02;
  });
};

export const playPhaseSound = (phase: PhaseSound) => {
  playSequence(phasePatterns[phase], `phase:${phase}`, 700);
};

export const playActionSound = (action: ActionSound) => {
  playSequence(actionPatterns[action], `action:${action}`, 250);
};
