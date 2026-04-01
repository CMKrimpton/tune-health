/**
 * Curated editorial collections — themed reading lists.
 * Manually curated (not algorithmic). Update slugs when adding articles.
 */

export interface CuratedCollection {
  slug: string;
  title: string;
  description: string;
  longDescription: string;
  gradient: { bg: string; pattern: string };
  articleSlugs: string[];
}

export const COLLECTIONS: CuratedCollection[] = [
  {
    slug: 'your-body-is-lying-to-you',
    title: 'Your Body Is Lying to You',
    description: 'When symptoms, tests, and conventional wisdom don\'t tell the full story.',
    longDescription: 'Standard lab ranges, generic diagnoses, and "normal" results hide a lot. These articles expose the gaps between what your body signals, what doctors test for, and what\'s actually going on — from thyroid dysfunction to metabolic deception.',
    gradient: {
      bg: 'linear-gradient(135deg, #3b0764 0%, #581c87 40%, #7e22ce 100%)',
      pattern: 'radial-gradient(circle at 30% 70%, rgba(196,181,253,0.1) 0%, transparent 50%)',
    },
    articleSlugs: [
      'thyroid-poisoned-well',
      'thyroid-levels-metabolic-engine',
      'your-doctor-cant-answer-that',
      'testosterone-decline-young-men-causes',
      'beyond-glucose-standard-metabolic-tests-miss-danger',
      'obesity-paradox-thin-metabolic-health',
    ],
  },
  {
    slug: 'the-invisible-exposures',
    title: 'The Invisible Exposures',
    description: 'The chemicals and pollutants shaping your health without your knowledge.',
    longDescription: 'You can\'t see PFAS in your water, microplastics in your blood, or pesticide residue in your food — but your body registers all of it. These articles investigate what we\'re exposed to, what the science says about the risks, and why regulation keeps falling behind.',
    gradient: {
      bg: 'linear-gradient(135deg, #78350f 0%, #92400e 40%, #b45309 100%)',
      pattern: 'radial-gradient(circle at 40% 60%, rgba(251,191,36,0.1) 0%, transparent 50%)',
    },
    articleSlugs: [
      'microplastics-brain',
      'pfas-forever-chemicals-adolescent-bone-density-development',
      'chlorpyrifos-parkinsons-risk-autophagy-mechanism',
      'fluoride-debate-science-lost',
      'allergy-epidemic-pollution-microbiome-pollen',
      'nonstick-cookware-pfas-health-risks',
    ],
  },
  {
    slug: 'follow-the-money',
    title: 'Follow the Money',
    description: 'When industry funding shapes the science you\'re told to trust.',
    longDescription: 'From pharmaceutical trial design to dietary guidelines written by food industry lobbyists, money shapes health science in ways most people never see. These articles trace the funding, the conflicts of interest, and the gaps between what research says and what you\'re told.',
    gradient: {
      bg: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 40%, #dc2626 100%)',
      pattern: 'radial-gradient(circle at 60% 30%, rgba(252,165,165,0.1) 0%, transparent 50%)',
    },
    articleSlugs: [
      'adhd-stimulant-trials-withdrawal-relapse-design-flaw',
      'gatorade-hydration-science-sports-drink-industry-bias',
      'alcohol-liver-damage-industry-funded-science',
      'us-drug-pricing-why-americans-pay-more',
      'dietary-guidelines-industry-influence',
      'supplement-regulation-dshea-fda-failure',
    ],
  },
  {
    slug: 'brain-deep-cuts',
    title: 'Brain Deep Cuts',
    description: 'Neuroscience that changes how you think about thinking.',
    longDescription: 'The brain isn\'t a computer. It\'s messier, stranger, and more interesting than any metaphor. These articles go deep on the mechanisms — from how your vagus nerve runs your body to why creativity isn\'t what you think it is.',
    gradient: {
      bg: 'linear-gradient(135deg, #0c4a6e 0%, #1e3a5f 40%, #164e63 100%)',
      pattern: 'radial-gradient(circle at 70% 30%, rgba(56,189,248,0.12) 0%, transparent 50%)',
    },
    articleSlugs: [
      'vagus-nerve',
      'blood-brain-barrier',
      'creativity',
      'intelligence',
      'early-life-stress-gut-brain-pathways',
      'empathy-dark-side-neuroscience',
    ],
  },
  {
    slug: 'the-sleep-files',
    title: 'The Sleep Files',
    description: 'Everything you think you know about sleep is probably wrong.',
    longDescription: 'Blue light glasses don\'t work. Melatonin supplements are mislabeled. Your sleep tracker might be giving you insomnia. These articles dismantle the sleep-industrial complex and replace it with what the evidence actually supports.',
    gradient: {
      bg: 'linear-gradient(135deg, #1e1b4b 0%, #1e3a5f 40%, #312e81 100%)',
      pattern: 'radial-gradient(circle at 60% 30%, rgba(129,140,248,0.1) 0%, transparent 50%)',
    },
    articleSlugs: [
      'biphasic-sleep-history-insomnia',
      'blue-light-glasses-sleep-myth-debunked',
      'caffeine-quarter-life-sleep-architecture',
      'sleep-tracker-accuracy-orthosomnia',
      'melatonin-supplement-contamination-dosage-accuracy',
      'sleep-white-matter-dementia-glymphatic',
    ],
  },
];

export function getCollectionBySlug(slug: string): CuratedCollection | undefined {
  return COLLECTIONS.find((c) => c.slug === slug);
}

export function getAllCollections(): CuratedCollection[] {
  return COLLECTIONS;
}
