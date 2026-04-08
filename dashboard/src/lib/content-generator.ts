import {
  GeneratedScript,
  ContentPillar,
  ScriptSection,
  VideoScene,
  MiniMaxPrompt,
  PILLAR_CONFIG,
} from "./content-types";
import { TopicEntry, PUBLISHED_TOPICS } from "./content-topics";

// ============================================================
// Script Generation Engine for Your Body Explained
// ============================================================

function generateId(): string {
  return `ybe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Build the 4-part script structure from a topic
 */
function buildScript(topic: TopicEntry): ScriptSection[] {
  const scripts: Record<string, ScriptSection[]> = {
    // ── BODY FACTS ────────────────────────────────────────
    "Muscle memory — myonuclei never disappear": [
      { label: "HOOK", startTime: 0, endTime: 3, text: "Your muscles remember being strong. Even after years of not training." },
      { label: "TENSION", startTime: 3, endTime: 7, text: "You'd think when you stop lifting, you lose everything. But your body has a backup plan." },
      { label: "EXPLANATION", startTime: 7, endTime: 21, text: "When you build muscle, your body creates new nuclei inside each fiber — called myonuclei. And here's the thing: they never go away. Even after 15 years of inactivity, those nuclei stay dormant, waiting. The moment you start training again, they reactivate — making you regain muscle two to three times faster than someone starting fresh." },
      { label: "PUNCHLINE", startTime: 21, endTime: 28, text: "Your muscles never forgot. They're just waiting for you to come back. Follow for more." },
    ],
    "Your body replaces itself every 7-10 years": [
      { label: "HOOK", startTime: 0, endTime: 3, text: "Almost every cell in your body right now didn't exist ten years ago." },
      { label: "TENSION", startTime: 3, endTime: 7, text: "You think you're the same person you were a decade ago. Biologically, you're not even close." },
      { label: "EXPLANATION", startTime: 7, endTime: 21, text: "Your gut lining replaces itself every three to five days. Red blood cells last about four months. Your entire skeleton rebuilds every ten years. Even your skin is completely new every two to three weeks. The only cells that stick around for your whole life? Neurons and some heart muscle cells." },
      { label: "PUNCHLINE", startTime: 21, endTime: 28, text: "You are literally not the same person you were. Your body rebuilt you from scratch. Follow for more." },
    ],
    "Stretching doesn't prevent injuries — mobility does": [
      { label: "HOOK", startTime: 0, endTime: 3, text: "Static stretching before your workout might actually make you weaker." },
      { label: "TENSION", startTime: 3, endTime: 7, text: "Everything you were taught about warming up is probably wrong." },
      { label: "EXPLANATION", startTime: 7, endTime: 21, text: "Research shows static stretching before exercise can reduce your power output by up to five and a half percent. Your muscles get temporarily longer but also weaker. What actually prevents injuries? Dynamic mobility — movements that take your joints through full range of motion under control. Studies show it reduces injury risk by thirty percent." },
      { label: "PUNCHLINE", startTime: 21, endTime: 28, text: "Stop holding stretches before you lift. Move your joints instead. Follow for more." },
    ],
    "Your brain burns 20% of your daily calories": [
      { label: "HOOK", startTime: 0, endTime: 3, text: "Your brain weighs two percent of your body. But it burns twenty percent of your calories." },
      { label: "TENSION", startTime: 3, endTime: 7, text: "That's an insane amount of energy for an organ you can hold in both hands." },
      { label: "EXPLANATION", startTime: 7, endTime: 21, text: "Your brain runs almost entirely on glucose — consuming four hundred to five hundred calories every single day. It processes millions of signals per second, regulates your entire body, and never takes a break. Even when you sleep, your brain uses almost as much energy as when you're awake, consolidating memories and clearing waste." },
      { label: "PUNCHLINE", startTime: 21, endTime: 28, text: "Thinking is literally a workout. Your brain is the most expensive organ you own. Follow for more." },
    ],
    "Dehydration drops strength by 25%": [
      { label: "HOOK", startTime: 0, endTime: 3, text: "Losing just two percent of your body water kills your strength by twenty-five percent." },
      { label: "TENSION", startTime: 3, endTime: 7, text: "That's about one liter of sweat. Most people lose that in the first thirty minutes of training." },
      { label: "EXPLANATION", startTime: 7, endTime: 21, text: "Water isn't just for hydration — it's what makes your muscles contract. When you're dehydrated, blood volume drops, your heart works harder, and your muscles can't generate the same force. At just two percent loss, strength drops by a quarter. At three percent, your brain starts slowing down too — reaction time, focus, decision-making, all compromised." },
      { label: "PUNCHLINE", startTime: 21, endTime: 28, text: "If you're not drinking during your workout, you're leaving gains on the floor. Follow for more." },
    ],
    "Sleep deprivation mimics being drunk": [
      { label: "HOOK", startTime: 0, endTime: 3, text: "Twenty-four hours without sleep makes you react like you're legally drunk." },
      { label: "TENSION", startTime: 3, endTime: 7, text: "You wouldn't drive after six drinks. But you'll pull an all-nighter and call it productivity." },
      { label: "EXPLANATION", startTime: 7, endTime: 21, text: "After just seventeen hours awake, your reaction time matches someone with a zero-point-zero-five blood alcohol level. At twenty-four hours, it's zero-point-ten — legally drunk in every state. Your prefrontal cortex — the part that makes decisions — basically goes offline. Muscle recovery drops, testosterone drops, and your injury risk skyrockets." },
      { label: "PUNCHLINE", startTime: 21, endTime: 28, text: "Sleep isn't optional. It's the most powerful performance drug that's completely free. Follow for more." },
    ],
    // ── NUTRITION MYTHS ───────────────────────────────────
    "The protein timing window is mostly a myth": [
      { label: "HOOK", startTime: 0, endTime: 3, text: "You don't need to chug a protein shake within thirty minutes of your last rep." },
      { label: "TENSION", startTime: 3, endTime: 7, text: "The 'anabolic window' panic was built on outdated science. Here's what actually matters." },
      { label: "EXPLANATION", startTime: 7, endTime: 21, text: "The idea that you must consume protein immediately after training comes from studies on fasted subjects. For most people who eat normally, the real window is four to six hours — not thirty minutes. What actually drives muscle growth is your total daily protein intake. Hit your target across the day, and timing becomes almost irrelevant." },
      { label: "PUNCHLINE", startTime: 21, endTime: 28, text: "Stop stressing about the clock. Just hit your daily protein. That's what builds muscle. Follow for more." },
    ],
    "Detox diets don't work — your liver does": [
      { label: "HOOK", startTime: 0, endTime: 3, text: "Your body already has the most advanced detox system money can't buy." },
      { label: "TENSION", startTime: 3, endTime: 7, text: "Yet people spend billions on juice cleanses that do literally nothing." },
      { label: "EXPLANATION", startTime: 7, endTime: 21, text: "Your liver processes one-point-four liters of blood every single minute. It breaks down toxins, metabolizes drugs, filters waste — twenty-four-seven, without a single day off. Your kidneys filter your entire blood supply thirty times a day. No celery juice, activated charcoal, or three-day cleanse can do what these organs already do for free." },
      { label: "PUNCHLINE", startTime: 21, endTime: 28,
