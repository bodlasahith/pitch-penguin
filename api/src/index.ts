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
  status: "lobby" | "deal" | "pitch" | "reveal" | "vote" | "results" | "final-round";
  players: RoomPlayer[];
  createdAt: string;
  lastActiveAt: number;
};

type GamePhase = "lobby" | "deal" | "pitch" | "reveal" | "vote" | "results" | "final-round";

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
  gameWinners: string[];
  finalRoundPlayers: string[];
  finalRoundRankings: Record<string, string[]>;
  judgeViewedPitches: Record<string, Set<string>>;
  finalRoundWalrus?: string | null;
  finalRoundTruceByPlayer: Record<string, boolean>;
  truceActivated?: boolean;
  playersReady: Set<string>;
  timerStarted: boolean;
};

const server = Fastify({
  logger: true,
});

const RULES = [
  "Walrus rotates each round, cycling through every player.",
  "Walrus reads the ASK card aloud (or a narrator voice reads it).",
  "Each player draws 4 MUST HAVEs and must use at least 1.",
  "One random non-Walrus player gets a secret Walrus Surprise.",
  "The player with the best pitch wins $100 and the round.",
  "Each extra MUST HAVE used adds a $25 bonus when you win.",
  "If the Walrus Surprise player wins, they earn 2 $100 bills instead of 1.",
  "Players write a pitch on a timer and may add a quick sketch.",
  "If a pitch is AI-generated, a correct challenge disqualifies them and costs $100; a wrong challenge disqualifies the accuser.",
];

const rooms = new Map<string, Room>();
const roomGameStates = new Map<string, RoomGameState>();
const roomPitches = new Map<string, Pitch[]>();
const ROOM_CAPACITY = 8;
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;

const ASK_DECK = [
  "It sucks when you stub your toe. Fix it. 🦶💥",
  "Your socks keep vanishing in the laundry void. Stop the chaos. 🧦🕳️",
  "Your coffee gets cold in 30 seconds. Save the vibes. ☕️❄️",
  "Your cat schedules meetings on your keyboard. Negotiate peace. 🐱⌨️",
  "You can't find your keys... again. Rescue them. 🔑🕵️",
  "Popcorn always burns at the worst moment. Prevent tragedy. 🍿🔥",
  "Your phone slides off the couch in slow motion. Catch it. 📱🛋️",
  "You keep forgetting why you walked into the room. Build a memory trail. 🚪🧠",
  "Your pizza arrives lukewarm. Deliver peak heat. 🍕🌋",
  "Your umbrella flips inside out every storm. Make it unflippable. ☔️💨",
  "You step on LEGO in the dark. Provide safety. 🧱🌙",
  "Your earbuds tangle instantly. Untangle destiny. 🎧🪢",
  "You spill cereal while refilling the bowl. Fix the pour. 🥣🌪️",
  "Your dog hides the TV remote daily. Track the bandit. 🐶📺",
  "Your ice cream melts before the first bite. Save dessert. 🍦⏱️",
  "Your reusable water bottle smells vaguely suspicious. Restore purity. 🚰🤨",
  "Your fitted sheet launches itself off the mattress nightly. Secure it. 🛏️🚀",
  "You never know which Tupperware lid fits. End the mismatch. 🥡🔄",
  "Your autocorrect sabotages your reputation. Regain control. 📱😵",
  "Your hair looks perfect before leaving, chaotic after. Lock it in. 💇💨",
  "Your microwave timer is emotionally inconsistent. Stabilize it. ⏲️🧠",
  "Your neighbors are mysteriously loud at all times. Negotiate peace. 🏘️🔊",
  "Your reusable tote explodes at peak grocery load. Reinforce it. 🛍️💥",
  "Your bookmarks are lies. You never return to wear you left off. Fix your reading destiny. 📚😔",
  "Your smoothie separates instantly. Preserve the blend. 🥤⚖️",
  "Your calendar double-books you constantly. Reclaim time. 📆⚔️",
  "Your candles burn unevenly. Restore symmetry. 🕯️📐",
  "Your laptop dies at 19%. Expose the truth. 💻🔋",
  "Your hoodie is never the right temperature. Achieve thermal harmony. 🧥🌡️",
  "Your snacks disappear faster than expected. Investigate. 🍪🕵️",
  "Your backpack zipper betrays you mid-commute. Reinforce trust. 🎒",
  "Your jeans zipper has a 50% chance of clipping your member. Prevent unbearable pain. 👖🪤",
  "Paper straws are great but dissolve all the time. Prevent annoyance. 🥤",
  "You always blink in group photos. Guarantee perfection. 📸",
  "Your leftovers explode in the microwave. Contain chaos. 💥",
  "You can never find the right end of the blanket. Find it first. 🛌",
  "Your car keys hide specifically when you're late. Solve urgency. 🚗",
  "Your smoothie lid leaks immediately. Seal destiny. 🥤",
  "Your plants act like toddlers that adamantly refuse water. Find out how to keep them alive. 🌿",
  "Your reusable bags accumulate infinitely. Contain expansion. 🛍️",
  "Your pizza toppings slide off. Stabilize structure. 🍕",
  "Your shoelaces untie mid-stride. Lock them down. 👟",
  "Your iced drink sweats everywhere. Eliminate condensation. 🧊",
  "Your bed is too hot or too cold. Optimize comfort. 🌡️",
  "Your headphones vanish inside your bag. Track audio assets. 🎧",
  "Your pen works only when shaken aggressively. Stabilize ink. 🖊️",
  "Your candles tunnel instead of burn evenly. Fix combustion. 🕯️",
  "The mailman stands outside your window at midnight ominously. Assess the situation. 📬",
  "Your browser auto-fills wrong names. Prevent embarrassment. 🌐",
  "Your reusable bottle leaks in bags only. Prevent betrayal. 🚰",
  "Your calendar reminders feel passive aggressive. Humanize alerts. 📆",
  "Your house echo is awkward during silence. Fix acoustics. 🏠",
  "Your shoes squeak in serious settings. Silence them. 👞",
  "Your alarm snooze button wins every time. Reclaim discipline. ⏰",
  "Your sunglasses vanish on sunny days. Secure visibility. 🕶️",
  "Your phone storage is always full. Expand reality. 📱",
  "Your hoodie pocket collects mysterious crumbs. Contain debris. 🍪",
  "Your keyboard crumbs are thriving. Clean ecosystem. ⌨️",
  "Your thermostat lies. Reveal truth. 🌡️",
  "Your reusable containers stain forever. Preserve clarity. 🥡",
  "Your shower curtain attacks you. Establish boundaries. 🚿",
  "Your snacks crumble at first bite. Preserve integrity. 🍫",
  "Your delivery driver cannot find your house. Improve navigation. 🏠",
  "Your fridge smells different every week. Stabilize freshness. 🧊",
  "Your couch swallows objects. Recover them. 🛋️",
  "Your ceiling fan is either hurricane or nothing. Balance airflow. 🌪️",
  "Your roommates eat your leftovers. Determine a solution. 🥡",
];

const MUST_HAVE_DECK = [
  "Must involve an octopus somehow. 🐙",
  "Must include at least one tiny hat. 🎩",
  "Must run on solar power. ☀️",
  "Must include a dramatic sound effect button. 🔊",
  "Must have a physical product component. 📦",
  "Must be wearable in a ridiculous way. 👕",
  "Must include a snack compartment. 🍿",
  "Must involve glitter (responsibly). ✨",
  "Must be powered by a crank or wind-up. 🔧",
  "Must include a daily ritual. 📅",
  "Must have a safety feature. 🛡️",
  "Must be voice-controlled. 🎙️",
  "Must work offline. 📴",
  "Must include a pet mode. 🐾",
  "Must include a subscription tier. 💳",
  "Must include a tiny parade. 🎺",
  "Must include a tiny pogo stick. 🤸",
  "Must include a silly name pun. 🤓",
  "Must glow slightly in the dark. 🌟",
  "Must include a ceremonial launch button. 🔴",
  "Must come in at least 7 unnecessary colors. 🎨",
  "Must include a secret compartment. 🕵️",
  "Must include an emergency mode. 🚨",
  "Must include a dramatic backstory. 📖",
  "Must include a loyalty badge system. 🏅",
  "Must include a scented element. 🌸",
  "Must require two people to operate. 🤝",
  "Must include a confusing premium tier. 💎",
  "Must include a mascot origin story. 📜",
  "Must make a satisfying click noise. 👌",
  "Must include a customizable theme song. 🎵",
  "Must include a “pro mode.” 🧠",
  "Must require at least one unnecessary accessory. 🧩",
  "Must include a limited-edition drop. ⏳",
  "Must have an absurdly confident tagline. 📢",
  "Must include a ceremonial startup launch video. 🎬",
  "Must have a freemium model. 🆓",
  "Must include a leaderboard. 🏆",
  "Must involve magnets somehow. 🧲",
  "Must include a mood-based setting. 🌈",
  "Must include an awkward beta phase. 🧪",
  "Must feature at least one unnecessary AI feature. 🤖",
  "Must include a celebratory chime. 🔔",
  "Must include a travel-size version. ✈️",
  "Must have a dramatic logo reveal. 🌀",
  "Must include a hidden Easter egg. 🥚",
  "Must include a family plan. 👨‍👩‍👧‍👦",
  "Must include a countdown timer. ⏳",
  "Must require an onboarding tutorial. 📘",
  "Must include a customizable mascot outfit. 👕",
  "Must have a physical switch that feels important. 🔘",
  "Must include a seasonal edition. 🍁",
  "Must include a hype trailer voiceover. 🎤",
  "Must include a dramatic reveal moment. 🎭",
  "Must include a big red emergency button. 🔴",
  "Must require at least one subscription tier. 💳",
  "Must include 5 tiers. 💎",
  "Must include a free trial. 🆓",
  "Must include a referral bonus. 🤝",
  "Must include a mascot accessory. 👒",
  "Must include a silent mode. 🤫",
  "Must include a chaotic mode. 🔥",
  "Must include a mobile app companion. 📱",
  "Must include a physical manual. 📘",
  "Must include a tiny LED indicator. 💡",
  "Must include a limited lifetime warranty. 📜",
  "Must include a holographic option. 🌈",
  "Must include a glow-up feature. ✨",
  "Must include a reset button. 🔄",
  "Must include a secret VIP mode. 🕶️",
  "Must include a user badge system. 🏅",
  "Must include a sound that goes 'ding'. 🔔",
  "Must include a celebratory animation. 🎉",
  "Must include a stealth mode. 🕵️",
  "Must include an eco-friendly mode. 🌱",
  "Must include a customizable color palette. 🎨",
  "Must include a dramatic tagline. 📢",
  "Must include a beta version. 🧪",
  "Must include a loyalty program. 🪙",
  "Must include a hidden upgrade. 🔓",
  "Must include a companion keychain. 🔑",
  "Must include a collapsible version. 🧳",
  "Must include a collectible edition. 🏆",
  "Must include a limited seasonal drop. 🍁",
  "Must include an annual summit. 🎤",
  "Must include a community forum. 💬",
  "Must include a mysterious origin story. 📖",
  "Must include a bold rebrand mid-lifecycle. 🎨",
  "Must include a performance mode. ⚡",
  "Must include a silent retreat mode. 🧘",
  "Must include a voice assistant personality. 🎙️",
  "Must include a confetti trigger. 🎊",
  "Must include a startup pitch deck. 📊",
  "Must include a ceremonial ribbon cutting. ✂️",
  "Must include a soft-launch event. 🎈",
  "Must include a hardware add-on. 🔧",
  "Must include a wearable add-on. 👕",
  "Must include a physical toggle switch. 🔘",
  "Must include a badge of honor. 🛡️",
  "Must include a travel case. 🎒",
  "Must include a mini version. 🧸",
  "Must include a dramatic countdown. ⏳",
  "Must include a confetti cannon. 🎉",
  "Must include a personalized greeting. 👋",
  "Must include a signature scent. 🌸",
  "Must include a soundboard feature. 🎛️",
  "Must include a nostalgic version. 📼",
  "Must include a pro edition. 🧠",
  "Must include a DIY kit. 🧰",
  "Must include a mysterious upgrade path. 🛤️",
  "Must include a compatibility mode. 🔗",
  "Must include a limited founder's edition. 👑",
  "Must include a tiny storage drawer. 🗄️",
  "Must include a dramatic pause feature. ⏸️",
  "Must include a daily challenge mode. 📆",
  "Must include a leaderboard. 🏆",
  "Must include a secret handshake. 🤝",
  "Must include a ceremonial startup anthem. 🎶",
  "Must include a prestige reset system. 🔁",
  "Must include a modular attachment. 🧩",
  "Must include a digital twin version. 🪞",
  "Must include a surprise upgrade. 🎁",
  "Must include a reversible mode. 🔄",
  "Must include a mascot outfit pack. 👕",
  "Must include a holiday edition. 🎄",
  "Must include a stealth launch. 🚀",
  "Must include a big dramatic logo. 🌀",
  "Must include a minimalist version. ⚪",
  "Must include a maximalist version. 🌈",
  "Must include a collaborative mode. 👥",
  "Must include a tiny built-in speaker. 🔊",
  "Must include a wireless version. 📡",
  "Must include a wired-only version. 🔌",
  "Must include a solar-powered option. ☀️",
  "Must include a crank-powered backup. 🔧",
  "Must include a lifetime achievement badge. 🏅",
  "Must include a hidden message. ✉️",
  "Must include a mascot sidekick. 🐾",
  "Must include a guided onboarding. 📘",
  "Must include a bold slogan. 📢",
  "Must include a 'dark mode'. 🌑",
  "Must include a 'party mode'. 🎉",
  "Must include a family plan. 👨‍👩‍👧‍👦",
  "Must include a ceremonial gong. 🥁",
  "Must include a nostalgic sound effect. 📻",
  "Must include a dramatic loading screen. ⏳",
  "Must include a surprise easter egg. 🥚",
  "Must include a celebratory fireworks mode. 🎆",
  "Must include a merch store. 🛍️",
  "Must include a community mascot vote. 🗳️",
  "Must include a hidden expert mode. 🧠",
  "Must include a legacy edition. 🏛️",
  "Must include a bold product name pun. 🤓",
  "Must include a special edition colorway. 🎨",
  "Must include a limited NFT tie-in. 🖼️",
  "Must include a physical prototype. 📦",
  "Must include a ceremonial unboxing experience. 📦✨",
  "Must include a tiny dramatic fog effect. 🌫️",
  "Must include a built-in applause button. 👏",
  "Must have a date proposal. 💌",
];

const SURPRISE_DECK = [
  "Must involve a walrus. 🦭",
  "Must include an in-flight use case. ✈️",
  "Must be described as " + '"the Spotify of X".' + " 🎶",
  "Must include a nonprofit tie-in. ❤️",
  "Must include a confetti moment. 🎉",
  "Must include a tiny robot sidekick. 🤖",
  "Must include a pirate accent. 🏴‍☠️",
  "Must include a surprise dance break. 💃",
  "Must include a dramatic fog machine. 🌫️",
  "Must include a banana. 🍌",
  "The walrus only invests in sustainable products. 🌎",
  "The walrus hates tech buzzwords. 🚫",
  "The walrus wants recurring revenue. 💳",
  "The walrus demands a live demo (mime it if you don't have the materials). 🎬",
  "The walrus is deeply confused. #explainitlikeim5. 🤔",
  "The walrus wants international expansion plans. 🌍",
  "Pitch it like you're on a reality TV show. 📺",
  "You must whisper the entire pitch. 🤫",
  "You must dramatically overvalue your company. 💰",
  "You must pivot halfway through the pitch. 🔄",
  "Include a fake testimonial from your grandma. 👵",
  "Include a suspiciously specific statistic. 📊",
  "You must fire someone mid-pitch. 🧑‍💼",
  "You must ask the walrus for more money twice. 🦭💸",
  "Include an unnecessary rebrand announcement. 🎨",
  "You must compare it to at least two unicorn startups. 🦄",
  "You must dramatically unveil something under a cloth. 🎭",
  "You must accuse another player of stealing your idea. 🕵️",
  "Include a surprise merger announcement. 🤝",
  "You must make it emotional. Cry if you can. 😭",
  "You must pitch while standing dramatically. 🕴️",
  "You must rhyme at least once. 🎵",
  "You must shout one random word mid-pitch. 📢",
  "You must include a fake competitor comparison chart. 📊",
  "You must end with a catchphrase. 🎬",
  "You must pivot to a blockchain angle halfway through. ⛓️",
  "You must reveal a surprise co-founder. 🤝",
  "You must pretend the product already sold out. 🔥",
  "You must include a slow clap moment. 👏",
  "You must pretend the demo malfunctioned. 💻💥",
  "The walrus wants a detailed exit strategy. 🚪",
  "The walrus only invests in products with pets. 🐾",
  "The walrus is of the 1%. Insist this be for rich consumers only. 💎",
  "The walrus demands an emotional backstory. 😭",
  "The walrus wants proof of traction. 📈",
  "The walrus interrupts constantly. Adapt. 🦭",
  "The walrus wants a dramatic valuation reveal. 💰",
  "The walrus wants this to go viral by tomorrow. 🚀",
  "The walrus requires it to be a B2B SaaS product. 🏢",
  "You must inlude at least 1 thing this pitch taught you about B2B SaaS. 💻",
  "You must dramatically pause for applause. 👏",
  "You must pitch as if you're extremely tired. 😴",
  "You must speak like it's a pharmaceutical commercial. 💎",
  "You must pretend this is your third pivot. 🔄",
  "You must announce a surprise IPO. 📈",
  "You must reveal a secret competitor. 🕵️",
  "You must include a dramatic slow-motion demo. 🐢",
  "You must begin your pitch with 'A long time ago, in a galaxy far, far away...'. 🌌",
  "You must integrate AI agents somehow. 🤖",
  "You must compare it to something wildly unrelated. 🐢",
  "You must whisper one key feature. 🤫",
  "You must shout the valuation. 💰",
  "You must include a dramatic gasp moment. 😲",
  "You must pitch like you're in a medieval market. 🏰",
  "You must accuse the walrus of doubting you. 🦭",
  "You must unveil a surprise product add-on. 🎁",
  "You must dramatically overpromise scale. 🌍",
  "You must pretend it already went viral. 🔥",
  "You must include a dramatic team intro. 👥",
  "You must ask permission to marry the walrus's son/daughter. 💍",
  "You must include a fake customer testimonial. 🗣️",
  "You must end with a dramatic mic drop. 🎤",
  "The walrus only invests in chaotic energy. 🔥",
  "The walrus demands luxury branding. 💎",
  "The walrus demands emotional vulnerability. 😭",
  "The walrus loves complexity. Be as verbose as possible. 🧠",
  "The walrus interrupts constantly. Adapt. 🦭",
  "The walrus demands international expansion immediately. 🌍",
  "The walrus wants recurring revenue explained twice. 💳",
  "The walrus insists this solves climate change. 🌎",
  "The walrus only invests in products with pets. 🐾",
  "The walrus wants a detailed exit plan. 🚪",
  "The walrus wants a limited edition drop strategy. ⏳",
  "The walrus demands a surprise twist. 🎭",
  "The walrus insists on a rebrand mid-pitch. 🎨",
  "The walrus wants proof of traction. 📈",
  "The walrus demands this be the 'Uber of something.' 🚗",
  "The walrus wants it described as a movement. ✊",
  "The walrus demands a jingle. 🎶",
  "The walrus wants a bold tagline. 📢",
  "The walrus wants a popular meme. 😂",
  "The walrus is British. Pitch with an accent 🇬🇧",
  "The walrus is from Texas. Pitch with a Southern twang 🤠",
  "The walrus wants celebrity endorsements. 🌟",
  "The walrus demands a controversial feature. 🔥",
  "The walrus wants to see a prototype. 📦",
  "The walrus demands you pivot to a partnership with Anthropic. 🤖",
  "The walrus wants a merch strategy. 🛍️",
  "The walrus demands global domination. 🌍",
  "The walrus insists this be subscription-only. 💳",
  "The walrus wants a teaser trailer. 🎬",
  "The walrus wants a comprehensive packaging strategy. 📦",
  "The walrus demands scalability explained loudly. 📈",
  "The walrus wants a confusing but exciting roadmap. 🗺️",
  "You must trash talk another player's idea. 🗣️",
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

const getMustHaveBonus = (usedMustHaves?: string[]) => {
  const count = usedMustHaves?.length ?? 0;
  return Math.max(0, count - 1) * 0.25;
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
    gameWinners: [],
    finalRoundPlayers: [],
    finalRoundRankings: {},
    judgeViewedPitches: {},
    finalRoundWalrus: null,
    finalRoundTruceByPlayer: {},
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

const dealFinalRoundCards = (room: Room, gameState: RoomGameState) => {
  // For final round: each player gets exactly 3 must-haves and 1 walrus surprise
  const shuffled = shuffle(MUST_HAVE_DECK);
  let index = 0;
  const byPlayer: Record<string, string[]> = {};
  const surpriseByPlayer: Record<string, string | null> = {};

  // Deal 3 must-haves to each final round player
  gameState.finalRoundPlayers.forEach((playerName) => {
    byPlayer[playerName] = shuffled.slice(index, index + 3);
    index += 3;
  });

  // Give each final round player a walrus surprise
  const surpriseShuffled = shuffle(SURPRISE_DECK);
  gameState.finalRoundPlayers.forEach((playerName, idx) => {
    surpriseByPlayer[playerName] = surpriseShuffled[idx % surpriseShuffled.length];
  });

  gameState.mustHavesByPlayer = byPlayer;
  gameState.surpriseByPlayer = surpriseByPlayer;
  // In final round, all pitchers are "walrus surprise" players for bonus purposes
  gameState.walrusSurprisePlayer = null; // Not used in final round
};

const rotateWalrus = (gameState: RoomGameState) => {
  gameState.walrusQueueIndex = (gameState.walrusQueueIndex + 1) % gameState.walrusQueue.length;
  gameState.walrus = gameState.walrusQueue[gameState.walrusQueueIndex];
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
  gameState.pitchEndsAt = null;
};

const finalizeFinalRoundPitches = (room: Room, gameState: RoomGameState) => {
  if (room.status !== "final-round") {
    return;
  }

  const list = roomPitches.get(room.code) ?? [];

  // Auto-submit pitches for final round players who haven't submitted
  gameState.finalRoundPlayers.forEach((playerName: string) => {
    const existing = list.find((p) => p.player === playerName);
    if (!existing) {
      list.push({
        id: `pitch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        player: playerName,
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
    // Final round requires at least 2 must-haves
    const isValid = (existing.usedMustHaves ?? []).length >= 2;
    const existingIndex = list.findIndex((p) => p.player === playerName);
    if (existingIndex >= 0) {
      list[existingIndex] = {
        ...existing,
        isValid,
        isDisqualified: existing.isDisqualified ?? false,
      };
    }
  });

  roomPitches.set(room.code, list);

  // Move to final round voting (judges will now rank)
  // Stay in final round phase but mark all pitches as ready
  gameState.finalRoundPlayers.forEach((playerName: string) => {
    gameState.pitchStatusByPlayer[playerName] = "ready";
  });
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

const startFinalRound = (room: Room, gameState: RoomGameState) => {
  room.status = "final-round";
  gameState.phase = "final-round";

  // All players who are NOT in final round become judges
  // Final round players will pitch
  gameState.finalRoundRankings = {};
  gameState.judgeViewedPitches = {};

  // Clear previous round data
  // Pick ONE random ask from the deck (no walrus selection in final round)
  const randomAsk = shuffle(ASK_DECK)[0] ?? "Create something amazing!";
  gameState.askOptions = [randomAsk]; // Only one option
  gameState.selectedAsk = randomAsk; // Auto-selected
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

  // Deal cards to final round players (3 must-haves + 1 walrus surprise each)
  dealFinalRoundCards(room, gameState);

  // Start pitch timer
  if (gameState.pitchTimerTimeoutId) {
    clearTimeout(gameState.pitchTimerTimeoutId);
  }
  gameState.pitchEndsAt = Date.now() + gameState.pitchTimerSeconds * 1000;
  gameState.pitchTimerTimeoutId = setTimeout(() => {
    finalizeFinalRoundPitches(room, gameState);
  }, gameState.pitchTimerSeconds * 1000);
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
  const pointsAwarded = (walrusSurpriseWinner ? 2 : 1) + getMustHaveBonus(pitch.usedMustHaves);
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

  // Convert judgeViewedPitches Sets to arrays
  const judgeViewedPitchesArray: Record<string, string[]> = {};
  Object.entries(gameState.judgeViewedPitches).forEach(([judge, pitchSet]) => {
    judgeViewedPitchesArray[judge] = Array.from(pitchSet);
  });

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
      gameWinners: gameState.gameWinners,
      finalRoundPlayers: gameState.finalRoundPlayers,
      finalRoundRankings: gameState.finalRoundRankings,
      judgeViewedPitches: judgeViewedPitchesArray,
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
  const usedMustHavesCount = (body.usedMustHaves ?? []).length;

  // Final round requires at least 2 must-haves, normal rounds require at least 1
  const isFinalRound = gameState.phase === "final-round";
  const minMustHaves = isFinalRound ? 2 : 1;
  const hasMustHaves = usedMustHavesCount >= minMustHaves;

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
    playerName: string;
  };

  const { ask, mustHaves, surprise, playerName } = body;

  if (!ask || !mustHaves || mustHaves.length === 0) {
    return {
      ok: false,
      message: "Ask and at least one MUST HAVE required",
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
    return {
      ok: true,
      viewedPitchIds: Array.from(gameState.judgeViewedPitches[viewer]),
    };
  }

  // Normal round: only walrus can mark pitches viewed
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
    const pointsAward = (isSurpriseWinner ? 2 : 1) + getMustHaveBonus(winningPitch.usedMustHaves);
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
    // Someone reached $500 - trigger final round with top players
    const finalRoundPlayers = getFinalRoundPlayers(gameState);
    gameState.finalRoundPlayers = finalRoundPlayers;

    // Don't set gameWinner yet - will be determined in final round
  }

  room.status = "results";
  gameState.phase = "results";

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

  // Check if we need a final round
  if (gameState.finalRoundPlayers.length > 0) {
    // Start final round
    startFinalRound(room, gameState);
    return {
      ok: true,
      finalRoundStarted: true,
      finalRoundPlayers: gameState.finalRoundPlayers,
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

  gameState.finalRoundRankings[playerName] = rankedPitchIds;

  // Check if all judges have submitted rankings
  const judges = room.players
    .filter((p) => !gameState.finalRoundPlayers.includes(p.name))
    .map((p) => p.name);

  const allJudgesVoted = judges.every((judge) => gameState.finalRoundRankings[judge]);

  if (allJudgesVoted) {
    // Tally rankings with new earnings-based scoring
    const pitches = roomPitches.get(code) ?? [];
    const earnings: Record<string, number> = {};
    const numPlayers = gameState.finalRoundPlayers.length;

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
