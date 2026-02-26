import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import Fastify from "fastify";
import { Server as SocketIOServer, type Socket as SocketIOSocket } from "socket.io";
import cardsData from "./cards.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

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
  lockedPlayers: string[] | null;
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
  truceActivated?: boolean;
  roundNoParticipation: boolean;
  playersReady: Set<string>;
  timerStarted: boolean;
};

const server = Fastify({
  logger: true,
  connectionTimeout: 60_000,
  requestTimeout: 60_000,
});
let io: SocketIOServer | null = null;
const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, "");

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((value) => normalizeOrigin(value))
  .filter(Boolean);

const isOriginAllowed = (origin?: string) => {
  if (!origin) {
    return true;
  }
  const normalizedOrigin = normalizeOrigin(origin);
  if (ALLOWED_ORIGINS.length === 0) {
    return true;
  }
  return ALLOWED_ORIGINS.includes(normalizedOrigin);
};

server.addHook("onRequest", (request, reply, done) => {
  const origin = request.headers.origin;
  if (typeof origin === "string" && isOriginAllowed(origin)) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  }

  if (request.method === "OPTIONS") {
    reply.code(204).send();
    return;
  }
  done();
});

const RULES = cardsData.rules;
const ASK_DECK = cardsData.askDeck;
const MUST_HAVE_DECK = cardsData.mustHaveDeck;
const SURPRISE_DECK = cardsData.surpriseDeck;
const MASCOT_OPTIONS = cardsData.mascotOptions;

const rooms = new Map<string, Room>();
const roomGameStates = new Map<string, RoomGameState>();
const roomPitches = new Map<string, Pitch[]>();

// TTS cache: store generated audio to avoid regenerating for multiple users
type CachedTts = {
  audio: Buffer;
  contentType: string;
  createdAt: number;
};
const ttsCacheMap = new Map<string, CachedTts>();
const TTS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Disk cache directory - persists across server spin-downs
const TTS_DISK_CACHE_DIR = path.join(__dirname, "../../.tts-cache");

const generateTtsCacheKey = (text: string, voice: string, model: string, lang: string): string => {
  return `${model}::${voice}::${lang}::${text.trim().toLowerCase()}`;
};

const getCacheFilename = (cacheKey: string): string => {
  // Create a safe filename from cache key
  const safe = cacheKey
    .replace(/::/g, "__")
    .replace(/[^a-z0-9_-]/gi, "+")
    .substring(0, 200); // Limit filename length
  return `${safe}.cache`;
};

const loadTtsFromDisk = async (cacheKey: string): Promise<CachedTts | null> => {
  try {
    const filename = getCacheFilename(cacheKey);
    const filepath = path.join(TTS_DISK_CACHE_DIR, filename);
    const metaPath = `${filepath}.meta.json`;

    // Check if files exist
    const [audioData, metaData] = await Promise.all([
      fs.readFile(filepath).catch(() => null),
      fs.readFile(metaPath, "utf-8").catch(() => null),
    ]);

    if (!audioData || !metaData) return null;

    const meta = JSON.parse(metaData);

    // Check if cache has expired
    if (Date.now() - meta.createdAt > TTS_CACHE_MAX_AGE_MS) {
      // Delete expired cache
      await Promise.all([fs.unlink(filepath).catch(() => {}), fs.unlink(metaPath).catch(() => {})]);
      return null;
    }

    return {
      audio: audioData,
      contentType: meta.contentType,
      createdAt: meta.createdAt,
    };
  } catch {
    return null;
  }
};

const saveTtsToDisk = async (cacheKey: string, cached: CachedTts): Promise<void> => {
  try {
    // Ensure cache directory exists
    await fs.mkdir(TTS_DISK_CACHE_DIR, { recursive: true });

    const filename = getCacheFilename(cacheKey);
    const filepath = path.join(TTS_DISK_CACHE_DIR, filename);
    const metaPath = `${filepath}.meta.json`;

    // Save audio and metadata
    await Promise.all([
      fs.writeFile(filepath, cached.audio),
      fs.writeFile(
        metaPath,
        JSON.stringify({
          contentType: cached.contentType,
          createdAt: cached.createdAt,
        }),
      ),
    ]);
  } catch (err) {
    server.log.error({ err }, "[TTS Cache] Failed to save to disk");
  }
};

const getCachedTts = (key: string): CachedTts | null => {
  const cached = ttsCacheMap.get(key);
  if (!cached) return null;

  // Check if cache has expired
  if (Date.now() - cached.createdAt > TTS_CACHE_MAX_AGE_MS) {
    ttsCacheMap.delete(key);
    return null;
  }

  return cached;
};

const cleanupExpiredDiskCache = async (): Promise<number> => {
  try {
    const files = await fs.readdir(TTS_DISK_CACHE_DIR).catch(() => []);
    let cleanedCount = 0;

    for (const file of files) {
      if (!file.endsWith(".meta.json")) continue;

      const metaPath = path.join(TTS_DISK_CACHE_DIR, file);
      const audioPath = metaPath.replace(".meta.json", "");

      try {
        const metaData = await fs.readFile(metaPath, "utf-8");
        const meta = JSON.parse(metaData);

        if (Date.now() - meta.createdAt > TTS_CACHE_MAX_AGE_MS) {
          await Promise.all([
            fs.unlink(audioPath).catch(() => {}),
            fs.unlink(metaPath).catch(() => {}),
          ]);
          cleanedCount += 1;
        }
      } catch {
        // Invalid or corrupted meta file - remove both
        await Promise.all([
          fs.unlink(audioPath).catch(() => {}),
          fs.unlink(metaPath).catch(() => {}),
        ]);
        cleanedCount += 1;
      }
    }

    return cleanedCount;
  } catch {
    return 0;
  }
};

const initializeTtsCache = async (): Promise<void> => {
  try {
    // Ensure cache directory exists
    await fs.mkdir(TTS_DISK_CACHE_DIR, { recursive: true });

    // Count existing cache files
    const files = await fs.readdir(TTS_DISK_CACHE_DIR).catch(() => []);
    const cacheFiles = files.filter((f) => f.endsWith(".cache"));

    server.log.info(
      `[TTS Cache] Initialized. Found ${cacheFiles.length} cached audio files on disk.`,
    );
  } catch (err) {
    server.log.error({ err }, "[TTS Cache] Failed to initialize cache directory");
  }
};

const ROOM_CAPACITY = 14;
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
const DEAPI_BASE_URL = process.env.DEAPI_BASE_URL ?? "https://api.deapi.ai";
const DEAPI_TTS_MODEL = process.env.DEAPI_TTS_MODEL ?? "Kokoro";
const DEAPI_QWEN3_TTS_MODEL =
  process.env.DEAPI_QWEN3_TTS_MODEL ?? "Qwen3_TTS_12Hz_1_7B_CustomVoice";
const DEAPI_TTS_FORMAT = process.env.DEAPI_TTS_FORMAT ?? "mp3";
const DEAPI_TTS_LANG = process.env.DEAPI_TTS_LANG ?? "en-us";
const DEAPI_QWEN3_TTS_LANG = process.env.DEAPI_QWEN3_TTS_LANG ?? "English";
const DEAPI_TTS_SAMPLE_RATE = Number(process.env.DEAPI_TTS_SAMPLE_RATE ?? "24000");
const DEAPI_POLL_INTERVAL_MS = 2000;
const DEAPI_MAX_POLL_ATTEMPTS = 30; // Reduced: serves Basic plan (fails faster) and Premium plan (completes within this window)
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
const DEAPI_QWEN3_VOICE_IDS: Record<string, string> = {
  aiden: "Aiden",
  dylan: "Dylan",
  eric: "Eric",
  ono_anna: "Ono_Anna",
  ryan: "Ryan",
  serena: "Serena",
  sohee: "Sohee",
  uncle_fu: "Uncle_Fu",
  vivian: "Vivian",
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
const isUntitledPitchTitle = (title?: string | null) =>
  normalizePitchTitle(title) === "untitled pitch";
const stripEmojiForTts = (text: string) =>
  text
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const resolveDeapiVoice = (
  voiceId?: string,
  voiceProfile?: string,
): { voice: string; model: string; lang: string } => {
  const direct = voiceId?.trim();
  if (direct) {
    const lowered = direct.toLowerCase();
    if (DEAPI_KOKORO_VOICE_IDS[lowered]) {
      return {
        voice: DEAPI_KOKORO_VOICE_IDS[lowered],
        model: DEAPI_TTS_MODEL,
        lang: DEAPI_TTS_LANG,
      };
    }
    if (DEAPI_QWEN3_VOICE_IDS[lowered]) {
      return {
        voice: DEAPI_QWEN3_VOICE_IDS[lowered],
        model: DEAPI_QWEN3_TTS_MODEL,
        lang: DEAPI_QWEN3_TTS_LANG,
      };
    }
    if (/^[a-z0-9_:-]+$/i.test(direct)) {
      return { voice: direct, model: DEAPI_TTS_MODEL, lang: DEAPI_TTS_LANG };
    }
  }
  const normalizedProfile = voiceProfile?.trim().toLowerCase() ?? "";
  if (normalizedProfile && DEAPI_VOICE_BY_PROFILE[normalizedProfile]) {
    const mapped = DEAPI_VOICE_BY_PROFILE[normalizedProfile];
    const lowered = mapped.toLowerCase();
    return {
      voice: DEAPI_KOKORO_VOICE_IDS[lowered] ?? mapped,
      model: DEAPI_TTS_MODEL,
      lang: DEAPI_TTS_LANG,
    };
  }
  const fallback = DEAPI_VOICE_BY_PROFILE["game show host"];
  return {
    voice: DEAPI_KOKORO_VOICE_IDS[fallback.toLowerCase()] ?? fallback,
    model: DEAPI_TTS_MODEL,
    lang: DEAPI_TTS_LANG,
  };
};

const generateDeapiTts = async (
  apiKey: string,
  text: string,
  voice: string,
  model: string,
  lang: string,
): Promise<{ audio: Buffer; contentType: string }> => {
  const sanitizedText = stripEmojiForTts(text);
  const textForTts = sanitizedText || "No pitch provided.";

  console.log(`[TTS] Calling deAPI with model=${model}, voice=${voice}, lang=${lang}`);

  const createResponse = await fetch(`${DEAPI_BASE_URL}/api/v1/client/txt2audio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      text: textForTts,
      model,
      lang,
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
    console.error(
      `[TTS] deAPI create request failed: ${createResponse.status} ${createResponse.statusText}`,
      errorPayload,
    );
    throw new Error(message);
  }

  const createPayload = await parseJsonSafely(createResponse);
  const requestId =
    getNestedString(createPayload, ["data", "request_id"]) ??
    getNestedString(createPayload, ["request_id"]);
  if (!requestId) {
    throw new Error("deAPI did not return request_id");
  }

  // Wait before polling to avoid rate limits
  await sleep(3000);

  let resultUrl: string | null = null;
  server.log.info(`[TTS] Polling for request ${requestId} with model=${model}, voice=${voice}`);
  let consecutiveRateLimits = 0;

  for (let attempt = 0; attempt < DEAPI_MAX_POLL_ATTEMPTS; attempt += 1) {
    const statusResponse = await fetch(
      `${DEAPI_BASE_URL}/api/v1/client/request-status/${requestId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );
    if (!statusResponse.ok) {
      const statusPayload = await parseJsonSafely(statusResponse);
      const statusMessage =
        getNestedString(statusPayload, ["message"]) ??
        getNestedString(statusPayload, ["error", "message"]) ??
        "Failed to read TTS status";

      // Handle rate limiting - give up immediately instead of retrying
      if (statusResponse.status === 429) {
        server.log.warn(
          `[TTS] Rate limited (429) at attempt ${attempt + 1}. Account may be on Basic plan with exhausted daily limit.`,
        );
        throw new Error(
          "429 Too Many Requests. Rate limit exceeded - try again after daily reset or upgrade API plan.",
        );
      }

      server.log.error(
        `[TTS] Status request failed: ${statusResponse.status} ${statusResponse.statusText} - ${statusMessage}`,
      );
      throw new Error(statusMessage);
    }

    consecutiveRateLimits = 0; // Reset rate limit counter on success

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
      server.log.info(`[TTS] Request ${requestId} completed after ${attempt + 1} attempts`);
      break;
    }
    if (status === "failed" || status === "error") {
      const failureMessage =
        getNestedString(statusPayload, ["data", "message"]) ??
        getNestedString(statusPayload, ["message"]) ??
        "deAPI TTS failed";
      server.log.error(`[TTS] Request ${requestId} failed: ${failureMessage}`);
      throw new Error(failureMessage);
    }
    if (attempt > 0 && attempt % 10 === 0) {
      server.log.info(
        `[TTS] Still polling for ${requestId}, attempt ${attempt + 1}/${DEAPI_MAX_POLL_ATTEMPTS}, status=${status}`,
      );
    }
    await sleep(DEAPI_POLL_INTERVAL_MS);
  }

  if (!resultUrl) {
    server.log.error(
      `[TTS] Timeout waiting for request ${requestId} after ${DEAPI_MAX_POLL_ATTEMPTS} attempts`,
    );
    throw new Error("Timed out waiting for deAPI TTS audio");
  }

  server.log.info(`[TTS] Downloading audio from ${resultUrl}`);
  const audioResponse = await fetch(resultUrl);
  if (!audioResponse.ok) {
    server.log.error(
      `[TTS] Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`,
    );
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
    lockedPlayers: null,
    penguin,
    penguinQueue,
    penguinQueueIndex,
    round: 0,
    penguinAskTimerSeconds: 30,
    pitchTimerSeconds: 90,
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
    roundNoParticipation: false,
    playersReady: new Set(),
    timerStarted: false,
  };
};

const isValidDealTimerSeconds = (value: number) =>
  Number.isInteger(value) && value >= 15 && value <= 45;
const isValidPitchTimerSeconds = (value: number) =>
  Number.isInteger(value) && value >= 60 && value <= 300 && value % 30 === 0;

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
  const randomAsk =
    drawCardsFromQueue(gameState.askDeckQueue, ASK_DECK, 1)[0] ?? "Create something amazing!";
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
  if (!gameState.lockedPlayers || gameState.lockedPlayers.length === 0) {
    gameState.lockedPlayers = room.players.map((player) => player.name);
  }

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
  const gameState = getRoomGameState(room);
  const normalized = normalizeName(playerName);
  const existingPlayer = room.players.find((player) => normalizeName(player.name) === normalized);
  if (existingPlayer) {
    return {
      ok: false,
      message: "Name already taken",
    };
  }

  const availableMascots = getAvailableMascots(room);
  if (availableMascots.length === 0) {
    return {
      ok: false,
      message: "No mascots available",
    };
  }

  if (room.status !== "lobby") {
    const historicalNames =
      gameState.lockedPlayers && gameState.lockedPlayers.length > 0
        ? gameState.lockedPlayers
        : Array.from(new Set([...Object.keys(gameState.playerScores), ...gameState.penguinQueue]));
    const returningPlayerName =
      historicalNames.find((name) => normalizeName(name) === normalized) ?? null;
    if (!returningPlayerName) {
      return {
        ok: false,
        message: "Game already started",
      };
    }

    const mascot = availableMascots[Math.floor(Math.random() * availableMascots.length)];
    room.players.push({
      name: returningPlayerName,
      isHost: false,
      mascot,
      joinedAt: new Date().toISOString(),
    });
    room.lastActiveAt = Date.now();

    if (!(returningPlayerName in gameState.pitchStatusByPlayer)) {
      if (room.status === "pitch") {
        gameState.pitchStatusByPlayer[returningPlayerName] =
          returningPlayerName === gameState.penguin ? "pending" : "drafting";
      } else if (room.status === "deal") {
        gameState.pitchStatusByPlayer[returningPlayerName] = "pending";
      } else if (room.status === "final-round") {
        gameState.pitchStatusByPlayer[returningPlayerName] = gameState.finalRoundPlayers.includes(
          returningPlayerName,
        )
          ? "drafting"
          : "ready";
      } else {
        gameState.pitchStatusByPlayer[returningPlayerName] = "ready";
      }
    }

    if (!(returningPlayerName in gameState.playerScores)) {
      gameState.playerScores[returningPlayerName] = 0;
    }
    if (!gameState.penguinQueue.some((name) => normalizeName(name) === normalized)) {
      gameState.penguinQueue.push(returningPlayerName);
    }
    if (
      room.status === "final-round" &&
      !gameState.finalRoundPlayers.includes(returningPlayerName) &&
      !gameState.judgeViewedPitches[returningPlayerName]
    ) {
      gameState.judgeViewedPitches[returningPlayerName] = new Set();
    }

    emitRoomSnapshot(code);
    return {
      ok: true,
      room,
    };
  }

  if (room.players.length >= ROOM_CAPACITY) {
    return {
      ok: false,
      message: "Room is full",
    };
  }

  const isHost = room.players.length === 0;
  const mascot = availableMascots[Math.floor(Math.random() * availableMascots.length)];
  room.players.push({
    name: playerName,
    isHost,
    mascot,
    joinedAt: new Date().toISOString(),
  });
  room.lastActiveAt = Date.now();

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
  const body = request.body as { ask?: string; playerName?: string };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }
  const gameState = getRoomGameState(room);
  const ask = body.ask?.trim();
  const playerName = body.playerName?.trim() ?? "";
  if (!ask || !playerName || normalizeName(playerName) !== normalizeName(gameState.penguin)) {
    return {
      ok: false,
      message: "Only the current penguin can select the PROBLEM",
    };
  }
  const isPresetAsk = gameState.askOptions.includes(ask);
  if (!isPresetAsk) {
    if (ask.length > 180) {
      return {
        ok: false,
        message: "Custom PROBLEM must be 180 characters or fewer",
      };
    }
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

server.post("/api/room/:code/timers", async (request) => {
  const { code } = request.params as { code: string };
  const body = request.body as {
    playerName?: string;
    dealTimerSeconds?: number;
    pitchTimerSeconds?: number;
  };
  const room = rooms.get(code);
  if (!room) {
    return {
      ok: false,
      message: "Room not found",
    };
  }

  const playerName = body.playerName?.trim() ?? "";
  const host = room.players.find((player) => player.isHost);
  if (!host || !playerName || normalizeName(host.name) !== normalizeName(playerName)) {
    return {
      ok: false,
      message: "Only the host can update timers",
    };
  }

  const dealTimerSeconds = Number(body.dealTimerSeconds);
  const pitchTimerSeconds = Number(body.pitchTimerSeconds);
  if (!isValidDealTimerSeconds(dealTimerSeconds)) {
    return {
      ok: false,
      message: "Deal timer must be between 15 and 45 seconds",
    };
  }
  if (!isValidPitchTimerSeconds(pitchTimerSeconds)) {
    return {
      ok: false,
      message: "Pitch timer must be 60 to 300 seconds in 30-second intervals",
    };
  }

  const gameState = getRoomGameState(room);
  gameState.penguinAskTimerSeconds = dealTimerSeconds;
  gameState.pitchTimerSeconds = pitchTimerSeconds;
  emitRoomSnapshot(code);

  return {
    ok: true,
    penguinAskTimerSeconds: gameState.penguinAskTimerSeconds,
    pitchTimerSeconds: gameState.pitchTimerSeconds,
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

server.post(
  "/api/tts",
  {
    config: {
      requestTimeout: 60_000,
    },
  },
  async (request, reply) => {
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
      server.log.error("[TTS] DEAPI_KEY is not configured in environment");
      reply.code(500);
      return {
        ok: false,
        message: "DEAPI_KEY is not configured",
      };
    }

    const { voice, model, lang } = resolveDeapiVoice(body.voiceId, body.voiceProfile);
    server.log.info(
      `[TTS] Request: text="${text.substring(0, 50)}...", voice=${voice}, model=${model}, lang=${lang}`,
    );

    // Check server-side TTS cache (memory first, then disk)
    const cacheKey = generateTtsCacheKey(text, voice, model, lang);

    // 1. Check in-memory cache
    let cachedAudio = getCachedTts(cacheKey);
    if (cachedAudio) {
      server.log.info(`[TTS] Cache HIT (memory): ${cacheKey.substring(0, 50)}...`);
      reply.header("Content-Type", cachedAudio.contentType);
      reply.header("Cache-Control", "no-store");
      reply.header("X-TTS-Source", "memory-cache");
      return cachedAudio.audio;
    }

    // 2. Check disk cache
    cachedAudio = await loadTtsFromDisk(cacheKey);
    if (cachedAudio) {
      server.log.info(`[TTS] Cache HIT (disk): ${cacheKey.substring(0, 50)}...`);
      // Load into memory for faster future access
      ttsCacheMap.set(cacheKey, cachedAudio);
      reply.header("Content-Type", cachedAudio.contentType);
      reply.header("Cache-Control", "no-store");
      reply.header("X-TTS-Source", "disk-cache");
      return cachedAudio.audio;
    }

    server.log.info(`[TTS] Cache MISS - generating from deAPI...`);

    try {
      const result = await generateDeapiTts(apiKey, text, voice, model, lang);
      server.log.info(`[TTS] Successfully generated audio, size=${result.audio.length} bytes`);

      // Cache the generated audio for future requests (memory + disk)
      const cachedData: CachedTts = {
        audio: result.audio,
        contentType: result.contentType,
        createdAt: Date.now(),
      };

      ttsCacheMap.set(cacheKey, cachedData);
      server.log.info(`[TTS] Cached in memory: ${cacheKey.substring(0, 50)}...`);

      // Save to disk asynchronously (don't wait)
      saveTtsToDisk(cacheKey, cachedData).then(() => {
        server.log.info(`[TTS] Cached to disk: ${cacheKey.substring(0, 50)}...`);
      });

      reply.header("Content-Type", result.contentType);
      reply.header("Cache-Control", "no-store");
      reply.header("X-TTS-Source", "deapi-fresh");
      return result.audio;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      server.log.error(`[TTS] deAPI TTS failed: ${errorMessage}`);
      console.error("[TTS] Full error:", err);

      // Return 429 if rate limited, so client can gracefully fall back to browser speech
      if (
        errorMessage.includes("Too Many") ||
        errorMessage.includes("rate") ||
        errorMessage.includes("429")
      ) {
        reply.code(429);
        return {
          ok: false,
          message: "TTS service rate limited. Please use browser speech or try again later.",
          code: "RATE_LIMITED",
        };
      }

      reply.code(502);
      return {
        ok: false,
        message: `Failed to generate TTS audio: ${errorMessage}`,
      };
    }
  },
);

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

  const isUntitledNoPitch =
    (!trimmedSummary && !trimmedTitle) || (!trimmedSummary && isUntitledPitchTitle(trimmedTitle));
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

    const prompt = `Create a short, punchy elevator pitch (6-8 sentences) that:
      1. Answers this problem/question: "${ask}"
      2. Includes these required elements: ${mustHavesText}
      ${surpriseText}

      Keep it exciting, founder-friendly, creative, fun, and ready to be read aloud. No fluff or disclaimers.`;

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

server.get("/api/rules", async () => {
  return {
    ok: true,
    rules: RULES,
  };
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
    const port = Number(process.env.PORT ?? "3001");
    await server.listen({ port, host: "0.0.0.0" });

    // Initialize TTS cache
    await initializeTtsCache();

    // Periodic TTS cache cleanup - remove expired entries every hour
    setInterval(
      async () => {
        // Clean memory cache
        let memoryCleanedCount = 0;
        for (const [key, cached] of ttsCacheMap.entries()) {
          if (Date.now() - cached.createdAt > TTS_CACHE_MAX_AGE_MS) {
            ttsCacheMap.delete(key);
            memoryCleanedCount += 1;
          }
        }

        // Clean disk cache
        const diskCleanedCount = await cleanupExpiredDiskCache();

        if (memoryCleanedCount > 0 || diskCleanedCount > 0) {
          server.log.info(
            `[TTS Cache] Cleaned ${memoryCleanedCount} memory + ${diskCleanedCount} disk expired entries. Current memory size: ${ttsCacheMap.size}`,
          );
        }
      },
      60 * 60 * 1000,
    ); // 60 minutes

    server.log.info(
      `[TTS Cache] Disk-based caching enabled. Cache persists across server restarts for 24 hours.`,
    );
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
