/**
 * Funnel configuration — maps article categories to alumi Health app features.
 * Single source of truth for all CTA copy, deep links, and UTM tracking.
 */

export const APP_URL = 'https://tune-sigma.vercel.app';

export interface FunnelCTA {
  headline: string;
  description: string;
  featureName: string;
  icon: 'lab' | 'meal' | 'ai' | 'experiment';
  appPath: string;
}

const CATEGORY_FEATURE_MAP: Record<string, FunnelCTA> = {
  'Neuroscience': {
    headline: 'Ask your AI health analyst',
    description: 'Claude Opus analyzes health questions with three communication styles. Go deeper on what you just read.',
    featureName: 'AI Health Analyst',
    icon: 'ai',
    appPath: '/dashboard',
  },
  'Mental Health': {
    headline: 'Talk to your health AI about this',
    description: 'Get personalized analysis of mental health topics from Claude Opus, tailored to your communication style.',
    featureName: 'AI Health Analyst',
    icon: 'ai',
    appPath: '/dashboard',
  },
  'Nutrition': {
    headline: 'Photograph your next meal',
    description: '80+ micronutrients identified from a single photo. See what you are actually eating.',
    featureName: 'Meal Analysis',
    icon: 'meal',
    appPath: '/dashboard',
  },
  'Longevity': {
    headline: 'Upload your bloodwork',
    description: '459 biomarkers across 16 clinical categories. 99% accuracy. Know exactly where you stand.',
    featureName: 'Lab Results',
    icon: 'lab',
    appPath: '/dashboard',
  },
  'Clinical Evidence': {
    headline: 'See your own biomarkers',
    description: 'Upload lab results and get instant analysis of 459 biomarkers. Evidence-based, not guesswork.',
    featureName: 'Lab Results',
    icon: 'lab',
    appPath: '/dashboard',
  },
  'Sleep Science': {
    headline: 'Run your own sleep experiment',
    description: 'Design personal experiments, track variables, and see what actually works for your sleep.',
    featureName: 'N=1 Experiments',
    icon: 'experiment',
    appPath: '/dashboard',
  },
  'Fitness': {
    headline: 'Test it on yourself',
    description: 'N=1 experiments let you track training variables and measure what actually moves the needle.',
    featureName: 'N=1 Experiments',
    icon: 'experiment',
    appPath: '/dashboard',
  },
  'Environmental Health': {
    headline: 'Check your exposure markers',
    description: 'Upload bloodwork to track inflammatory and environmental biomarkers across 16 clinical categories.',
    featureName: 'Lab Results',
    icon: 'lab',
    appPath: '/dashboard',
  },
  'Pharmacology': {
    headline: 'Ask your AI about drug interactions',
    description: 'Claude Opus reviews pharmacology questions with clinical-grade analysis. Three communication styles.',
    featureName: 'AI Health Analyst',
    icon: 'ai',
    appPath: '/dashboard',
  },
  'Research Summary': {
    headline: 'Go deeper with AI analysis',
    description: 'Ask follow-up questions about this research. Claude Opus provides evidence-based, balanced responses.',
    featureName: 'AI Health Analyst',
    icon: 'ai',
    appPath: '/dashboard',
  },
};

const DEFAULT_CTA: FunnelCTA = {
  headline: 'Track your health with AI',
  description: 'Lab results, meal analysis, and personal experiments — powered by Claude Opus.',
  featureName: 'alumi Health',
  icon: 'ai',
  appPath: '/dashboard',
};

/**
 * Get the CTA config for an article category
 */
export function getCTAForCategory(category: string): FunnelCTA {
  return CATEGORY_FEATURE_MAP[category] || DEFAULT_CTA;
}

interface UTMParams {
  source?: string;
  medium: string;
  campaign?: string;
  content?: string;
}

/**
 * Build an app link with UTM tracking parameters
 */
export function getAppLink(path: string, utm: UTMParams): string {
  const params = new URLSearchParams({
    utm_source: utm.source || 'alumi-news',
    utm_medium: utm.medium,
  });

  if (utm.campaign) params.set('utm_campaign', utm.campaign);
  if (utm.content) params.set('utm_content', utm.content);

  return `${APP_URL}${path}?${params.toString()}`;
}
