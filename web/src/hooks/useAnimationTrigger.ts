import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type MascotAnimationState =
  | "idle"
  | "selected"
  | "deselected"
  | "pitching"
  | "winner"
  | "loser"
  | "final-round"
  | "judging";

export type MascotEvent =
  | "select"
  | "deselect"
  | "win"
  | "lose"
  | "lose-money"
  | "pitch"
  | "present"
  | "enter-final"
  | "judge"
  | "idle";

interface MascotAnimationConfig {
  character?: string; // 'blob' | 'chart' | 'gremlin' | 'walrus' | etc
  onAnimationEnd?: () => void;
}

type AnimationDefinition = { primary: string; secondary?: string[] };
type TriggerFn = (event: MascotEvent, holdDuration?: number) => void;

const EVENT_DURATIONS: Record<MascotEvent, number | null> = {
  select: 600,
  deselect: 300,
  win: 1000,
  lose: 800,
  "lose-money": 800,
  pitch: null,
  present: null,
  "enter-final": 1000,
  judge: null,
  idle: null,
};

const EVENT_TO_STATE: Record<MascotEvent, MascotAnimationState> = {
  select: "selected",
  deselect: "deselected",
  win: "winner",
  lose: "loser",
  "lose-money": "loser",
  pitch: "pitching",
  present: "pitching",
  "enter-final": "final-round",
  judge: "judging",
  idle: "idle",
};

const WIN_ANIMATIONS: Record<string, AnimationDefinition> = {
  blob: { primary: "mascot-winner", secondary: ["blob-winning", "blob-tie"] },
  chart: { primary: "mascot-winner", secondary: ["chart-winning"] },
  gremlin: { primary: "mascot-winner", secondary: ["gremlin-winning", "gremlin-bulb"] },
  hamster: { primary: "mascot-winner", secondary: ["hamster-winning", "hamster-coin"] },
  llama: { primary: "mascot-winner" },
  shark: { primary: "mascot-winner", secondary: ["shark-winning"] },
  unicorn: { primary: "mascot-winner", secondary: ["unicorn-winning", "unicorn-horn"] },
  walrus: {
    primary: "mascot-winner",
    secondary: ["walrus-winning", "walrus-monocle", "walrus-monocle-glint"],
  },
  octopus: { primary: "mascot-winner", secondary: ["octopus-winning"] },
  scientist: { primary: "mascot-winner", secondary: ["scientist-winning", "scientist-spark"] },
};

const SELECT_ANIMATIONS: Record<string, AnimationDefinition> = {
  blob: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "blob-select"] },
  chart: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "chart-select"] },
  gremlin: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "gremlin-select"] },
  goblin: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "goblin-select"] },
  robot: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "robot-select"] },
  unicorn: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "unicorn-select"] },
  shark: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "shark-select"] },
  octopus: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "octopus-select"] },
  llama: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "llama-select"] },
  hamster: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "hamster-select"] },
  walrus: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "walrus-select"] },
  rocket: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "rocket-select"] },
  raccoon: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "raccoon-select"] },
  scientist: { primary: "mascot-selected", secondary: ["mascot-selected-glow", "scientist-select"] },
};

const PITCH_ANIMATIONS: Record<string, AnimationDefinition> = {
  blob: { primary: "mascot-idle", secondary: ["blob-presenting"] },
  chart: { primary: "mascot-idle", secondary: ["chart-presenting"] },
  gremlin: { primary: "mascot-idle", secondary: ["gremlin-presenting"] },
  goblin: { primary: "mascot-idle", secondary: ["goblin-presenting"] },
  robot: { primary: "mascot-idle", secondary: ["robot-presenting"] },
  unicorn: { primary: "mascot-idle", secondary: ["unicorn-presenting"] },
  shark: { primary: "mascot-idle", secondary: ["shark-presenting"] },
  octopus: { primary: "mascot-idle", secondary: ["octopus-presenting"] },
  llama: { primary: "mascot-idle", secondary: ["llama-presenting"] },
  hamster: { primary: "mascot-idle", secondary: ["hamster-presenting"] },
  walrus: { primary: "mascot-idle", secondary: ["walrus-presenting"] },
  rocket: { primary: "mascot-idle", secondary: ["rocket-presenting"] },
  raccoon: { primary: "mascot-idle", secondary: ["raccoon-presenting"] },
  scientist: { primary: "mascot-idle", secondary: ["scientist-presenting"] },
};

const LOSE_ANIMATIONS: Record<string, AnimationDefinition> = {
  blob: { primary: "mascot-lose-money", secondary: ["blob-losing"] },
  chart: { primary: "mascot-lose-money", secondary: ["chart-losing"] },
  gremlin: { primary: "mascot-lose-money", secondary: ["gremlin-losing"] },
  goblin: { primary: "mascot-lose-money", secondary: ["goblin-losing"] },
  robot: { primary: "mascot-lose-money", secondary: ["robot-losing"] },
  unicorn: { primary: "mascot-lose-money", secondary: ["unicorn-losing"] },
  shark: { primary: "mascot-lose-money", secondary: ["shark-losing"] },
  octopus: { primary: "mascot-lose-money", secondary: ["octopus-losing"] },
  llama: { primary: "mascot-lose-money", secondary: ["llama-losing"] },
  hamster: { primary: "mascot-lose-money", secondary: ["hamster-losing"] },
  walrus: { primary: "mascot-lose-money", secondary: ["walrus-losing"] },
  rocket: { primary: "mascot-lose-money", secondary: ["rocket-losing"] },
  raccoon: { primary: "mascot-lose-money", secondary: ["raccoon-losing"] },
  scientist: { primary: "mascot-lose-money", secondary: ["scientist-losing"] },
};

export function useAnimationTrigger(config: MascotAnimationConfig = {}) {
  const { character, onAnimationEnd } = config;
  const [state, setState] = useState<MascotAnimationState>("idle");
  const [animationClass, setAnimationClass] = useState("mascot-idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolvedCharacter = useMemo(() => character?.toLowerCase(), [character]);

  const getAnimationDefinition = useCallback(
    (event: MascotEvent): AnimationDefinition => {
      switch (event) {
        case "select":
          return (
            SELECT_ANIMATIONS[resolvedCharacter ?? ""] ?? {
              primary: "mascot-selected",
              secondary: ["mascot-selected-glow"],
            }
          );
        case "deselect":
          return { primary: "mascot-deselected" };
        case "win":
          return (
            WIN_ANIMATIONS[resolvedCharacter ?? ""] ?? {
              primary: "mascot-winner",
              secondary: ["mascot-winner-glow"],
            }
          );
        case "lose":
        case "lose-money":
          return LOSE_ANIMATIONS[resolvedCharacter ?? ""] ?? { primary: "mascot-lose-money" };
        case "enter-final":
          return { primary: "mascot-final-round", secondary: ["mascot-final-round-spotlight"] };
        case "judge":
          return resolvedCharacter === "walrus"
            ? { primary: "mascot-idle", secondary: ["walrus-judging"] }
            : { primary: "mascot-idle" };
        case "pitch":
        case "present":
          return PITCH_ANIMATIONS[resolvedCharacter ?? ""] ?? { primary: "mascot-idle" };
        case "idle":
        default:
          return { primary: "mascot-idle" };
      }
    },
    [resolvedCharacter],
  );

  const reset = useCallback(() => {
    setState("idle");
    setAnimationClass("mascot-idle");
    onAnimationEnd?.();
  }, [onAnimationEnd]);

  const trigger = useCallback<TriggerFn>(
    (event, holdDuration) => {
      const animation = getAnimationDefinition(event);
      const classes = [animation.primary, ...(animation.secondary ?? [])].join(" ");

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setState(EVENT_TO_STATE[event]);
      setAnimationClass(classes);

      const duration = holdDuration ?? EVENT_DURATIONS[event];
      if (duration === null || duration <= 0) {
        return;
      }

      timeoutRef.current = setTimeout(() => {
        reset();
      }, duration);
    },
    [getAnimationDefinition, reset],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    state,
    animationClass,
    trigger,
    reset,
  };
}

/**
 * Registry helper for managing many mascot animators from one parent.
 */
export function useGameAnimationState() {
  const mascotAnimations = useRef(new Map<string, TriggerFn>());

  const registerPlayer = useCallback((playerName: string, trigger: TriggerFn | null) => {
    if (!trigger) {
      mascotAnimations.current.delete(playerName);
      return;
    }
    mascotAnimations.current.set(playerName, trigger);
  }, []);

  const triggerForPlayer = useCallback(
    (playerName: string, event: MascotEvent, holdDuration?: number) => {
      mascotAnimations.current.get(playerName)?.(event, holdDuration);
    },
    [],
  );

  return {
    registerPlayer,
    triggerForPlayer,
  };
}
