// ============================================================
// Your Body Explained — Content Generation Types
// ============================================================

export type ContentPillar = "body-facts" | "nutrition-myths" | "hidden-signals";

export type ContentStatus = "draft" | "pending-review" | "approved" | "published" | "rejected";

export type Platform = "youtube-shorts" | "tiktok";

export interface ScriptSection {
  label: "HOOK" | "TENSION" | "EXPLANATION" | "PUNCHLINE";
  startTime: number;   // seconds
  endTime: number;      // seconds
  text: string;
}

export interface VideoScene {
  sceneNumber: number;
  startTime: number;
  endTime: number;
  visualDescription: string;    // prompt-ready visual description
  cameraAngle: string;
  mood: string;
  textOverlay?: string;
  textOverlayStyle?: string;
}

export interface MiniMaxPrompt {
  model: string;
  prompt: string;
  firstFrameImage?: string;
  subjectReference?: string;
}

export interface GeneratedScript {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ContentStatus;

  // Content metadata
  pillar: ContentPillar;
  topic: string;
  topicSlug: string;

  // Script
  script: ScriptSection[];
  fullNarration: string;
  totalDuration: number;  // seconds

  // Video generation
  scenes: VideoScene[];
  minimaxPrompts: MiniMaxPrompt[];

  // Voiceover
  voiceoverDirection: string;

  // Music
  musicDirection: string;

  // Caption / overlay instructions
  captionInstructions: string;

  // Platform metadata
  youtubeTitle: string;
  youtubeDescription: string;
  tiktokDescription: string;
  hashtags: string[];

  // Scheduling
  scheduledDate?: string;
  publishedDate?: string;
  publishedPlatforms?: Platform[];

  // Review
  reviewNotes?: string;
}

export interface TopicEntry {
  topic: string;
  pillar: ContentPillar;
  oneLiner: string;
  keyFact: string;
  sourceHint?: string;
  used: boolean;
}

export interface ContentCalendar {
  week: string;  // ISO week
  slots: {
    date: string;
    pillar: ContentPillar;
    scriptId?: string;
  }[];
}

export interface GenerationRequest {
  pillar?: ContentPillar;
  topic?: string;
  date?: string;       // target publish date
  count?: number;       // how many to generate (default 1)
}

export interface GenerationResult {
  success: boolean;
  scripts: GeneratedScript[];
  errors?: string[];
}

// Pillar display config
export const PILLAR_CONFIG: Record<ContentPillar, {
  label: string;
  emoji: string;
  color: string;
  musicMood: string;
  colorGrading: string;
}> = {
  "body-facts": {
    label: "Body Facts",
    emoji: "💪",
    color: "#f59e0b",
    musicMood: "motivational, dark energy",
    colorGrading: "warm, energetic, high contrast"
  },
  "nutrition-myths": {
    label: "Nutrition Myths",
    emoji: "🍎",
    color: "#22c55e",
    musicMood: "confident, slightly cheeky",
    colorGrading: "warm tones, inviting"
  },
  "hidden-signals": {
    label: "Hidden Signals",
    emoji: "📡",
    color: "#6366f1",
    musicMood: "tension-building, urgent but not scary",
    colorGrading: "blue/red, moody, cinematic"
  }
};
