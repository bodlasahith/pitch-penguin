import Fastify from "fastify";

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
  createdAt: string;
};

type RoomPlayer = {
  name: string;
  isHost: boolean;
  joinedAt: string;
};

type Room = {
  code: string;
  status: "lobby" | "deal" | "pitch" | "reveal" | "vote" | "results";
  players: RoomPlayer[];
  createdAt: string;
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
const ROOM_CAPACITY = 8;

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
  const room: Room = {
    code,
    status: "lobby",
    players: [
      {
        name,
        isHost: true,
        joinedAt: now,
      },
    ],
    createdAt: now,
  };
  rooms.set(code, room);
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
});

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
  return {
    ok: true,
    code,
    status: room.status,
    players: room.players,
    capacity: ROOM_CAPACITY,
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

  room.players.push({
    name: playerName,
    isHost: false,
    joinedAt: new Date().toISOString(),
  });

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
      ok: false,
      message: "Player not found",
    };
  }

  const wasHost = room.players[index].isHost;
  room.players.splice(index, 1);
  if (wasHost) {
    assignNextHost(room);
  }

  return {
    ok: true,
    room,
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
