import { TopicEntry } from "./content-types";
export type { TopicEntry };

// ============================================================
// Pre-approved topic bank for Your Body Explained
// ============================================================

export const PUBLISHED_TOPICS = [
  "EPOC — muscles burn calories for 72 hours",
  "Eating before bed doesn't make you fat",
  "Your resting heart rate is warning you",
  "Sugar cravings — gut microbiome",
  "6 meals a day is a lie",
  "20% stronger at 4pm than 8am",
  "3 pounds overnight — not fat",
  "Every injury warns you before it happens",
];

export const TOPIC_BANK: TopicEntry[] = [
  // ── Body Facts ──────────────────────────────────────────
  {
    topic: "Muscle memory — myonuclei never disappear",
    pillar: "body-facts",
    oneLiner: "Your muscles literally remember being strong — even years later.",
    keyFact: "Myonuclei gained during training persist for 15+ years, making regaining muscle 2-3x faster.",
    sourceHint: "Gundersen 2016, Journal of Experimental Biology",
    used: false,
  },
  {
    topic: "Your body replaces itself every 7-10 years",
    pillar: "body-facts",
    oneLiner: "Almost every cell in your body right now didn't exist 10 years ago.",
    keyFact: "Red blood cells last ~120 days, gut lining replaces every 3-5 days, skeleton every 10 years.",
    sourceHint: "Spalding et al. 2005, Cell",
    used: false,
  },
  {
    topic: "Stretching doesn't prevent injuries — mobility does",
    pillar: "body-facts",
    oneLiner: "Static stretching before a workout might actually make you weaker.",
    keyFact: "Static stretching reduces power output by up to 5.5%. Dynamic mobility reduces injury risk by 30%.",
    sourceHint: "Behm & Chaouachi 2011, European Journal of Applied Physiology",
    used: false,
  },
  {
    topic: "Your brain burns 20% of your daily calories",
    pillar: "body-facts",
    oneLiner: "Your brain weighs 2% of your body but eats 20% of your fuel.",
    keyFact: "The brain consumes ~400-500 calories/day, primarily from glucose.",
    sourceHint: "Raichle & Gusnard 2002, PNAS",
    used: false,
  },
  {
    topic: "Dehydration drops strength by 25%",
    pillar: "body-facts",
    oneLiner: "Losing just 2% of your body water tanks your performance.",
    keyFact: "2% dehydration = 25% strength loss. 3% = measurable cognitive decline.",
    sourceHint: "Judelson et al. 2007, Sports Medicine",
    used: false,
  },
  {
    topic: "Sleep deprivation mimics being drunk",
    pillar: "body-facts",
    oneLiner: "24 hours without sleep = the same reaction time as a 0.10% BAC.",
    keyFact: "17 hours awake equals 0.05% BAC; 24 hours equals 0.10% — legally drunk in every US state.",
    sourceHint: "Williamson & Feyer 2000, Occupational and Environmental Medicine",
    used: false,
  },

  // ── Nutrition Myths ─────────────────────────────────────
  {
    topic: "The protein timing window is mostly a myth",
    pillar: "nutrition-myths",
    oneLiner: "You don't need to chug a shake within 30 minutes of your last rep.",
    keyFact: "The 'anabolic window' extends 4-6 hours. Total daily protein matters far more than timing.",
    sourceHint: "Schoenfeld et al. 2013, Journal of ISSN",
    used: false,
  },
  {
    topic: "Detox diets don't work — your liver does",
    pillar: "nutrition-myths",
    oneLiner: "Your body already has the most advanced detox system money can't buy.",
    keyFact: "The liver processes 1.4 liters of blood per minute, neutralizing toxins 24/7. No juice cleanse needed.",
    sourceHint: "Klein & Kiat 2015, Journal of Human Nutrition and Dietetics",
    used: false,
  },
  {
    topic: "Brown vs white rice — almost no difference",
    pillar: "nutrition-myths",
    oneLiner: "Brown rice isn't the superfood you were told it is.",
    keyFact: "The calorie and macro difference is less than 5%. Brown rice has slightly more fiber — about 1g more per serving.",
    sourceHint: "USDA FoodData Central",
    used: false,
  },
  {
    topic: "Sugar doesn't cause hyperactivity",
    pillar: "nutrition-myths",
    oneLiner: "The sugar-hyperactivity link has been debunked for over 20 years.",
    keyFact: "A meta-analysis of 16 studies found zero connection between sugar intake and hyperactive behavior in children.",
    sourceHint: "Wolraich et al. 1995, JAMA",
    used: false,
  },
  {
    topic: "Supplements most people waste money on",
    pillar: "nutrition-myths",
    oneLiner: "90% of the supplement industry sells you expensive urine.",
    keyFact: "Multivitamins, BCAAs, and fat burners show no benefit in people with adequate diets. Only creatine, vitamin D, and omega-3s have strong evidence.",
    sourceHint: "Guallar et al. 2013, Annals of Internal Medicine",
    used: false,
  },

  // ── Hidden Signals ──────────────────────────────────────
  {
    topic: "HRV predicts your readiness to train",
    pillar: "hidden-signals",
    oneLiner: "Your heart rate variability tells you when to push hard and when to rest.",
    keyFact: "Higher HRV = better recovery = green light to train. A 10% drop in baseline HRV means your nervous system is still recovering.",
    sourceHint: "Plews et al. 2013, International Journal of Sports Physiology",
    used: false,
  },
  {
    topic: "Your grip strength predicts your lifespan",
    pillar: "hidden-signals",
    oneLiner: "How hard you can squeeze predicts how long you'll live.",
    keyFact: "Every 5kg decrease in grip strength = 17% higher mortality risk. It's a better predictor than blood pressure.",
    sourceHint: "Leong et al. 2015, The Lancet",
    used: false,
  },
  {
    topic: "Morning soreness vs real injury — how to tell",
    pillar: "hidden-signals",
    oneLiner: "Your body gives you different pain signals — most people ignore the wrong ones.",
    keyFact: "DOMS (muscle soreness) is bilateral and improves with movement. Injury pain is sharp, localized, and gets worse.",
    sourceHint: "Cheung et al. 2003, Sports Medicine",
    used: false,
  },
  {
    topic: "Your sleep architecture changes when you overtrain",
    pillar: "hidden-signals",
    oneLiner: "Overtraining doesn't just make you tired — it destroys your deep sleep.",
    keyFact: "Overtrained athletes lose up to 40% of their deep sleep (N3 stage), which is when growth hormone peaks.",
    sourceHint: "Hausswirth et al. 2014, Medicine & Science in Sports",
    used: false,
  },
  {
    topic: "Chronic fatigue isn't laziness — it's a signal",
    pillar: "hidden-signals",
    oneLiner: "If you're always tired despite sleeping enough, your body is trying to tell you something.",
    keyFact: "Persistent fatigue can signal iron deficiency (affects 25% of people), thyroid issues, or chronic overtraining syndrome.",
    sourceHint: "Meeusen et al. 2013, European Journal of Sport Science",
    used: false,
  },
];

/**
 * Get next topic based on pillar rotation
 * Weekly plan: 3 Body Facts, 2 Nutrition Myths, 2 Hidden Signals
 */
export function getNextTopic(dayOfWeek: number, excludeTopics: string[] = []): TopicEntry | null {
  // Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=0
  const pillarRotation: Record<number, string> = {
    1: "body-facts",        // Monday
    2: "hidden-signals",    // Tuesday
    3: "nutrition-myths",   // Wednesday
    4: "body-facts",        // Thursday
    5: "hidden-signals",    // Friday
    6: "body-facts",        // Saturday
    0: "nutrition-myths",   // Sunday
  };

  const targetPillar = pillarRotation[dayOfWeek];
  const available = TOPIC_BANK.filter(
    t => t.pillar === targetPillar && !t.used && !excludeTopics.includes(t.topic)
  );

  return available.length > 0 ? available[0] : null;
}

export function getTopicsByPillar(pillar: string): TopicEntry[] {
  return TOPIC_BANK.filter(t => t.pillar === pillar && !t.used);
}
