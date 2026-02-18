import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Fastify from "fastify";

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
  walrusSurpriseWinner: boolean;
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
  walrusSurpriseWinner: boolean;
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
  status: "lobby" | "deal" | "pitch" | "reveal" | "vote" | "results";
  players: RoomPlayer[];
  createdAt: string;
  lastActiveAt: number;
};

type GamePhase = "lobby" | "deal" | "pitch" | "reveal" | "vote" | "results";

type PlayerPitchStatus = "pending" | "drafting" | "ready";

type RoomGameState = {
  phase: GamePhase;
  walrus: string;
  walrusQueue: string[];
  walrusQueueIndex: number;
  round: number;
  walrusAskTimerSeconds: number;
  pitchTimerSeconds: number;
  askOptions: string[];
  selectedAsk: string | null;
  askSelectionExpiresAt: number | null;
  askSelectionTimeoutId: ReturnType<typeof setTimeout> | null;
  pitchEndsAt: number | null;
  pitchTimerTimeoutId: ReturnType<typeof setTimeout> | null;
  mustHavesByPlayer: Record<string, string[]>;
  surpriseByPlayer: Record<string, string | null>;
  pitchStatusByPlayer: Record<string, PlayerPitchStatus>;
  walrusSurprisePlayer: string | null;
  robotVoiceEnabled: boolean;
  challenges: Challenge[];
  challengeReveal: ChallengeReveal | null;
  lastRoundWinner: RoundWinnerSummary | null;
  viewedPitchIds: Set<string>;
  disqualifiedPlayers: Set<string>;
  playerScores: Record<string, number>;
  gameWinner: string | null;
};

const server = Fastify({
  logger: true,
});

const RULES = [
  "Walrus rotates each round, cycling through every player.",
  "Walrus reads the ASK card aloud (or a narrator voice reads it).",
  "Each player draws 4 MUST HAVEs and must use at least 1.",
  "One random non-Walrus player gets a secret Walrus Surprise.",
  "If the Walrus Surprise player wins, they earn 2 points instead of 1.",
  "Players pitch on a timer and may add a quick sketch.",
  "If a pitch is AI-generated, a correct challenge disqualifies them and costs 1 point; a wrong challenge disqualifies the accuser.",
];

const rooms = new Map<string, Room>();
const roomGameStates = new Map<string, RoomGameState>();
const roomPitches = new Map<string, Pitch[]>();
const ROOM_CAPACITY = 8;
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;

const ASK_DECK = [
  "Urban commuters are exhausted. Pitch a product that makes their mornings easier.",
  "Remote teams feel disconnected. Pitch a product that restores trust.",
  "Parents are drowning in logistics. Pitch a product that buys them time.",
  "Local artists can't monetize. Pitch a product that funds their work.",
  "Side hustlers struggle with consistency. Pitch a product that keeps them on track.",
];

const MUST_HAVE_DECK = [
  "Must include a wearable component.",
  "Must run on solar power.",
  "Must integrate with public transit.",
  "Must include a daily ritual.",
  "Must include a subscription tier.",
  "Must work offline.",
  "Must have a social or community element.",
  "Must include a physical product component.",
  "Must include a safety feature.",
  "Must be voice-controlled.",
];

const SURPRISE_DECK = [
  "Must include a walrus mascot in the pitch.",
  "Must include an in-flight use case.",
  "Must be described as " + '"the Spotify of X".',
  "Must include a nonprofit tie-in.",
];

const MASCOT_OPTIONS = [
  "rocket",
  "chart",
  "gremlin",
  "penguin",
  "goblin",
  "robot",
  "unicorn",
  "shark",
  "octopus",
  "llama",
  "hamster",
  "blob",
  "raccoon",
];

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

const getNextPhase = (current: GamePhase) => {
  const index = PHASE_ORDER.indexOf(current);
  if (index === -1 || index === PHASE_ORDER.length - 1) {
    return "lobby";
  }
  return PHASE_ORDER[index + 1];
};

const initializeGameState = (room: Room): RoomGameState => {
  const walrusQueue = room.players.map((p) => p.name);
  const walrus = walrusQueue[Math.floor(Math.random() * walrusQueue.length)] ?? "Walrus";
  const walrusQueueIndex = walrusQueue.indexOf(walrus);
  const askOptions = shuffle(ASK_DECK).slice(0, 3);
  const pitchStatusByPlayer: Record<string, PlayerPitchStatus> = {};
  const playerScores: Record<string, number> = {};
  room.players.forEach((player) => {
    pitchStatusByPlayer[player.name] = "pending";
    playerScores[player.name] = 0;
  });

  return {
    phase: room.status,
    walrus,
    walrusQueue,
    walrusQueueIndex,
    round: 0,
    walrusAskTimerSeconds: 30,
    pitchTimerSeconds: 120,
    askOptions,
    selectedAsk: null,
    askSelectionExpiresAt: null,
    askSelectionTimeoutId: null,
    pitchEndsAt: null,
    pitchTimerTimeoutId: null,
    mustHavesByPlayer: {},
    surpriseByPlayer: {},
    pitchStatusByPlayer,
    walrusSurprisePlayer: null,
    robotVoiceEnabled: true,
    challenges: [],
    challengeReveal: null,
    lastRoundWinner: null,
    viewedPitchIds: new Set(),
    disqualifiedPlayers: new Set(),
    playerScores,
    gameWinner: null,
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

const createJoinCode = () => {
  const number = Math.floor(100 + Math.random() * 900);
  return `WLR-${number}`;
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
  roomCode: "WLR-482",
  phase: "reveal",
  round: 2,
  walrus: "Riley",
  walrusSurprisePlayer: "Jordan",
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
  const shuffled = shuffle(MUST_HAVE_DECK);
  let index = 0;
  const byPlayer: Record<string, string[]> = {};
  const surpriseByPlayer: Record<string, string | null> = {};
  room.players.forEach((player) => {
    if (player.name === gameState.walrus) {
      return;
    }
    byPlayer[player.name] = shuffled.slice(index, index + 4);
    index += 4;
  });
  const eligible = room.players.filter((player) => player.name !== gameState.walrus);
  const surprisePlayer = eligible.length
    ? eligible[Math.floor(Math.random() * eligible.length)].name
    : null;
  eligible.forEach((player) => {
    surpriseByPlayer[player.name] =
      player.name === surprisePlayer ? shuffle(SURPRISE_DECK)[0] : null;
  });
  gameState.mustHavesByPlayer = byPlayer;
  gameState.surpriseByPlayer = surpriseByPlayer;
  gameState.walrusSurprisePlayer = surprisePlayer;
};

const rotateWalrus = (gameState: RoomGameState) => {
  gameState.walrusQueueIndex = (gameState.walrusQueueIndex + 1) % gameState.walrusQueue.length;
  gameState.walrus = gameState.walrusQueue[gameState.walrusQueueIndex];
};

const checkGameEnd = (gameState: RoomGameState): boolean => {
  const maxScore = Math.max(...Object.values(gameState.playerScores));
  return maxScore >= 5;
};

const getGameWinner = (gameState: RoomGameState): string | null => {
  const maxScore = Math.max(...Object.values(gameState.playerScores));
  if (maxScore < 5) return null;
  for (const [player, score] of Object.entries(gameState.playerScores)) {
    if (score === maxScore) return player;
  }
  return null;
};

const startRevealPhase = (room: Room, gameState: RoomGameState) => {
  room.status = "reveal";
  gameState.phase = "reveal";
  if (gameState.pitchTimerTimeoutId) {
    clearTimeout(gameState.pitchTimerTimeoutId);
    gameState.pitchTimerTimeoutId = null;
  }
  gameState.pitchEndsAt = null;
};

const finalizePitchPhase = (room: Room, gameState: RoomGameState) => {
  if (room.status !== "pitch") {
    return;
  }
  const list = roomPitches.get(room.code) ?? [];

  room.players.forEach((player) => {
    if (player.name === gameState.walrus) {
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
  startRevealPhase(room, gameState);
};

const startPitchPhase = (room: Room, gameState: RoomGameState) => {
  room.status = "pitch";
  gameState.phase = "pitch";
  if (gameState.pitchTimerTimeoutId) {
    clearTimeout(gameState.pitchTimerTimeoutId);
  }
  gameState.pitchEndsAt = Date.now() + gameState.pitchTimerSeconds * 1000;
  gameState.pitchTimerTimeoutId = setTimeout(() => {
    finalizePitchPhase(room, gameState);
  }, gameState.pitchTimerSeconds * 1000);
  room.players.forEach((player) => {
    if (player.name !== gameState.walrus) {
      gameState.pitchStatusByPlayer[player.name] = "drafting";
    }
  });
};

const startDealPhase = (room: Room, gameState: RoomGameState) => {
  // Randomize walrus on first round
  if (gameState.round === 0) {
    const randomIndex = Math.floor(Math.random() * gameState.walrusQueue.length);
    gameState.walrusQueueIndex = randomIndex;
    gameState.walrus = gameState.walrusQueue[randomIndex];
  }

  room.status = "deal";
  gameState.phase = "deal";
  gameState.askOptions = shuffle(ASK_DECK).slice(0, 3);
  gameState.selectedAsk = null;
  gameState.challengeReveal = null;
  gameState.viewedPitchIds.clear();
  dealMustHaves(room, gameState);
  room.players.forEach((player) => {
    gameState.pitchStatusByPlayer[player.name] = "pending";
  });

  if (gameState.askSelectionTimeoutId) {
    clearTimeout(gameState.askSelectionTimeoutId);
  }
  const expiresAt = Date.now() + gameState.walrusAskTimerSeconds * 1000;
  gameState.askSelectionExpiresAt = expiresAt;
  gameState.askSelectionTimeoutId = setTimeout(() => {
    if (!gameState.selectedAsk) {
      gameState.selectedAsk = gameState.askOptions[0] ?? null;
    }
    startPitchPhase(room, gameState);
  }, gameState.walrusAskTimerSeconds * 1000);
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
  const walrusSurpriseWinner = winner === gameState.walrusSurprisePlayer;
  const pointsAwarded = walrusSurpriseWinner ? 2 : 1;
  const winnerPlayer = findPlayer(winner);
  if (winnerPlayer) {
    winnerPlayer.points += pointsAwarded;
  }

  const result: RoundResult = {
    round: gameState.round,
    winner,
    pitchId,
    walrusSurpriseWinner,
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
    service: "business-walrus-api",
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
  const gameState = getRoomGameState(room);
  gameState.phase = room.status;
  return {
    ok: true,
    code,
    status: room.status,
    players: room.players,
    capacity: ROOM_CAPACITY,
    walrus: gameState.walrus,
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

  // If this is first player, set them as initial walrus (will be randomized on game start)
  if (isHost) {
    gameState.walrus = playerName;
    gameState.walrusQueue = room.players.map((p) => p.name);
  } else {
    // Update walrus queue for subsequent players
    gameState.walrusQueue = room.players.map((p) => p.name);
  }

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

  const wasHost = room.players[index].isHost;
  room.players.splice(index, 1);
  if (wasHost) {
    assignNextHost(room);
  }
  room.lastActiveAt = Date.now();

  const gameState = getRoomGameState(room);
  delete gameState.pitchStatusByPlayer[playerName];
  delete gameState.mustHavesByPlayer[playerName];
  delete gameState.surpriseByPlayer[playerName];
  if (wasHost) {
    const nextHost = room.players.find((player) => player.isHost)?.name;
    if (nextHost) {
      gameState.walrus = nextHost;
    }
  }

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
  const gameState = getRoomGameState(room);

  // Convert Set to array for JSON serialization
  const disqualifiedArray = Array.from(gameState.disqualifiedPlayers);

  return {
    ok: true,
    room: {
      code: room.code,
      phase: room.status,
      walrus: gameState.walrus,
      round: gameState.round,
      playerScores: gameState.playerScores,
      askOptions: gameState.askOptions,
      selectedAsk: gameState.selectedAsk,
      walrusAskTimerSeconds: gameState.walrusAskTimerSeconds,
      pitchTimerSeconds: gameState.pitchTimerSeconds,
      robotVoiceEnabled: gameState.robotVoiceEnabled,
      askSelectionExpiresAt: gameState.askSelectionExpiresAt,
      pitchEndsAt: gameState.pitchEndsAt,
      walrusSurprisePlayer: gameState.walrusSurprisePlayer,
      gameWinner: gameState.gameWinner,
      challengeReveal: gameState.challengeReveal,
      lastRoundWinner: gameState.lastRoundWinner,
      viewedPitchIds: Array.from(gameState.viewedPitchIds),
    },
    players: room.players,
    mustHavesByPlayer: gameState.mustHavesByPlayer,
    surpriseByPlayer: gameState.surpriseByPlayer,
    pitchStatusByPlayer: gameState.pitchStatusByPlayer,
    playerScores: gameState.playerScores,
    disqualifiedPlayers: disqualifiedArray,
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
  return {
    ok: true,
    enabled: gameState.robotVoiceEnabled,
  };
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
  const hasMustHaves = (body.usedMustHaves ?? []).length > 0;
  const isEmpty = !trimmedTitle || !trimmedSummary;
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
      .filter((player) => player.name !== gameState.walrus)
      .every((player) => gameState.pitchStatusByPlayer[player.name] === "ready");
    if (allReady) {
      startRevealPhase(room, gameState);
    }
  }

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
  };

  const { ask, mustHaves, surprise } = body;

  if (!ask || !mustHaves || mustHaves.length === 0) {
    return {
      ok: false,
      message: "Ask and at least one MUST HAVE required",
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
    const missingMustHaves = (pitch.usedMustHaves?.length ?? 0) === 0;
    const missingContent = !pitch.title?.trim() || !pitch.summary?.trim();
    const derivedDisqualified = missingMustHaves || missingContent;
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
  if (!pitchId) {
    return {
      ok: false,
      message: "pitchId required",
    };
  }
  const gameState = getRoomGameState(room);
  if (body.viewer && body.viewer.toLowerCase() !== gameState.walrus.toLowerCase()) {
    return {
      ok: false,
      message: "Only the walrus can mark pitches viewed",
    };
  }
  gameState.viewedPitchIds.add(pitchId);
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
    const isSurpriseWinner = winningPitch.player === gameState.walrusSurprisePlayer;
    const pointsAward = isSurpriseWinner ? 2 : 1;
    gameState.playerScores[winningPitch.player] =
      (gameState.playerScores[winningPitch.player] ?? 0) + pointsAward;
    gameState.lastRoundWinner = {
      player: winningPitch.player,
      pitchId: winningPitch.id,
      pitchTitle: winningPitch.title,
      sketchData: winningPitch.sketchData ?? null,
      pointsAwarded: pointsAward,
      walrusSurpriseWinner: isSurpriseWinner,
      createdAt: new Date().toISOString(),
    };
  }

  // Check if game is over
  if (checkGameEnd(gameState)) {
    gameState.gameWinner = getGameWinner(gameState);
  }

  room.status = "results";
  gameState.phase = "results";

  return {
    ok: true,
    playerScores: gameState.playerScores,
    disqualified: Array.from(gameState.disqualifiedPlayers),
    gameWinner: gameState.gameWinner,
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
      message: "Game has ended. Use /restart to play again.",
    };
  }

  // Advance to next round
  gameState.round += 1;
  gameState.walrusQueue = room.players.map((player) => player.name);
  const currentIndex = gameState.walrusQueue.indexOf(gameState.walrus);
  gameState.walrusQueueIndex = currentIndex >= 0 ? currentIndex : 0;
  rotateWalrus(gameState);
  gameState.challenges = [];
  gameState.challengeReveal = null;
  gameState.viewedPitchIds.clear();
  gameState.disqualifiedPlayers.clear();
  roomPitches.delete(code);

  // Reset pitch statuses
  room.players.forEach((player) => {
    gameState.pitchStatusByPlayer[player.name] = "pending";
  });

  // Start next round with deal phase
  startDealPhase(room, gameState);

  return {
    ok: true,
    round: gameState.round,
    walrus: gameState.walrus,
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

  return {
    ok: true,
    message: "Game restarted",
    room: {
      code: room.code,
      status: room.status,
      walrus: newGameState.walrus,
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
    walrus: gameState.walrus,
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
      walrus: gameState.walrus,
      walrusSurprisePlayer: gameState.walrusSurprisePlayer,
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
  const voter = body.voter ?? gameState.walrus;
  if (!pitchId) {
    return {
      ok: false,
      message: "pitchId is required",
    };
  }

  return applyRoundResult(pitchId, voter);
});

const start = async () => {
  try {
    await server.listen({ port: 3001, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
