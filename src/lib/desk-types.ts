export const CHANNELS = ["desk", "voice", "mail", "text"] as const;
export type Channel = (typeof CHANNELS)[number];

export type Line = {
  id: string;
  role: "person" | "macman";
  body: string;
  subject: string | null;
  createdAt: string;
};

export type SavedMemory = {
  id: string;
  content: string;
  createdAt: string;
};

export type DeskHome = {
  alias: string;
  memory: string | null;
  memories: SavedMemory[];
};
