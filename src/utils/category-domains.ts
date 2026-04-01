/**
 * Category domain groupings and editorial metadata.
 * Groups the flat category list into editorial domains for navigation.
 */

export interface CategoryDomain {
  id: string;
  label: string;
  description: string;
  iconPath: string; // SVG path data for a 24x24 viewBox
  categories: string[];
}

export const CATEGORY_DOMAINS: CategoryDomain[] = [
  {
    id: 'mind',
    label: 'Mind',
    description: 'Neuroscience, sleep, and mental health.',
    iconPath: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
    categories: ['Neuroscience', 'Mental Health', 'Sleep Science'],
  },
  {
    id: 'body',
    label: 'Body',
    description: 'Movement, fuel, and the long game.',
    iconPath: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    categories: ['Nutrition', 'Fitness', 'Longevity'],
  },
  {
    id: 'medicine',
    label: 'Medicine',
    description: 'Clinical evidence and pharmacology.',
    iconPath: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
    categories: ['Clinical Evidence', 'Pharmacology'],
  },
  {
    id: 'environment',
    label: 'Environment',
    description: 'What surrounds you shapes you.',
    iconPath: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    categories: ['Environmental Health'],
  },
];

/**
 * Editorial metadata for each category — used in landing pages and dropdown.
 */
export const CATEGORY_META: Record<string, { tagline: string; description: string }> = {
  'Neuroscience': {
    tagline: 'Your brain, explained',
    description: 'From the vagus nerve to the blood-brain barrier, we translate neuroscience research into language that sticks. No oversimplifications, no hype — just what the data shows about how your brain works.',
  },
  'Mental Health': {
    tagline: 'The mind under the microscope',
    description: 'ADHD, emotional dysregulation, childhood adversity — we cover the neurobiology and clinical evidence behind mental health, not the self-help platitudes.',
  },
  'Sleep Science': {
    tagline: 'The third of your life that runs the rest',
    description: 'Biphasic sleep, orthosomnia, blue light myths — what the evidence says about rest, recovery, and why your tracker might be making things worse.',
  },
  'Nutrition': {
    tagline: 'Beyond the headline diet',
    description: 'Fiber, protein traps, metabolic flexibility — we follow the evidence on what you eat, how your body processes it, and which health claims survive peer review.',
  },
  'Fitness': {
    tagline: 'What actually moves the needle',
    description: 'HIIT, resistance training, bone density — the mechanisms behind exercise science, from mitochondrial biogenesis to real-world outcomes.',
  },
  'Longevity': {
    tagline: 'Aging is biology, not destiny',
    description: 'Senolytics, nitric oxide, metabolic reprogramming — tracking the evidence on healthspan extension, from cellular mechanisms to interventions you can assess right now.',
  },
  'Clinical Evidence': {
    tagline: 'What the data actually says',
    description: 'We read the trials so you don\'t have to. Study designs, sample sizes, and conflict-of-interest disclosures — what the research actually supports, and where the gaps are.',
  },
  'Pharmacology': {
    tagline: 'The molecules and the money',
    description: 'Drug trials, withdrawal mechanisms, non-opioid painkillers — what compounds do, who funded the studies, and what your doctor may not tell you.',
  },
  'Environmental Health': {
    tagline: 'The invisible exposures',
    description: 'PFAS, microplastics, chlorpyrifos, fluoride — investigating the chemicals, pollutants, and allergens shaping public health outcomes.',
  },
};

/**
 * Get the domain a category belongs to.
 */
export function getDomainForCategory(category: string): CategoryDomain | undefined {
  return CATEGORY_DOMAINS.find((d) => d.categories.includes(category));
}

/**
 * Convert a category name to a URL slug (kebab-case).
 */
export function getCategorySlug(category: string): string {
  return category.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Reverse lookup: URL slug → exact category name.
 */
export function getCategoryFromSlug(slug: string): string | undefined {
  const slugLower = slug.toLowerCase();
  for (const domain of CATEGORY_DOMAINS) {
    for (const cat of domain.categories) {
      if (getCategorySlug(cat) === slugLower) return cat;
    }
  }
  return undefined;
}
