import rocketSVG from "../assets/rocket.svg";
import chartSVG from "../assets/chart.svg";
import gremlinSVG from "../assets/gremlin.svg";
import walrusSVG from "../assets/walrus.svg";
import goblinSVG from "../assets/goblin.svg";
import robotSVG from "../assets/robot.svg";
import unicornSVG from "../assets/unicorn.svg";
import sharkSVG from "../assets/shark.svg";
import octopusSVG from "../assets/octopus.svg";
import llamaSVG from "../assets/llama.svg";
import hamsterSVG from "../assets/hamster.svg";
import blobSVG from "../assets/blob.svg";
import raccoonSVG from "../assets/raccoon.svg";
import scientistSVG from "../assets/scientist.svg";

export const MASCOT_MAP: Record<string, { name: string; svg: string }> = {
  rocket: { name: "Rocket CEO", svg: rocketSVG },
  chart: { name: "Chart Wizard", svg: chartSVG },
  gremlin: { name: "Idea Gremlin", svg: gremlinSVG },
  walrus: { name: "Corporate Walrus", svg: walrusSVG },
  goblin: { name: "Growth Goblin", svg: goblinSVG },
  robot: { name: "AI Founder Bot", svg: robotSVG },
  unicorn: { name: "Unicorn Founder", svg: unicornSVG },
  shark: { name: "VC Shark", svg: sharkSVG },
  octopus: { name: "Multitasking Octo-Founder", svg: octopusSVG },
  llama: { name: "Hyper Influencer Llama", svg: llamaSVG },
  hamster: { name: "Hustler Hamster", svg: hamsterSVG },
  blob: { name: "Brainstorm Blob", svg: blobSVG },
  raccoon: { name: "Crypto Raccoon", svg: raccoonSVG },
  scientist: { name: "Mad Scientist", svg: scientistSVG },
};

export function getMascotImage(mascotId: string | undefined): string | null {
  if (!mascotId) return null;
  return MASCOT_MAP[mascotId]?.svg || null;
}

export function getMascotName(mascotId: string | undefined): string | null {
  if (!mascotId) return null;
  return MASCOT_MAP[mascotId]?.name || null;
}

const MASCOT_COLORS: Record<string, string> = {
  rocket: "#FFE5D4",
  chart: "#eddff4",
  gremlin: "#E0FBF2",
  walrus: "#eae2ff",
  goblin: "#F7DFF2",
  robot: "#E3F1F7",
  unicorn: "#F4E2FF",
  shark: "#DFF0F7",
  octopus: "#FCE1EC",
  llama: "#FFE6DC",
  hamster: "#FFF1D6",
  blob: "#e2e1fa",
  raccoon: "#dbdbdb",
  scientist: "#F5F1EA",
};

export function getMascotColor(mascotId: string | undefined): string {
  if (!mascotId) return "#F5F1EA";
  return MASCOT_COLORS[mascotId] || "#F5F1EA";
}
