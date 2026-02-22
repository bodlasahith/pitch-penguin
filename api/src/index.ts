import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Fastify from "fastify";
import { Server as SocketIOServer, type Socket as SocketIOSocket } from "socket.io";
import cardsData from "./cards.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

type Player = {
  name: string;
  points: number;
};

type Pitch = {
  id: string;
  player: string;
  title: string;
  summary: string;
  voice: string;
  usedMustHaves: string[];
  aiGenerated?: boolean;
  sketchData?: string | null;
  isValid?: boolean;
  isDisqualified?: boolean;
};

type RoundVote = {
  pitchId: string;
  voter: string;
  createdAt: string;
};

type RoundResult = {
  round: number;
  winner: string;
  pitchId: string;
  penguinSurpriseWinner: boolean;
  pointsAwarded: number;
  createdAt: string;
};

type Challenge = {
  accuser: string;
  pitchId: string;
  verdict: "upheld" | "rejected" | "pending";
  wasCorrect?: boolean;
  createdAt: string;
};

type ChallengeReveal = {
  accuser: string;
  pitchId: string;
  wasCorrect: boolean;
  disqualifiedPlayer: string;
  createdAt: string;
};

type RoundWinnerSummary = {
  player: string;
  pitchId: string;
  pitchTitle: string;
  sketchData?: string | null;
  pointsAwarded: number;
  penguinSurpriseWinner: boolean;
  createdAt: string;
};

type RoomPlayer = {
  name: string;
  isHost: boolean;
  mascot?: string;
  joinedAt: string;
};

type Room = {
  code: string;
  status: "lobby" | "deal" | "pitch" | "reveal" | "vote" | "results" | "final-round";
  players: RoomPlayer[];
  createdAt: string;
  lastActiveAt: number;
};

type GamePhase = "lobby" | "deal" | "pitch" | "reveal" | "vote" | "results" | "final-round";

type PlayerPitchStatus = "pending" | "drafting" | "ready";

type RoomGameState = {
  phase: GamePhase;
  penguin: string;
  penguinQueue: string[];
  penguinQueueIndex: number;
  round: number;
  penguinAskTimerSeconds: number;
  pitchTimerSeconds: number;
  askDeckQueue: string[];
  mustHaveDeckQueue: string[];
  surpriseDeckQueue: string[];
  askOptions: string[];
  selectedAsk: string | null;
  askSelectionExpiresAt: number | null;
  askSelectionTimeoutId: ReturnType<typeof setTimeout> | null;
  pitchEndsAt: number | null;
  pitchTimerTimeoutId: ReturnType<typeof setTimeout> | null;
  mustHavesByPlayer: Record<string, string[]>;
  surpriseByPlayer: Record<string, string | null>;
  pitchStatusByPlayer: Record<string, PlayerPitchStatus>;
  penguinSurprisePlayer: string | null;
  robotVoiceEnabled: boolean;
  challenges: Challenge[];
  challengeReveal: ChallengeReveal | null;
  lastRoundWinner: RoundWinnerSummary | null;
  viewedPitchIds: Set<string>;
  disqualifiedPlayers: Set<string>;
  playerScores: Record<string, number>;
  gameWinner: string | null;
  gameWinners: string[];
  finalRoundPlayers: string[];
  finalRoundRankings: Record<string, string[]>;
  judgeViewedPitches: Record<string, Set<string>>;
  finalRoundPenguin?: string | null;
  finalRoundTruceByPlayer: Record<string, boolean>;
  truceActivated?: boolean;
  roundNoParticipation: boolean;
  playersReady: Set<string>;
  timerStarted: boolean;
};

const server = Fastify({
  logger: true,
});
let io: SocketIOServer | null = null;

const RULES = cardsData.rules;
const ASK_DECK = cardsData.askDeck;
const MUST_HAVE_DECK = cardsData.mustHaveDeck;
const SURPRISE_DECK = cardsData.surpriseDeck;
const MASCOT_OPTIONS = cardsData.mascotOptions;

const rooms = new Map<string, Room>();
const roomGameStates = new Map<string, RoomGameState>();
const roomPitches = new Map<string, Pitch[]>();
const ROOM_CAPACITY = 14;
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
const DEAPI_BASE_URL = process.env.DEAPI_BASE_URL ?? "https://api.deapi.ai";
const DEAPI_TTS_MODEL = process.env.DEAPI_TTS_MODEL ?? "Kokoro";
const DEAPI_TTS_FORMAT = process.env.DEAPI_TTS_FORMAT ?? "mp3";
const DEAPI_TTS_LANG = process.env.DEAPI_TTS_LANG ?? "en-us";
const DEAPI_TTS_SAMPLE_RATE = Number(process.env.DEAPI_TTS_SAMPLE_RATE ?? "24000");
const DEAPI_POLL_INTERVAL_MS = 1000;
const DEAPI_MAX_POLL_ATTEMPTS = 15;
const DEAPI_KOKORO_VOICE_IDS: Record<string, string> = {
  adam: "am_adam",
  alloy: "af_alloy",
  aoede: "af_aoede",
  bella: "af_bella",
  echo: "am_echo",
  eric: "am_eric",
  fenrir: "am_fenrir",
  heart: "af_heart",
  jessica: "af_jessica",
  kore: "af_kore",
  liam: "am_liam",
  michael: "am_michael",
  nicole: "af_nicole",
  nova: "af_nova",
  onyx: "am_onyx",
  puck: "am_puck",
  river: "af_river",
  santa: "am_santa",
  sarah: "af_sarah",
  sky: "af_sky",
};
const DEAPI_VOICE_BY_PROFILE: Record<string, string> = {
  "game show host": "Heart",
  "arcade ringleader": "am_puck",
  "chaos commentator": "Nova",
  "retro robot mc": "Onyx",
  "neon announcer": "Heart",
  "calm founder": "Onyx",
  "buzzword bot": "Nova",
  "wall street hype": "am_puck",
};

const getAvailableMascots = (room: Room, excludePlayerName?: string) => {
  const excluded = excludePlayerName?.toLowerCase().trim();
  const used = new Set(
    room.players
      .filter((player) => (excluded ? player.name.toLowerCase().trim() !== excluded : true))
      .map((player) => player.mascot)
      .filter(Boolean),
  );
  return MASCOT_OPTIONS.filter((mascot) => !used.has(mascot));
};

const PHASE_ORDER: GamePhase[] = ["lobby", "deal", "pitch", "reveal", "vote", "results"];

const shuffle = <T>(items: T[]) => {
  return items
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
};

const getMustHaveBonus = (usedMustHaves?: string[]) => {
  const count = usedMustHaves?.length ?? 0;
  return Math.max(0, count - 1) * 0.25;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseJsonSafely = async (response: { json: () => Promise<unknown> }) => {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const getNestedValue = (obj: Record<string, unknown>, path: string[]): unknown => {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const getNestedString = (obj: Record<string, unknown>, path: string[]): string | null => {
  const value = getNestedValue(obj, path);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizePitchTitle = (title?: string | null) => (title ?? "").trim().toLowerCase();
const isUntitledPitchTitle = (title?: string | null) => normalizePitchTitle(title) === "untitled pitch";
const stripEmojiForTts = (text: string) =>
  text
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const resolveDeapiVoice = (voiceId?: string, voiceProfile?: string) => {
  const direct = voiceId?.trim();
  if (direct) {
    const lowered = direct.toLowerCase();
    if (DEAPI_KOKORO_VOICE_IDS[lowered]) {
      return DEAPI_KOKORO_VOICE_IDS[lowered];
    }
    if (/^[a-z0-9_:-]+$/i.test(direct)) {
      return direct;
    }
  }
  const normalizedProfile = voiceProfile?.trim().toLowerCase() ?? "";
  if (normalizedProfile && DEAPI_VOICE_BY_PROFILE[normalizedProfile]) {
    const mapped = DEAPI_VOICE_BY_PROFILE[normalizedProfile];
    const lowered = mapped.toLowerCase();
    return DEAPI_KOKORO_VOICE_IDS[lowered] ?? mapped;
  }
  const fallback = DEAPI_VOICE_BY_PROFILE["game show host"];
  return DEAPI_KOKORO_VOICE_IDS[fallback.toLowerCase()] ?? fallback;
};

const generateDeapiTts = async (
  apiKey: string,
  text: string,
  voice: string,
): Promise<{ audio: Buffer; contentType: string }> => {
  const sanitizedText = stripEmojiForTts(text);
  const textForTts = sanitizedText || "No pitch provided.";
  const createResponse = await fetch(`${DEAPI_BASE_URL}/api/v1/client/txt2audio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      text: textForTts,
      model: DEAPI_TTS_MODEL,
      lang: DEAPI_TTS_LANG,
      voice,
      speed: 1,
      format: DEAPI_TTS_FORMAT,
      sample_rate: Number.isFinite(DEAPI_TTS_SAMPLE_RATE) ? DEAPI_TTS_SAMPLE_RATE : 24000,
    }),
  });

  if (!createResponse.ok) {
    const errorPayload = await parseJsonSafely(createResponse);
    const message =
      getNestedString(errorPayload, ["message"]) ??
      getNestedString(errorPayload, ["error", "message"]) ??
      "Failed to create TTS request";
    throw new Error(message);
  }

  const createPayload = await parseJsonSafely(createResponse);
  const requestId =
    getNestedString(createPayload, ["data", "request_id"]) ??
    getNestedString(createPayload, ["request_id"]);
  if (!requestId) {
    throw new Error("deAPI did not return request_id");
  }

  let resultUrl: string | null = null;
  for (let attempt = 0; attempt < DEAPI_MAX_POLL_ATTEMPTS; attempt += 1) {
    const statusResponse = await fetch(`${DEAPI_BASE_URL}/api/v1/client/request-status/${requestId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!statusResponse.ok) {
      const statusPayload = await parseJsonSafely(statusResponse);
      const statusMessage =
        getNestedString(statusPayload, ["message"]) ??
        getNestedString(statusPayload, ["error", "message"]) ??
        "Failed to read TTS status";
      throw new Error(statusMessage);
    }

    const statusPayload = await parseJsonSafely(statusResponse);
    const statusRaw =
      getNestedString(statusPayload, ["data", "status"]) ??
      getNestedString(statusPayload, ["status"]) ??
      "pending";
    const status = statusRaw.toLowerCase();
    resultUrl =
      getNestedString(statusPayload, ["data", "result_url"]) ??
      getNestedString(statusPayload, ["result_url"]) ??
      getNestedString(statusPayload, ["data", "url"]) ??
      getNestedString(statusPayload, ["url"]);

    if ((status === "completed" || status === "success" || status === "done") && resultUrl) {
      break;
    }
    if (status === "failed" || status === "error") {
      const failureMessage =
        getNestedString(statusPayload, ["data", "message"]) ??
        getNestedString(statusPayload, ["message"]) ??
        "deAPI TTS failed";
      throw new Error(failureMessage);
    }
    await sleep(DEAPI_POLL_INTERVAL_MS);
  }

  if (!resultUrl) {
    throw new Error("Timed out waiting for deAPI TTS audio");
  }

  const audioResponse = await fetch(resultUrl);
  if (!audioResponse.ok) {
    throw new Error("Failed to download generated TTS audio");
  }

  const audioArray = await audioResponse.arrayBuffer();
  const audio = Buffer.from(audioArray);
  const contentType = audioResponse.headers.get("content-type") ?? "audio/mpeg";
  return { audio, contentType };
};

const getNextPhase = (current: GamePhase) => {
  const index = PHASE_ORDER.indexOf(current);
  if (index === -1 || index === PHASE_ORDER.length - 1) {
    return "lobby";
  }
  return PHASE_ORDER[index + 1];
};

const drawCardsFromQueue = (queue: string[], sourceDeck: string[], count: number) => {
  const drawn: string[] = [];
  const drawsNeeded = Math.max(0, count);
  for (let idx = 0; idx < drawsNeeded; idx += 1) {
    if (queue.length === 0) {
      queue.push(...shuffle(sourceDeck));
    }
    const card = queue.shift();
    if (!card) {
      break;
    }
    drawn.push(card);
  }
  return drawn;
};

const initializeGameState = (room: Room): RoomGameState => {
  const penguinQueue = room.players.map((p) => p.name);
  const penguin = penguinQueue[Math.floor(Math.random() * penguinQueue.length)] ?? "Penguin";
  const penguinQueueIndex = penguinQueue.indexOf(penguin);
  const askDeckQueue = shuffle(ASK_DECK);
  const askOptions = drawCardsFromQueue(askDeckQueue, ASK_DECK, 3);
  const pitchStatusByPlayer: Record<string, PlayerPitchStatus> = {};
  const playerScores: Record<string, number> = {};
  room.players.forEach((player) => {
    pitchStatusByPlayer[player.name] = "pending";
    playerScores[player.name] = 0;
  });

  return {
    phase: room.status,
    penguin,
    penguinQueue,
    penguinQueueIndex,
    round: 0,
    penguinAskTimerSeconds: 30,
    pitchTimerSeconds: 120,
    askDeckQueue,
    mustHaveDeckQueue: shuffle(MUST_HAVE_DECK),
    surpriseDeckQueue: shuffle(SURPRISE_DECK),
    askOptions,
    selectedAsk: null,
    askSelectionExpiresAt: null,
    askSelectionTimeoutId: null,
    pitchEndsAt: null,
    pitchTimerTimeoutId: null,
    mustHavesByPlayer: {},
    surpriseByPlayer: {},
    pitchStatusByPlayer,
    penguinSurprisePlayer: null,
    robotVoiceEnabled: true,
    challenges: [],
    challengeReveal: null,
    lastRoundWinner: null,
    viewedPitchIds: new Set(),
    disqualifiedPlayers: new Set(),
    playerScores,
    gameWinner: null,
    gameWinners: [],
    finalRoundPlayers: [],
    finalRoundRankings: {},
    judgeViewedPitches: {},
    finalRoundPenguin: null,
    finalRoundTruceByPlayer: {},
    roundNoParticipation: false,
    playersReady: new Set(),
    timerStarted: false,
  };
};

const getRoomGameState = (room: Room) => {
  const existing = roomGameStates.get(room.code);
  if (existing) {
    return existing;
  }
  const created = initializeGameState(room);
  roomGameStates.set(room.code, created);
  return created;
};

const normalizePitchForClient = (pitch: Pitch) => {
  const title = pitch.title?.trim() ?? "";
  const summary = pitch.summary?.trim() ?? "";
  const untitledNoPitch = (!summary && !title) || (!summary && isUntitledPitchTitle(title));
  const missingMustHaves = (pitch.usedMustHaves?.length ?? 0) === 0;
  const missingContent = !title || !summary;
  const derivedDisqualified = missingMustHaves || missingContent || untitledNoPitch;
  return {
    ...pitch,
    isValid: pitch.isValid ?? !derivedDisqualified,
    isDisqualified: pitch.isDisqualified ?? derivedDisqualified,
  };
};

const isEmptyPitchSubmission = (pitch?: Pitch | null) => {
  if (!pitch) {
    return true;
  }
  const title = pitch.title?.trim() ?? "";
  const summary = pitch.summary?.trim() ?? "";
  return (!title && !summary) || (!summary && isUntitledPitchTitle(title));
};

const areAllPitchersEmpty = (room: Room, gameState: RoomGameState, pitches: Pitch[]) => {
  const pitchers = room.players.filter((player) => player.name !== gameState.penguin);
  if (pitchers.length === 0) {
    return false;
  }
  return pitchers.every((player) => {
    const pitch = pitches.find((item) => item.player === player.name);
    return isEmptyPitchSubmission(pitch);
  });
};

const isFinalRoundEligiblePitch = (pitch?: Pitch | null) => {
  if (!pitch) {
    return false;
  }
  if (isEmptyPitchSubmission(pitch)) {
    return false;
  }
  const title = pitch.title?.trim() ?? "";
  const summary = pitch.summary?.trim() ?? "";
  const hasRequiredMustHaves = (pitch.usedMustHaves?.length ?? 0) >= 2;
  if (!title || !summary || !hasRequiredMustHaves) {
    return false;
  }
  return pitch.isValid !== false && !pitch.isDisqualified;
};

const determineTopGameWinners = (scores: Record<string, number>) => {
  const entries = Object.entries(scores);
  if (entries.length === 0) {
    return [];
  }
  const max = Math.max(...entries.map(([, score]) => score));
  return entries.filter(([, score]) => score === max).map(([player]) => player);
};

const completeFinalRoundWithoutRanking = (
  room: Room,
  gameState: RoomGameState,
  eligiblePitches: Pitch[],
) => {
  // End the final-round timer and lock all finalists.
  if (gameState.pitchTimerTimeoutId) {
    clearTimeout(gameState.pitchTimerTimeoutId);
    gameState.pitchTimerTimeoutId = null;
  }
  gameState.pitchEndsAt = null;
  gameState.timerStarted = false;
  gameState.finalRoundPlayers.forEach((playerName) => {
    gameState.pitchStatusByPlayer[playerName] = "ready";
  });

  const judges = room.players
    .filter((player) => !gameState.finalRoundPlayers.includes(player.name))
    .map((player) => player.name);

  if (eligiblePitches.length === 0) {
    gameState.truceActivated = true;
  } else {
    gameState.truceActivated = false;
    const onlyPitch = eligiblePitches[0];
    const pointsAwarded = judges.length;
    gameState.playerScores[onlyPitch.player] =
      (gameState.playerScores[onlyPitch.player] ?? 0) + pointsAwarded;
  }

  const winners = determineTopGameWinners(gameState.playerScores);
  if (winners.length === 1) {
    gameState.gameWinner = winners[0];
    gameState.gameWinners = [winners[0]];
  } else {
    gameState.gameWinner = null;
    gameState.gameWinners = winners;
  }

  room.status = "results";
  gameState.phase = "results";
};

const buildRoomSnapshot = (room: Room) => {
  const gameState = getRoomGameState(room);
  gameState.phase = room.status;
  const judgeViewedPitches: Record<string, string[]> = {};
  Object.entries(gameState.judgeViewedPitches).forEach(([judge, pitchSet]) => {
    judgeViewedPitches[judge] = Array.from(pitchSet);
  });
  const pitches = (roomPitches.get(room.code) ?? []).map(normalizePitchForClient);
  return {
    ok: true,
    code: room.code,
    status: room.status,
    players: room.players,
    capacity: ROOM_CAPACITY,
    penguin: gameState.penguin,
    room: {
      code: room.code,
      serverNow: Date.now(),
      phase: room.status,
      penguin: gameState.penguin,
      round: gameState.round,
      playerScores: gameState.playerScores,
      askOptions: gameState.askOptions,
      selectedAsk: gameState.selectedAsk,
      penguinAskTimerSeconds: gameState.penguinAskTimerSeconds,
      pitchTimerSeconds: gameState.pitchTimerSeconds,
      robotVoiceEnabled: gameState.robotVoiceEnabled,
      askSelectionExpiresAt: gameState.askSelectionExpiresAt,
      pitchEndsAt: gameState.pitchEndsAt,
      penguinSurprisePlayer: gameState.penguinSurprisePlayer,
      gameWinner: gameState.gameWinner,
      gameWinners: gameState.gameWinners,
      finalRoundPlayers: gameState.finalRoundPlayers,
      finalRoundRankings: gameState.finalRoundRankings,
      judgeViewedPitches,
      challengeReveal: gameState.challengeReveal,
      lastRoundWinner: gameState.lastRoundWinner,
      roundNoParticipation: gameState.roundNoParticipation,
      viewedPitchIds: Array.from(gameState.viewedPitchIds),
      timerStarted: gameState.timerStarted,
      playersReadyCount: gameState.playersReady.size,
      playersTotal: room.players.length,
    },
    mustHavesByPlayer: gameState.mustHavesByPlayer,
    surpriseByPlayer: gameState.surpriseByPlayer,
    pitchStatusByPlayer: gameState.pitchStatusByPlayer,
    playerScores: gameState.playerScores,
    disqualifiedPlayers: Array.from(gameState.disqualifiedPlayers),
    pitches,
  };
};

const emitRoomSnapshot = (code: string) => {
  if (!io) {
    return;
  }
  const room = rooms.get(code);
  if (!room) {
    return;
  }
  io.to(code).emit("room:state", buildRoomSnapshot(room));
};

const createJoinCode = () => {
  const number = Math.floor(100 + Math.random() * 900);
  return `PPG-${number}`;
};

const createRoom = (hostName?: string) => {
  let code = createJoinCode();
  while (rooms.has(code)) {
    code = createJoinCode();
  }
  const now = new Date().toISOString();
  const name = hostName?.trim() || "Host";
  const mascot = MASCOT_OPTIONS[Math.floor(Math.random() * MASCOT_OPTIONS.length)];
  const room: Room = {
    code,
    status: "lobby",
    players: [
      {
        name,
        isHost: true,
        mascot,
        joinedAt: now,
      },
    ],
    createdAt: now,
    lastActiveAt: Date.now(),
  };
  rooms.set(code, room);
  roomGameStates.set(code, initializeGameState(room));
  return room;
};

const gameState = {
  roomCode: "PPG-482",
  phase: "reveal",
  round: 2,
  penguin: "Riley",
  penguinSurprisePlayer: "Jordan",
  ask: "Urban commuters are exhausted. Pitch a product that makes their mornings easier.",
  mustHaves: [
    "Must include a wearable component.",
    "Must run on solar power.",
    "Must integrate with public transit.",
    "Must include a daily ritual.",
  ],
  pitchTimerSeconds: 120,
  players: [
    { name: "Sam", points: 4 },
    { name: "Alex", points: 3 },
    { name: "Jordan", points: 2 },
    { name: "Riley", points: 1 },
  ] as Player[],
  pitches: [
    {
      id: "pitch-1",
      player: "Jordan",
      title: "SunRail Band",
      summary: "Solar wearable + transit sync + espresso drip.",
      voice: "Neon Announcer",
      usedMustHaves: ["wearable", "solar", "transit"],
    },
    {
      id: "pitch-2",
      player: "Alex",
      title: "Commuter Halo",
      summary: "Haptic collar that syncs to bus ETA and mood lighting.",
      voice: "Calm Founder",
      usedMustHaves: ["wearable", "transit"],
    },
    {
      id: "pitch-3",
      player: "Sam",
      title: "Daybreak Clip",
      summary: "Solar belt clip that unlocks turnstiles and powers earbuds.",
      voice: "Buzzword Bot",
      usedMustHaves: ["solar", "transit"],
    },
  ] as Pitch[],
  votes: [] as RoundVote[],
  challenges: [] as Challenge[],
  lastResult: null as RoundResult | null,
};

rooms.set(gameState.roomCode, {
  code: gameState.roomCode,
  status: "lobby",
  players: gameState.players.map((player, index) => ({
    name: player.name,
    isHost: index === 0,
    joinedAt: new Date().toISOString(),
  })),
  createdAt: new Date().toISOString(),
  lastActiveAt: Date.now(),
});
roomGameStates.set(gameState.roomCode, initializeGameState(rooms.get(gameState.roomCode)!));

const normalizeName = (name: string) => name.trim().toLowerCase();

const assignNextHost = (room: Room) => {
  if (room.players.length === 0) {
    return;
  }
  room.players = room.players.slice().sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  room.players.forEach((player, index) => {
    player.isHost = index === 0;
  });
};

const dealMustHaves = (room: Room, gameState: RoomGameState) => {
  const byPlayer: Record<string, string[]> = {};
  const surpriseByPlayer: Record<string, string | null> = {};
  room.players.forEach((player) => {
    if (player.name === gameState.penguin) {
      return;
    }
    byPlayer[player.name] = drawCardsFromQueue(gameState.mustHaveDeckQueue, MUST_HAVE_DECK, 4);
  });
  const eligible = room.players.filter((player) => player.name !== gameState.penguin);
  const surprisePlayer = eligible.length
    ? eligible[Math.floor(Math.random() * eligible.length)].name
    : null;
  const surpriseCard = drawCardsFromQueue(gameState.surpriseDeckQueue, SURPRISE_DECK, 1)[0] ?? null;
  eligible.forEach((player) => {
    surpriseByPlayer[player.name] = player.name === surprisePlayer ? surpriseCard : null;
  });
  gameState.mustHavesByPlayer = byPlayer;
  gameState.surpriseByPlayer = surpriseByPlayer;
  gameState.penguinSurprisePlayer = surprisePlayer;
};

const dealFinalRoundCards = (room: Room, gameState: RoomGameState) => {
  // For final round: each player gets exactly 3 must-haves and 1 twist.
  const byPlayer: Record<string, string[]> = {};
  const surpriseByPlayer: Record<string, string | null> = {};

  // Deal 3 must-haves to each final round player.
  gameState.finalRoundPlayers.forEach((playerName) => {
    byPlayer[playerName] = drawCardsFromQueue(gameState.mustHaveDeckQueue, MUST_HAVE_DECK, 3);
  });

  // Give each final round player a twist.
  gameState.finalRoundPlayers.forEach((playerName) => {
    surpriseByPlayer[playerName] =
      drawCardsFromQueue(gameState.surpriseDeckQueue, SURPRISE_DECK, 1)[0] ?? null;
  });

  gameState.mustHavesByPlayer = byPlayer;
  gameState.surpriseByPlayer = surpriseByPlayer;
  // In final round, all pitchers are "twist" players for bonus purposes
  gameState.penguinSurprisePlayer = null; // Not used in final round
};

const rotatePenguin = (gameState: RoomGameState) => {
  gameState.penguinQueueIndex = (gameState.penguinQueueIndex + 1) % gameState.penguinQueue.length;
  gameState.penguin = gameState.penguinQueue[gameState.penguinQueueIndex];
};

const checkGameEnd = (gameState: RoomGameState): boolean => {
  const maxScore = Math.max(...Object.values(gameState.playerScores));
  return maxScore >= 5;
};

const getFinalRoundPlayers = (gameState: RoomGameState): string[] => {
  const scores = Object.entries(gameState.playerScores).sort((a, b) => b[1] - a[1]);
  if (scores.length === 0) return [];

  const topScore = scores[0][1];
  const topPlayers = scores.filter(([, score]) => score === topScore).map(([player]) => player);

  // If only one player at top, find all tied for second
  if (topPlayers.length === 1 && scores.length > 1) {
    const secondScore = scores.find(([player]) => !topPlayers.includes(player))?.[1];
    if (secondScore !== undefined) {
      const secondPlacePlayers = scores
        .filter(([, score]) => score === secondScore)
        .map(([player]) => player);
      return [...topPlayers, ...secondPlacePlayers];
    }
  }

  return topPlayers;
};

const getGameWinner = (gameState: RoomGameState): string | null => {
  const maxScore = Math.max(...Object.values(gameState.playerScores));
  if (maxScore < 5) return null;

  // Return winner only if they have >= 5 and game is decided
  const topPlayers = Object.entries(gameState.playerScores)
    .filter(([, score]) => score === maxScore)
    .map(([player]) => player);

  return topPlayers.length === 1 ? topPlayers[0] : null;
};

const startRevealPhase = (room: Room, gameState: RoomGameState) => {
  room.status = "reveal";
  gameState.phase = "reveal";
  if (gameState.pitchTimerTimeoutId) {
    clearTimeout(gameState.pitchTimerTimeoutId);
    gameState.pitchTimerTimeoutId = null;
  }
  if (gameState.askSelectionTimeoutId) {
    clearTimeout(gameState.askSelectionTimeoutId);
    gameState.askSelectionTimeoutId = null;
  }
  gameState.pitchEndsAt = null;
  gameState.askSelectionExpiresAt = null;
  gameState.playersReady.clear();
  gameState.timerStarted = false;
};

const startDealTimer = (room: Room, gameState: RoomGameState) => {
  if (gameState.askSelectionTimeoutId) {
    clearTimeout(gameState.askSelectionTimeoutId);
  }
  gameState.askSelectionExpiresAt = Date.now() + gameState.penguinAskTimerSeconds * 1000;
  gameState.askSelectionTimeoutId = setTimeout(() => {
    if (!gameState.selectedAsk) {
      gameState.selectedAsk = gameState.askOptions[0] ?? null;
    }
    startPitchPhase(room, gameState);
  }, gameState.penguinAskTimerSeconds * 1000);
  gameState.timerStarted = true;
};

const startPitchTimer = (room: Room, gameState: RoomGameState) => {
  if (gameState.pitchTimerTimeoutId) {
    clearTimeout(gameState.pitchTimerTimeoutId);
  }
  gameState.pitchEndsAt = Date.now() + gameState.pitchTimerSeconds * 1000;
  gameState.pitchTimerTimeoutId = setTimeout(() => {
    finalizePitchPhase(room, gameState);
  }, gameState.pitchTimerSeconds * 1000);
  gameState.timerStarted = true;
};

const startFinalRoundPitchTimer = (room: Room, gameState: RoomGameState) => {
  if (gameState.pitchTimerTimeoutId) {
    clearTimeout(gameState.pitchTimerTimeoutId);
  }
  gameState.pitchEndsAt = Date.now() + gameState.pitchTimerSeconds * 1000;
  gameState.pitchTimerTimeoutId = setTimeout(() => {
    finalizeFinalRoundPitches(room, gameState);
  }, gameState.pitchTimerSeconds * 1000);
  gameState.timerStarted = true;
};

const finalizeFinalRoundPitches = (room: Room, gameState: RoomGameState) => {
  if (room.status !== "final-round") {
    return;
  }
  const rawList = roomPitches.get(room.code) ?? [];
  const finalists = new Set(gameState.finalRoundPlayers);

  // Lock all finalists even if they never submitted.
  gameState.finalRoundPlayers.forEach((playerName) => {
    gameState.pitchStatusByPlayer[playerName] = "ready";
  });

  // Keep only valid participating finalist submissions.
  const eligiblePitches = rawList
    .filter((pitch) => finalists.has(pitch.player))
    .filter((pitch) => isFinalRoundEligiblePitch(pitch));

  roomPitches.set(room.code, eligiblePitches);

  // 0 eligible pitches => automatic truce/end game.
  // 1 eligible pitch => auto-resolve final round without ranking.
  if (eligiblePitches.length <= 1) {
    completeFinalRoundWithoutRanking(room, gameState, eligiblePitches);
    return;
  }

  // Ranking phase remains in final-round when 2+ eligible pitches exist.
  if (gameState.pitchTimerTimeoutId) {
    clearTimeout(gameState.pitchTimerTimeoutId);
    gameState.pitchTimerTimeoutId = null;
  }
  gameState.pitchEndsAt = null;
  gameState.timerStarted = false;
  gameState.truceActivated = false;
};

const finalizePitchPhase = (room: Room, gameState: RoomGameState) => {
  if (room.status !== "pitch") {
    return;
  }
  const list = roomPitches.get(room.code) ?? [];

  room.players.forEach((player) => {
    if (player.name === gameState.penguin) {
      return;
    }
    const status = gameState.pitchStatusByPlayer[player.name];
    if (status !== "ready") {
      gameState.pitchStatusByPlayer[player.name] = "ready";
    }
    const pitchId = `${room.code}-${player.name}`;
    const existingIndex = list.findIndex((item) => item.id === pitchId);
    if (existingIndex === -1) {
      list.push({
        id: pitchId,
        player: player.name,
        title: "Untitled Pitch",
        summary: "",
        voice: "Neon Announcer",
        usedMustHaves: [],
        aiGenerated: false,
        isValid: false,
        isDisqualified: false,
      });
      return;
    }
    const existing = list[existingIndex];
    const isValid = (existing.usedMustHaves ?? []).length > 0;
    list[existingIndex] = {
      ...existing,
      isValid,
      isDisqualified: existing.isDisqualified ?? false,
    };
  });

  roomPitches.set(room.code, list);
  if (areAllPitchersEmpty(room, gameState, list)) {
    roomPitches.delete(room.code);
    gameState.lastRoundWinner = null;
    gameState.roundNoParticipation = true;
    room.status = "results";
    gameState.phase = "results";
    return;
  }
  gameState.roundNoParticipation = false;
  startRevealPhase(room, gameState);
};

const startPitchPhase = (room: Room, gameState: RoomGameState) => {
  room.status = "pitch";
  gameState.phase = "pitch";
  gameState.playersReady.clear();
  gameState.timerStarted = false;
  gameState.askSelectionExpiresAt = null;
  if (gameState.askSelectionTimeoutId) {
    clearTimeout(gameState.askSelectionTimeoutId);
    gameState.askSelectionTimeoutId = null;
  }
  if (gameState.pitchTimerTimeoutId) {
    clearTimeout(gameState.pitchTimerTimeoutId);
    gameState.pitchTimerTimeoutId = null;
  }
  gameState.pitchEndsAt = null;
  room.players.forEach((player) => {
    if (player.name !== gameState.penguin) {
      gameState.pitchStatusByPlayer[player.name] = "drafting";
    }
  });
};

const startFinalRound = (room: Room, gameState: RoomGameState) => {
  room.status = "final-round";
  gameState.phase = "final-round";
  gameState.playersReady.clear();
  gameState.timerStarted = false;
  gameState.askSelectionExpiresAt = null;
  if (gameState.askSelectionTimeoutId) {
    clearTimeout(gameState.askSelectionTimeoutId);
    gameState.askSelectionTimeoutId = null;
  }

  // All players who are NOT in final round become judges
  // Final round players will pitch
  gameState.finalRoundRankings = {};
  gameState.judgeViewedPitches = {};

  // Clear previous round data
  // Pick ONE ask from the non-repeating queue (no penguin selection in final round).
  const randomAsk = drawCardsFromQueue(gameState.askDeckQueue, ASK_DECK, 1)[0] ?? "Create something amazing!";
  gameState.askOptions = [randomAsk]; // Only one option
  gameState.selectedAsk = randomAsk; // Auto-selected
  gameState.truceActivated = false;
  gameState.challengeReveal = null;
  gameState.viewedPitchIds.clear();
  gameState.challenges = [];
  roomPitches.delete(room.code);

  // Reset pitch statuses - only final round players need to pitch
  room.players.forEach((player) => {
    if (gameState.finalRoundPlayers.includes(player.name)) {
      gameState.pitchStatusByPlayer[player.name] = "drafting";
    } else {
      gameState.pitchStatusByPlayer[player.name] = "ready"; // Judges don't pitch
      if (!gameState.judgeViewedPitches[player.name]) {
        gameState.judgeViewedPitches[player.name] = new Set(); // Initialize judge's viewed pitches
      }
    }
  });

  // Deal cards to final round players (3 must-haves + 1 twist each)
  dealFinalRoundCards(room, gameState);

  // Start pitch timer
  if (gameState.pitchTimerTimeoutId) {
    clearTimeout(gameState.pitchTimerTimeoutId);
    gameState.pitchTimerTimeoutId = null;
  }
  gameState.pitchEndsAt = null;
};

const startDealPhase = (room: Room, gameState: RoomGameState) => {
  // Randomize penguin on first round
  if (gameState.round === 0) {
    const randomIndex = Math.floor(Math.random() * gameState.penguinQueue.length);
    gameState.penguinQueueIndex = randomIndex;
    gameState.penguin = gameState.penguinQueue[randomIndex];
  }

  room.status = "deal";
  gameState.phase = "deal";
  gameState.playersReady.clear();
  gameState.timerStarted = false;
  if (gameState.pitchTimerTimeoutId) {
    clearTimeout(gameState.pitchTimerTimeoutId);
    gameState.pitchTimerTimeoutId = null;
  }
  gameState.pitchEndsAt = null;
  gameState.askOptions = drawCardsFromQueue(gameState.askDeckQueue, ASK_DECK, 3);
  gameState.selectedAsk = null;
  gameState.challengeReveal = null;
  gameState.viewedPitchIds.clear();
  gameState.roundNoParticipation = false;
  dealMustHaves(room, gameState);
  room.players.forEach((player) => {
    gameState.pitchStatusByPlayer[player.name] = "pending";
  });

  if (gameState.askSelectionTimeoutId) {
    clearTimeout(gameState.askSelectionTimeoutId);
    gameState.askSelectionTimeoutId = null;
  }
  gameState.askSelectionExpiresAt = null;
};

const findPlayer = (name: string) => gameState.players.find((player) => player.name === name);

const applyRoundResult = (pitchId: string, voter: string) => {
  const pitch = gameState.pitches.find((item) => item.id === pitchId);
  if (!pitch) {
    return {
      ok: false,
      message: "Pitch not found",
    };
  }

  if (gameState.lastResult?.round === gameState.round) {
    const previousWinner = findPlayer(gameState.lastResult.winner);
    if (previousWinner) {
      previousWinner.points = Math.max(
        0,
        previousWinner.points - gameState.lastResult.pointsAwarded,
      );
    }
  }

  const winner = pitch.player;
  const penguinSurpriseWinner = winner === gameState.penguinSurprisePlayer;
  const pointsAwarded = (penguinSurpriseWinner ? 2 : 1) + getMustHaveBonus(pitch.usedMustHaves);
  const winnerPlayer = findPlayer(winner);
  if (winnerPlayer) {
    winnerPlayer.points += pointsAwarded;
  }

  const result: RoundResult = {
    round: gameState.round,
    winner,
    pitchId,
    penguinSurpriseWinner,
    pointsAwarded,
    createdAt: new Date().toISOString(),
  };

  gameState.lastResult = result;
  const existingVote = gameState.votes.find((vote) => vote.voter === voter);
  if (existingVote) {
    existingVote.pitchId = pitchId;
    existingVote.createdAt = new Date().toISOString();
  } else {
    gameState.votes.push({ pitchId, voter, createdAt: new Date().toISOString() });
  }

  return {
    ok: true,
    result,
  };
};

server.get("/api/health", async () => {
  return {
    ok: true,
    service: "pitch-penguin-api",
    time: new Date().toISOString(),
  };
});

server.get("/api/room/:code", async (request) => {
  const { code } = request.params as { code: string };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }
  room.lastActiveAt = Date.now();
  const snapshot = buildRoomSnapshot(room);
  return {
    ok: snapshot.ok,
    code: snapshot.code,
    status: snapshot.status,
    players: snapshot.players,
    capacity: snapshot.capacity,
    penguin: snapshot.penguin,
  };
});

server.post("/api/rooms", async (request) => {
  const body = request.body as { hostName?: string };
  const room = createRoom(body?.hostName);
  return {
    ok: true,
    room,
  };
});

server.post("/api/rooms/join", async (request) => {
  const body = request.body as { code?: string; playerName?: string };
  const code = body.code?.toUpperCase().trim() ?? "";
  const playerName = body.playerName?.trim() ?? "";
  if (!code) {
    return {
      ok: false,
      message: "Room code is required",
    };
  }
  if (!playerName) {
    return {
      ok: false,
      message: "Player name is required",
    };
  }

  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }

  if (room.status !== "lobby") {
    return {
      ok: false,
      message: "Game already started",
    };
  }

  if (room.players.length >= ROOM_CAPACITY) {
    return {
      ok: false,
      message: "Room is full",
    };
  }

  const normalized = normalizeName(playerName);
  const existingPlayer = room.players.find((player) => normalizeName(player.name) === normalized);
  if (existingPlayer) {
    return {
      ok: false,
      message: "Name already taken",
    };
  }

  const isHost = room.players.length === 0;
  const availableMascots = getAvailableMascots(room);
  if (availableMascots.length === 0) {
    return {
      ok: false,
      message: "No mascots available",
    };
  }
  const mascot = availableMascots[Math.floor(Math.random() * availableMascots.length)];
  room.players.push({
    name: playerName,
    isHost,
    mascot,
    joinedAt: new Date().toISOString(),
  });
  room.lastActiveAt = Date.now();

  const gameState = getRoomGameState(room);
  gameState.pitchStatusByPlayer[playerName] = "pending";
  gameState.playerScores[playerName] = 0;

  // If this is first player, set them as initial penguin (will be randomized on game start)
  if (isHost) {
    gameState.penguin = playerName;
    gameState.penguinQueue = room.players.map((p) => p.name);
  } else {
    // Update penguin queue for subsequent players
    gameState.penguinQueue = room.players.map((p) => p.name);
  }

  emitRoomSnapshot(code);
  return {
    ok: true,
    room,
  };
});

server.post("/api/rooms/leave", async (request) => {
  const body = request.body as { code?: string; playerName?: string };
  const code = body.code?.toUpperCase().trim() ?? "";
  const playerName = body.playerName?.trim() ?? "";
  if (!code || !playerName) {
    return {
      ok: false,
      message: "Room code and player name are required",
    };
  }

  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }

  const normalized = normalizeName(playerName);
  const index = room.players.findIndex((player) => normalizeName(player.name) === normalized);
  if (index === -1) {
    return {
      ok: true,
      message: "Player already left",
      room,
    };
  }

  const removedPlayer = room.players[index];
  const wasHost = removedPlayer.isHost;
  room.players.splice(index, 1);
  if (wasHost) {
    assignNextHost(room);
  }
  room.lastActiveAt = Date.now();

  const gameState = getRoomGameState(room);
  gameState.playersReady.delete(removedPlayer.name);
  delete gameState.pitchStatusByPlayer[playerName];
  delete gameState.mustHavesByPlayer[playerName];
  delete gameState.surpriseByPlayer[playerName];
  if (wasHost) {
    const nextHost = room.players.find((player) => player.isHost)?.name;
    if (nextHost) {
      gameState.penguin = nextHost;
    }
  }

  if (
    room.players.length > 0 &&
    !gameState.timerStarted &&
    gameState.playersReady.size >= room.players.length
  ) {
    if (gameState.phase === "deal") {
      startDealTimer(room, gameState);
    } else if (gameState.phase === "pitch") {
      startPitchTimer(room, gameState);
    } else if (gameState.phase === "final-round") {
      startFinalRoundPitchTimer(room, gameState);
    }
  }

  emitRoomSnapshot(code);
  return {
    ok: true,
    room,
  };
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.players.length > 0) {
      continue;
    }
    if (now - room.lastActiveAt >= EMPTY_ROOM_TTL_MS) {
      rooms.delete(code);
      roomGameStates.delete(code);
    }
  }
}, 60 * 1000);

server.get("/api/room/:code/game", async (request) => {
  const { code } = request.params as { code: string };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }
  return buildRoomSnapshot(room);
});

server.post("/api/room/:code/player-ready", async (request) => {
  const { code } = request.params as { code: string };
  const body = request.body as { playerName?: string };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }

  const playerName = body.playerName?.trim() ?? "";
  if (!playerName) {
    return {
      ok: false,
      message: "Player name required",
    };
  }

  const player = room.players.find(
    (entry) => normalizeName(entry.name) === normalizeName(playerName),
  );
  if (!player) {
    return {
      ok: false,
      message: "Player not found",
    };
  }

  const gameState = getRoomGameState(room);
  const phase = gameState.phase;
  if (phase !== "deal" && phase !== "pitch" && phase !== "final-round") {
    return {
      ok: true,
      phase,
      timerStarted: gameState.timerStarted,
      playersReadyCount: gameState.playersReady.size,
      playersTotal: room.players.length,
    };
  }

  gameState.playersReady.add(player.name);
  if (!gameState.timerStarted && gameState.playersReady.size >= room.players.length) {
    if (phase === "deal") {
      startDealTimer(room, gameState);
    } else if (phase === "pitch") {
      startPitchTimer(room, gameState);
    } else if (phase === "final-round") {
      startFinalRoundPitchTimer(room, gameState);
    }
  }

  emitRoomSnapshot(code);
  return {
    ok: true,
    phase,
    timerStarted: gameState.timerStarted,
    playersReadyCount: gameState.playersReady.size,
    playersTotal: room.players.length,
    askSelectionExpiresAt: gameState.askSelectionExpiresAt,
    pitchEndsAt: gameState.pitchEndsAt,
  };
});

server.post("/api/room/:code/advance", async (request) => {
  const { code } = request.params as { code: string };
  const body = request.body as { playerName?: string };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }
  const gameState = getRoomGameState(room);
  if (body.playerName) {
    const host = room.players.find((player) => player.isHost)?.name;
    if (host && host.toLowerCase() !== body.playerName.toLowerCase()) {
      return {
        ok: false,
        message: "Only the host can advance the phase",
      };
    }
  }
  const nextPhase = getNextPhase(room.status);
  if (nextPhase === "deal") {
    startDealPhase(room, gameState);
  } else if (nextPhase === "pitch") {
    if (!gameState.selectedAsk) {
      gameState.selectedAsk = gameState.askOptions[0] ?? null;
    }
    startPitchPhase(room, gameState);
  } else if (nextPhase === "reveal") {
    startRevealPhase(room, gameState);
  } else {
    room.status = nextPhase;
    gameState.phase = nextPhase;
  }
  emitRoomSnapshot(code);
  return {
    ok: true,
    phase: room.status,
  };
});

server.post("/api/room/:code/select-ask", async (request) => {
  const { code } = request.params as { code: string };
  const body = request.body as { ask?: string };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }
  const gameState = getRoomGameState(room);
  const ask = body.ask?.trim();
  if (!ask || !gameState.askOptions.includes(ask)) {
    return {
      ok: false,
      message: "Ask not available",
    };
  }
  gameState.selectedAsk = ask;
  if (gameState.askSelectionTimeoutId) {
    clearTimeout(gameState.askSelectionTimeoutId);
    gameState.askSelectionTimeoutId = null;
  }
  gameState.askSelectionExpiresAt = null;
  startPitchPhase(room, gameState);
  emitRoomSnapshot(code);
  return {
    ok: true,
    selectedAsk: ask,
  };
});

server.post("/api/room/:code/player-status", async (request) => {
  const { code } = request.params as { code: string };
  const body = request.body as { playerName?: string; status?: PlayerPitchStatus };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }
  const playerName = body.playerName?.trim() ?? "";
  const status = body.status ?? "pending";
  if (!playerName) {
    return {
      ok: false,
      message: "Player name required",
    };
  }
  const gameState = getRoomGameState(room);
  gameState.pitchStatusByPlayer[playerName] = status;
  emitRoomSnapshot(code);
  return {
    ok: true,
    pitchStatusByPlayer: gameState.pitchStatusByPlayer,
  };
});

server.post("/api/room/:code/toggle-voice", async (request) => {
  const { code } = request.params as { code: string };
  const body = request.body as { enabled?: boolean };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }
  const gameState = getRoomGameState(room);
  gameState.robotVoiceEnabled = Boolean(body.enabled);
  emitRoomSnapshot(code);
  return {
    ok: true,
    enabled: gameState.robotVoiceEnabled,
  };
});

server.post("/api/tts", async (request, reply) => {
  const body = request.body as {
    text?: string;
    voiceProfile?: string;
    voiceId?: string;
  };
  const text = body.text?.trim() ?? "";
  if (!text) {
    return {
      ok: false,
      message: "text is required",
    };
  }

  const apiKey = process.env.DEAPI_KEY?.trim();
  if (!apiKey) {
    reply.code(500);
    return {
      ok: false,
      message: "DEAPI_KEY is not configured",
    };
  }

  const voice = resolveDeapiVoice(body.voiceId, body.voiceProfile);

  try {
    const result = await generateDeapiTts(apiKey, text, voice);
    reply.header("Content-Type", result.contentType);
    reply.header("Cache-Control", "no-store");
    return result.audio;
  } catch (err) {
    request.log.error({ err }, "deAPI TTS failed");
    reply.code(502);
    return {
      ok: false,
      message: "Failed to generate TTS audio",
    };
  }
});

server.post("/api/room/:code/mascot", async (request) => {
  const { code } = request.params as { code: string };
  const body = request.body as { playerName?: string; mascot?: string };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }
  const playerName = body.playerName?.trim() ?? "";
  if (!playerName) {
    return {
      ok: false,
      message: "Player name required",
    };
  }
  const player = room.players.find(
    (entry) => entry.name.toLowerCase() === playerName.toLowerCase(),
  );
  if (!player) {
    return {
      ok: false,
      message: "Player not found",
    };
  }
  const requestedMascot = body.mascot?.trim() ?? "";
  if (!requestedMascot || !MASCOT_OPTIONS.includes(requestedMascot)) {
    return {
      ok: false,
      message: "Invalid mascot",
    };
  }
  const availableMascots = getAvailableMascots(room, playerName);
  const isCurrent = player.mascot === requestedMascot;
  if (!isCurrent && !availableMascots.includes(requestedMascot)) {
    return {
      ok: false,
      message: "Mascot already taken",
    };
  }
  player.mascot = requestedMascot;
  emitRoomSnapshot(code);
  return {
    ok: true,
    mascot: player.mascot,
  };
});

server.post("/api/room/:code/pitch", async (request) => {
  const { code } = request.params as { code: string };
  const body = request.body as {
    playerName?: string;
    title?: string;
    summary?: string;
    voice?: string;
    usedMustHaves?: string[];
    status?: PlayerPitchStatus;
    aiGenerated?: boolean;
    sketchData?: string | null;
  };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }
  const playerName = body.playerName?.trim() ?? "";
  if (!playerName) {
    return {
      ok: false,
      message: "Player name required",
    };
  }
  const gameState = getRoomGameState(room);
  const existingStatus = gameState.pitchStatusByPlayer[playerName];
  if (existingStatus === "ready" && body.status !== "ready") {
    return {
      ok: false,
      message: "Pitch locked",
    };
  }
  const trimmedTitle = body.title?.trim() ?? "";
  const trimmedSummary = body.summary?.trim() ?? "";
  const usedMustHavesCount = (body.usedMustHaves ?? []).length;

  // Final round requires at least 2 must-haves, normal rounds require at least 1
  const isFinalRound = gameState.phase === "final-round";
  const minMustHaves = isFinalRound ? 2 : 1;
  const hasMustHaves = usedMustHavesCount >= minMustHaves;

  const isUntitledNoPitch = (!trimmedSummary && !trimmedTitle) || (!trimmedSummary && isUntitledPitchTitle(trimmedTitle));
  const isEmpty = !trimmedTitle || !trimmedSummary || isUntitledNoPitch;
  const isValid = hasMustHaves && !isEmpty;
  const isDisqualified = !isValid;
  const pitch: Pitch = {
    id: `${code}-${playerName}`,
    player: playerName,
    title: trimmedTitle || "Untitled Pitch",
    summary: trimmedSummary || "",
    voice: body.voice ?? "Neon Announcer",
    usedMustHaves: body.usedMustHaves ?? [],
    aiGenerated: body.aiGenerated ?? false,
    sketchData: body.sketchData ?? null,
    isValid,
    isDisqualified,
  };
  const list = roomPitches.get(code) ?? [];
  const existingIndex = list.findIndex((item) => item.id === pitch.id);
  if (existingIndex >= 0) {
    list[existingIndex] = pitch;
  } else {
    list.push(pitch);
  }
  roomPitches.set(code, list);
  if (body.status) {
    gameState.pitchStatusByPlayer[playerName] = body.status;
  }

  if (room.status === "pitch") {
    const allReady = room.players
      .filter((player) => player.name !== gameState.penguin)
      .every((player) => gameState.pitchStatusByPlayer[player.name] === "ready");
    if (allReady) {
      if (areAllPitchersEmpty(room, gameState, list)) {
        roomPitches.delete(code);
        gameState.lastRoundWinner = null;
        gameState.roundNoParticipation = true;
        room.status = "results";
        gameState.phase = "results";
      } else {
        gameState.roundNoParticipation = false;
        startRevealPhase(room, gameState);
      }
    }
  }

  if (room.status === "final-round") {
    const allFinalistsReady = gameState.finalRoundPlayers.every(
      (name) => gameState.pitchStatusByPlayer[name] === "ready",
    );
    if (allFinalistsReady) {
      finalizeFinalRoundPitches(room, gameState);
    }
  }

  emitRoomSnapshot(code);
  return {
    ok: true,
    pitch,
  };
});

server.post("/api/room/:code/generate-pitch", async (request) => {
  const { code } = request.params as { code: string };
  const body = request.body as {
    ask: string;
    mustHaves: string[];
    surprise?: string | null;
    playerName: string;
  };

  const { ask, mustHaves, surprise, playerName } = body;

  if (!ask || !mustHaves || mustHaves.length === 0) {
    return {
      ok: false,
      message: "PROBLEM and at least one CONSTRAINT required",
    };
  }

  if (!playerName) {
    return {
      ok: false,
      message: "Player name required",
    };
  }

  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }

  const gameState = roomGameStates.get(code);
  if (!gameState) {
    return {
      ok: false,
      message: "Game not started",
    };
  }

  // Check if player has enough balance
  const playerScore = gameState.playerScores[playerName] ?? 0;
  const AI_GENERATION_COST = 0.5; // $50 = 0.5 points

  if (playerScore < AI_GENERATION_COST) {
    return {
      ok: false,
      message: "Insufficient balance. You need at least $50 to use AI generation.",
    };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      message: "API not configured",
    };
  }

  try {
    const mustHavesText = mustHaves.join(", ");
    const surpriseText = surprise ? `Also incorporate this element: "${surprise}".` : "";

    const prompt = `Create a short, punchy elevator pitch (2-3 sentences max) that:
1. Answers this problem/question: "${ask}"
2. Includes these required elements: ${mustHavesText}
${surpriseText}

Keep it exciting, founder-friendly, and ready to be read aloud. No fluff or disclaimers.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as { error?: { message?: string } };
      console.error("Groq API error:", errorData);
      return {
        ok: false,
        message: errorData.error?.message ?? "Failed to generate pitch",
      };
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const generatedText = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (!generatedText) {
      return {
        ok: false,
        message: "No pitch generated",
      };
    }

    // Deduct $50 cost for AI generation
    gameState.playerScores[playerName] =
      (gameState.playerScores[playerName] ?? 0) - AI_GENERATION_COST;

    emitRoomSnapshot(code);
    return {
      ok: true,
      pitch: generatedText,
    };
  } catch (err) {
    console.error("Error calling Groq API:", err);
    return {
      ok: false,
      message: "Failed to generate pitch",
    };
  }
});

server.get("/api/room/:code/pitches", async (request) => {
  const { code } = request.params as { code: string };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }
  const list = roomPitches.get(code) ?? [];
  const normalized = list.map((pitch) => {
    const title = pitch.title?.trim() ?? "";
    const summary = pitch.summary?.trim() ?? "";
    const untitledNoPitch = (!summary && !title) || (!summary && isUntitledPitchTitle(title));
    const missingMustHaves = (pitch.usedMustHaves?.length ?? 0) === 0;
    const missingContent = !title || !summary;
    const derivedDisqualified = missingMustHaves || missingContent || untitledNoPitch;
    const isDisqualified = pitch.isDisqualified ?? derivedDisqualified;
    return {
      ...pitch,
      isValid: pitch.isValid ?? !derivedDisqualified,
      isDisqualified,
    };
  });
  return {
    ok: true,
    pitches: normalized,
  };
});

server.post("/api/room/:code/pitch-viewed", async (request) => {
  const { code } = request.params as { code: string };
  const body = request.body as { pitchId?: string; viewer?: string };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }
  const pitchId = body.pitchId?.trim() ?? "";
  const viewer = body.viewer?.trim() ?? "";
  if (!pitchId) {
    return {
      ok: false,
      message: "pitchId required",
    };
  }
  const gameState = getRoomGameState(room);

  // In final round, track views per judge
  if (gameState.phase === "final-round" && viewer) {
    if (!gameState.judgeViewedPitches[viewer]) {
      gameState.judgeViewedPitches[viewer] = new Set();
    }
    gameState.judgeViewedPitches[viewer].add(pitchId);
    emitRoomSnapshot(code);
    return {
      ok: true,
      viewedPitchIds: Array.from(gameState.judgeViewedPitches[viewer]),
    };
  }

  // Normal round: only penguin can mark pitches viewed
  if (body.viewer && body.viewer.toLowerCase() !== gameState.penguin.toLowerCase()) {
    return {
      ok: false,
      message: "Only the penguin can mark pitches viewed",
    };
  }
  gameState.viewedPitchIds.add(pitchId);
  emitRoomSnapshot(code);
  return {
    ok: true,
    viewedPitchIds: Array.from(gameState.viewedPitchIds),
  };
});

server.post("/api/room/:code/judge", async (request) => {
  const { code } = request.params as { code: string };
  const body = request.body as {
    winnerPitchId?: string;
    challengeVerdicts?: Record<string, { verdict: "upheld" | "rejected"; wasCorrect: boolean }>;
  };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }

  const gameState = getRoomGameState(room);
  const pitches = roomPitches.get(code) ?? [];
  const winningPitch = pitches.find((p) => p.id === body.winnerPitchId);

  if (!winningPitch) {
    return {
      ok: false,
      message: "Pitch not found",
    };
  }
  if (winningPitch.isValid === false || winningPitch.isDisqualified) {
    return {
      ok: false,
      message: "Pitch is invalid or disqualified",
    };
  }

  // Process challenges
  if (body.challengeVerdicts) {
    for (const [challengeId, { verdict, wasCorrect }] of Object.entries(body.challengeVerdicts)) {
      const challenge = gameState.challenges.find((c) => c.pitchId === challengeId);
      if (!challenge) continue;

      challenge.verdict = verdict;
      challenge.wasCorrect = wasCorrect;

      if (verdict === "upheld" && wasCorrect) {
        // Correct challenge: pitcher loses 1 point and is disqualified
        const pitcher = winningPitch.player;
        gameState.playerScores[pitcher] = Math.max(0, (gameState.playerScores[pitcher] ?? 0) - 1);
        gameState.disqualifiedPlayers.add(pitcher);
      } else if (verdict === "rejected" && !wasCorrect) {
        // Wrong challenge: accuser is disqualified
        gameState.disqualifiedPlayers.add(challenge.accuser);
      }
    }
  }

  // If winner wasn't disqualified, award points
  if (!gameState.disqualifiedPlayers.has(winningPitch.player)) {
    const isSurpriseWinner = winningPitch.player === gameState.penguinSurprisePlayer;
    const pointsAward = (isSurpriseWinner ? 2 : 1) + getMustHaveBonus(winningPitch.usedMustHaves);
    gameState.playerScores[winningPitch.player] =
      (gameState.playerScores[winningPitch.player] ?? 0) + pointsAward;
    gameState.lastRoundWinner = {
      player: winningPitch.player,
      pitchId: winningPitch.id,
      pitchTitle: winningPitch.title,
      sketchData: winningPitch.sketchData ?? null,
      pointsAwarded: pointsAward,
      penguinSurpriseWinner: isSurpriseWinner,
      createdAt: new Date().toISOString(),
    };
  }
  gameState.roundNoParticipation = false;

  // Check if game is over
  if (checkGameEnd(gameState)) {
    // Someone reached $500 - trigger final round with top players
    const finalRoundPlayers = getFinalRoundPlayers(gameState);
    gameState.finalRoundPlayers = finalRoundPlayers;

    // Don't set gameWinner yet - will be determined in final round
  }

  room.status = "results";
  gameState.phase = "results";

  emitRoomSnapshot(code);
  return {
    ok: true,
    playerScores: gameState.playerScores,
    disqualified: Array.from(gameState.disqualifiedPlayers),
    gameWinner: gameState.gameWinner,
    gameWinners: gameState.gameWinners,
    finalRoundNeeded: gameState.finalRoundPlayers.length > 0,
  };
});

server.post("/api/room/:code/challenge", async (request) => {
  const { code } = request.params as { code: string };
  const body = request.body as {
    accuser?: string;
    pitchId?: string;
    usedAI?: boolean;
  };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }

  const gameState = getRoomGameState(room);
  const list = roomPitches.get(code) ?? [];
  const targetPitch = list.find((pitch) => pitch.id === body.pitchId);
  if (!targetPitch) {
    return {
      ok: false,
      message: "Pitch not found",
    };
  }
  const wasCorrect = Boolean(targetPitch.aiGenerated);
  const challenge: Challenge = {
    accuser: body.accuser ?? "Anonymous",
    pitchId: body.pitchId ?? "",
    verdict: wasCorrect ? "upheld" : "rejected",
    wasCorrect,
    createdAt: new Date().toISOString(),
  };

  if (wasCorrect) {
    const pitcher = targetPitch.player;
    gameState.playerScores[pitcher] = (gameState.playerScores[pitcher] ?? 0) - 1;
    gameState.disqualifiedPlayers.add(pitcher);
    targetPitch.isDisqualified = true;
    targetPitch.isValid = false;
  } else if (challenge.accuser) {
    gameState.disqualifiedPlayers.add(challenge.accuser);
    const accuserPitch = list.find((pitch) => pitch.player === challenge.accuser);
    if (accuserPitch) {
      accuserPitch.isDisqualified = true;
      accuserPitch.isValid = false;
    }
  }

  roomPitches.set(code, list);
  gameState.challengeReveal = {
    accuser: challenge.accuser,
    pitchId: challenge.pitchId,
    wasCorrect,
    disqualifiedPlayer: wasCorrect ? targetPitch.player : challenge.accuser,
    createdAt: challenge.createdAt,
  };

  gameState.challenges.push(challenge);

  emitRoomSnapshot(code);
  return {
    ok: true,
    challenge,
    reveal: gameState.challengeReveal,
  };
});

server.post("/api/room/:code/advance-round", async (request) => {
  const { code } = request.params as { code: string };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }

  const gameState = getRoomGameState(room);

  // Check if game has ended
  if (gameState.gameWinner) {
    return {
      ok: false,
      message: "Game has ended.",
    };
  }

  // Check if we need a final round
  if (gameState.finalRoundPlayers.length > 0) {
    // Start final round
    startFinalRound(room, gameState);
    emitRoomSnapshot(code);
    return {
      ok: true,
      finalRoundStarted: true,
      finalRoundPlayers: gameState.finalRoundPlayers,
    };
  }

  // Advance to next round
  gameState.round += 1;
  gameState.penguinQueue = room.players.map((player) => player.name);
  const currentIndex = gameState.penguinQueue.indexOf(gameState.penguin);
  gameState.penguinQueueIndex = currentIndex >= 0 ? currentIndex : 0;
  rotatePenguin(gameState);
  gameState.challenges = [];
  gameState.challengeReveal = null;
  gameState.viewedPitchIds.clear();
  gameState.disqualifiedPlayers.clear();
  gameState.roundNoParticipation = false;
  roomPitches.delete(code);

  // Reset pitch statuses
  room.players.forEach((player) => {
    gameState.pitchStatusByPlayer[player.name] = "pending";
  });

  // Start next round with deal phase
  startDealPhase(room, gameState);

  emitRoomSnapshot(code);
  return {
    ok: true,
    round: gameState.round,
    penguin: gameState.penguin,
  };
});

server.post("/api/room/:code/tiebreaker-ranking", async (request) => {
  const { code } = request.params as { code: string };
  const body = request.body as {
    playerName: string;
    rankedPitchIds: string[];
  };

  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }

  const gameState = getRoomGameState(room);

  if (gameState.phase !== "final-round") {
    return {
      ok: false,
      message: "Not in final round phase",
    };
  }

  const { playerName, rankedPitchIds } = body;

  if (!playerName || !rankedPitchIds) {
    return {
      ok: false,
      message: "Player name and ranked pitch IDs required",
    };
  }

  // Only non-final-round players can rank
  if (gameState.finalRoundPlayers.includes(playerName)) {
    return {
      ok: false,
      message: "Final round contestants cannot vote",
    };
  }

  const pitches = roomPitches.get(code) ?? [];
  const eligiblePitchIds = new Set(
    pitches
      .filter((pitch) => gameState.finalRoundPlayers.includes(pitch.player))
      .filter((pitch) => isFinalRoundEligiblePitch(pitch))
      .map((pitch) => pitch.id),
  );
  if (eligiblePitchIds.size < 2) {
    return {
      ok: false,
      message: "Final round ranking is not required for fewer than two valid pitches",
    };
  }
  if (rankedPitchIds.length !== eligiblePitchIds.size) {
    return {
      ok: false,
      message: "Rankings must include every valid final-round pitch exactly once",
    };
  }
  const rankedUnique = new Set(rankedPitchIds);
  if (rankedUnique.size !== rankedPitchIds.length) {
    return {
      ok: false,
      message: "Rankings contain duplicate pitches",
    };
  }
  const hasUnknownPitch = rankedPitchIds.some((pitchId) => !eligiblePitchIds.has(pitchId));
  if (hasUnknownPitch) {
    return {
      ok: false,
      message: "Rankings include an invalid or discarded pitch",
    };
  }

  gameState.finalRoundRankings[playerName] = rankedPitchIds;

  // Check if all judges have submitted rankings
  const judges = room.players
    .filter((p) => !gameState.finalRoundPlayers.includes(p.name))
    .map((p) => p.name);

  const allJudgesVoted = judges.every((judge) => gameState.finalRoundRankings[judge]);

  if (allJudgesVoted) {
    // Tally rankings with new earnings-based scoring
    const earnings: Record<string, number> = {};
    const numPlayers = eligiblePitchIds.size;

    // Initialize earnings for final round players
    gameState.finalRoundPlayers.forEach((player: string) => {
      earnings[player] = 0;
    });

    // Calculate earnings based on rankings
    // 1st place = N×, 2nd = (N-1)×, 3rd = (N-2)×, etc.
    // Base earning is 1 point = $100
    Object.values(gameState.finalRoundRankings).forEach((ranking: string[]) => {
      ranking.forEach((pitchId: string, index: number) => {
        const pitch = pitches.find((p) => p.id === pitchId);
        if (pitch && earnings[pitch.player] !== undefined) {
          const multiplier = numPlayers - index; // 1st gets N, 2nd gets N-1, etc.
          earnings[pitch.player] += multiplier; // Each ballot contributes multiplier × 1 point
        }
      });
    });

    // Update player scores with final round earnings
    gameState.finalRoundPlayers.forEach((player: string) => {
      gameState.playerScores[player] = (gameState.playerScores[player] ?? 0) + earnings[player];
    });

    // Find winner(s) - highest total score wins
    const allScores = Object.entries(gameState.playerScores);
    const maxScore = Math.max(...allScores.map(([, score]) => score));
    const winners = allScores.filter(([, score]) => score === maxScore).map(([player]) => player);

    if (winners.length === 1) {
      // Single winner
      gameState.gameWinner = winners[0];
      gameState.gameWinners = [winners[0]];
    } else {
      // Still tied - declare co-winners
      gameState.gameWinners = winners;
      // Don't set single gameWinner - indicates co-win
    }

    // Move to results
    room.status = "results";
    gameState.phase = "results";
  }

  emitRoomSnapshot(code);
  return {
    ok: true,
    allJudgesVoted,
    gameWinner: gameState.gameWinner,
    gameWinners: gameState.gameWinners,
  };
});

server.post("/api/room/:code/restart", async (request) => {
  const { code } = request.params as { code: string };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }

  const newGameState = initializeGameState(room);
  roomGameStates.set(code, newGameState);
  roomPitches.delete(code);
  room.status = "lobby";

  emitRoomSnapshot(code);
  return {
    ok: true,
    message: "Game restarted",
    room: {
      code: room.code,
      status: room.status,
      penguin: newGameState.penguin,
    },
  };
});

server.get("/api/rules", async () => {
  return {
    ok: true,
    rules: RULES,
  };
});

server.get("/api/round", async () => {
  return {
    ok: true,
    round: gameState.round,
    penguin: gameState.penguin,
    ask: gameState.ask,
    mustHaves: gameState.mustHaves,
    pitchTimerSeconds: gameState.pitchTimerSeconds,
  };
});

server.get("/api/round/pitches", async () => {
  return {
    ok: true,
    pitches: gameState.pitches,
  };
});

server.get("/api/state", async () => {
  return {
    ok: true,
    room: {
      code: gameState.roomCode,
      phase: gameState.phase,
      penguin: gameState.penguin,
      penguinSurprisePlayer: gameState.penguinSurprisePlayer,
    },
    scores: gameState.players,
    lastResult: gameState.lastResult,
  };
});

server.get("/api/round/results", async () => {
  if (!gameState.lastResult) {
    return {
      ok: false,
      message: "No results yet",
    };
  }
  return {
    ok: true,
    ...gameState.lastResult,
  };
});

server.post("/api/round/submit-pitch", async (request) => {
  const body = request.body as Partial<Pitch>;
  const pitch: Pitch = {
    id: body.id ?? `pitch-${Date.now()}`,
    player: body.player ?? "Guest",
    title: body.title ?? "Untitled Pitch",
    summary: body.summary ?? "Pitch summary pending.",
    voice: body.voice ?? "Neon Announcer",
    usedMustHaves: body.usedMustHaves ?? [],
    aiGenerated: body.aiGenerated ?? false,
  };

  const existingIndex = gameState.pitches.findIndex((item) => item.id === pitch.id);
  if (existingIndex >= 0) {
    gameState.pitches[existingIndex] = pitch;
  } else {
    gameState.pitches.push(pitch);
  }

  return {
    ok: true,
    status: "received",
    pitch,
  };
});

server.post("/api/round/challenge", async (request) => {
  const body = request.body as Partial<Challenge>;
  const challenge: Challenge = {
    accuser: body.accuser ?? "Anonymous",
    pitchId: body.pitchId ?? "",
    verdict: body.verdict ?? "pending",
    createdAt: new Date().toISOString(),
  };

  gameState.challenges.push(challenge);

  return {
    ok: true,
    status: "challenge-recorded",
    challenge,
  };
});

server.post("/api/round/vote", async (request) => {
  const body = request.body as { pitchId?: string; voter?: string };
  const pitchId = body.pitchId ?? "";
  const voter = body.voter ?? gameState.penguin;
  if (!pitchId) {
    return {
      ok: false,
      message: "pitchId is required",
    };
  }

  return applyRoundResult(pitchId, voter);
});

const setupSocketServer = () => {
  io = new SocketIOServer(server.server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.on("connection", (socket: SocketIOSocket) => {
    socket.on("room:join", (payload: { code?: string; playerName?: string }) => {
      const code = payload.code?.toUpperCase().trim() ?? "";
      if (!code) {
        socket.emit("room:error", { message: "Room code is required" });
        return;
      }
      const room = rooms.get(code);
      if (!room) {
        socket.emit("room:error", { message: "Room not found", code });
        return;
      }
      socket.join(code);
      socket.data.roomCode = code;
      socket.data.playerName = payload.playerName?.trim() ?? "";
      socket.emit("room:state", buildRoomSnapshot(room));
    });

    socket.on("room:leave", (payload?: { code?: string }) => {
      const code = payload?.code?.toUpperCase().trim() ?? socket.data.roomCode;
      if (!code) {
        return;
      }
      socket.leave(code);
      if (socket.data.roomCode === code) {
        delete socket.data.roomCode;
        delete socket.data.playerName;
      }
    });
  });
};

const start = async () => {
  try {
    setupSocketServer();
    await server.listen({ port: 3001, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
