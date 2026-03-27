# alumi news — Newsletter Strategy

> **The health newsletter that follows the money.**
>
> A 3x/week editorial newsletter powered by the same AI newsroom that produces alumi news — investigating who funds the science, who profits from the advice, and what the evidence actually says. Every edition funnels readers toward the alumi Health app.

---

## Why Now

The open web is collapsing. Google search traffic is down 33% globally, 38% in the US. AI Overviews have caused a 61% drop in organic click-through rates. Publishers forecast a further 40% decline over the next three years. The era of "publish and they will come" is over.

Newsletters are the counter-move. They guarantee inbox delivery. No algorithm can suppress them. No AI overview can replace them. And in health — one of the highest-engagement email niches at 47.8% open rates — they're worth more per subscriber than almost any other category.

We already have the hardest part: a content engine producing 2-3 editorial-quality articles per day at $0.06 each, with multi-model AI research, adversarial independence review, and human writing. The newsletter is a distribution layer on top of infrastructure that already exists.

---

## The Product

### Three editions per week, plus breaking alerts.

**MONDAY — The Briefing**

The anchor. A curated look at the most important health stories, not a link dump. Structured for a 5-minute read:

- **The Lead** — the single most important health story of the week, summarized with the "so what" that nobody else is saying
- **The Money Trail** — a recurring one-liner: "This week, [organization] received $X from [company] to [do what]." Every single week. This becomes the franchise
- **3-4 Article Picks** — the best from the week, each with a one-line editor note on why it matters. Independence scores visible ("Scored 8/10 for editorial independence")
- **The Counter** — one widely-held health belief that was challenged this week, in one sentence
- **Reader Poll** — "What do you think: should the AHA disclose industry funding on dietary guidelines?" Results published next Friday. Builds engagement, generates data
- **alumi Health CTA** — contextual to the lead article. "This article on seed oil inflammation? alumi Health tracks your omega-6/omega-3 ratio from your lab results"

**WEDNESDAY — The Exclusive**

Newsletter-only content that never appears on the website. This is the reason to subscribe, not just bookmark. Rotates between four formats:

- **Editor's Verdict** — Carl's personal take on a trending health debate. 500 words, opinionated, signed
- **What We're Investigating** — preview of upcoming articles. Creates anticipation, makes readers feel like insiders
- **Reader Question** — one subscriber question answered with real evidence. Builds community and generates article ideas
- **The Funding Map** — who funded what in health this month. Unique editorial IP that no other newsletter compiles

**FRIDAY — Fresh Takes**

The weekend prep. What's new, what happened, what to read:

- **New Articles** — everything published this week with one-sentence summaries
- **Poll Results** — Monday's poll, visualized. "73% of you said yes — here's what the evidence says"
- **Weekend Read** — one recommendation from outside alumi (builds credibility by curating broadly)
- **"What should we investigate next?"** — reader input that feeds the scout system

**BREAKING ALERTS** (max 2/week)

When the pinger detects genuinely breaking health news — FDA action, major study, health policy change — subscribers get it in their inbox before it's even on the website.

- Maximum 2 per week. Scarcity = trust
- Arrives 30 minutes before the article goes live. Subscribers are insiders
- Three paragraphs max. Link to full article when it publishes
- Subject line: "BREAKING: [one sentence]" — no clickbait, just facts

---

## The Funnel

The newsletter is not the product. The alumi Health app is the product. The newsletter is the trust bridge.

```
DISCOVERY                    RELATIONSHIP                 CONVERSION
   |                              |                            |
Google / Social / Referral   Newsletter (3x/week)        alumi Health App
   |                              |                            |
   v                              v                            v
Website article              Habit + Trust               AI health tracking
(first impression)           (consistent value)          Lab OCR, meal analysis
   |                              |                       N=1 experiments
   +------- Subscribe CTA -------+                            |
                                  |                            |
                           Contextual app CTA                  |
                           in every edition  --------->--------+
```

**Every newsletter edition includes a contextual app CTA.** Not generic "download our app" — the CTA is mapped to the article topic:

| Article Topic | App CTA |
|--------------|---------|
| Seed oil inflammation | "Track your omega-6/omega-3 ratio from your lab results" |
| Sleep science | "Analyze your sleep patterns with AI-powered tracking" |
| Supplement evidence | "Scan your supplement labels — alumi Health checks the evidence" |
| Metabolic health | "Upload your blood work — AI identifies metabolic red flags" |
| Mental health | "Track mood, sleep, and nutrition correlations over time" |

This mapping already exists in the codebase (`src/utils/funnel.ts`) and powers the website's article CTAs. The newsletter extends it to email.

---

## The Moat

### Why this is hard to copy.

**1. The AI newsroom pipeline.**
Six different AI models handle research, editorial judgment, adversarial review, fact-checking, and publishing. A human writes every article with the best available AI writing tool. No other health newsletter has this infrastructure. Total cost per article: $0.06.

**2. Breaking alerts require infrastructure.**
The pinger system scans Google Search, X/Twitter, and PubMed's top 10 journals every 15 minutes for breaking health news. When it fires, the pipeline can produce a full article in under 5 minutes. Traditional newsletters take days. AI-only newsletters lack editorial credibility. We have both.

**3. "Follow the money" is a franchise.**
No health newsletter consistently tracks industry funding of health science. Making The Money Trail a weekly recurring section creates brand identity that's impossible to commoditize. Over time, this becomes a database of industry influence — a unique asset.

**4. The independence score is a trust signal.**
Every article is adversarially reviewed by Grok (a different AI provider than the writer) for institutional deference, pharma framing, missing money trails, and pulled punches. The score is visible to readers. This level of editorial transparency is unprecedented in health media — and it's automated.

**5. The app funnel is the business model.**
Unlike newsletters that need to monetize through ads alone, every subscriber is a potential alumi Health user. The newsletter pays for itself not through ad revenue (though that's there too) but through app conversions. This means we can be more selective about sponsors, more aggressive about quality, and less desperate about growth hacks.

---

## The Platform

### Beehiiv — the same platform The Dailies uses at 150,000+ subscribers.

| Feature | What it does for us |
|---------|-------------------|
| **Referral Program** | Built-in viral growth. Subscribers share unique links. Reward tiers drive organic acquisition. Average 17% growth boost |
| **Recommendation Network** | Other newsletters recommend us to their subscribers when they sign up. 2.75x faster growth |
| **Ad Network** | Passive revenue from vetted advertisers. Supplements the app funnel |
| **Analytics** | Open rates, click-through, subscriber engagement scoring. Tells us what content drives app signups |
| **Automations** | Welcome sequence, re-engagement flows, segment-based campaigns |
| **A/B Testing** | Test subject lines, CTAs, send times. Optimize for opens and app conversions |
| **API** | Programmatic subscriber management. Connect to our pipeline |
| **CAN-SPAM/GDPR** | Built-in compliance. Unsubscribe, double opt-in, all handled |

**Cost:** Scale plan at $43/month (includes referral program, ad network, A/B testing). Pricing scales with subscriber count.

---

## The Business Model

### Phase 1: Growth (0–10,000 subscribers)

- **Newsletter is free.** No premium tier yet
- **Revenue: $0 from newsletter** (and that's fine — the newsletter is a funnel, not the product)
- **Focus:** subscriber acquisition, referral program, recommendation network, content quality
- **App funnel:** every edition drives toward alumi Health
- **Metric that matters:** newsletter → app conversion rate

### Phase 2: Monetization (10,000+ subscribers)

- **Beehiiv Ad Network:** passive, automated, vetted advertisers. At 10K subscribers with 48% opens, estimated $1,700–2,900/month from a single ad slot at 3x/week
- **Direct sponsors:** one carefully vetted sponsor per weekly edition. Full transparency: "This week's edition is supported by [brand]. Here's what we verified about their claims." Radical honesty as monetization
- **App conversions:** the primary revenue driver. Newsletter subscribers convert to app users at higher rates than organic traffic because trust is pre-built
- **Metric that matters:** revenue per subscriber (ads + app conversions)

### Phase 3: Expansion (25,000+ subscribers)

- **Bundle strategy:** launch "alumi Wealth" companion newsletter — same editorial philosophy ("Evidence. Wherever it leads.") applied to personal finance. Same anti-establishment angle. Same pipeline infrastructure. Bundle signup doubles value proposition
- **Premium tier (if warranted):** breaking alerts + Wednesday exclusive + 30-min early access. $8/month or $80/year. Only if the economics justify it over free + ads
- **Events:** live "Follow the Money" investigations, Q&A sessions, expert panels
- **Metric that matters:** total funnel value (newsletter → app → retention → LTV)

---

## The Numbers

| Metric | Health/Wellness Benchmark | Our Target |
|--------|--------------------------|------------|
| Open rate | 47.8% | 50%+ (niche authority premium) |
| Click-through rate | 4-6% | 8%+ (strong CTAs, exclusive content) |
| Referral growth boost | 17% average | 20%+ (compelling referral rewards) |
| Free → paid conversion | 5-10% | N/A initially (free model) |
| Monthly churn | 4% | <3% (high-value exclusive content) |
| Ad CPM (health/wellness) | $30-50 | $40+ (premium niche, high engagement) |
| Newsletter → app conversion | No benchmark | 2-5% (our unique metric) |

### Revenue Projections (ad-only, conservative)

| Subscribers | Opens/send | Ad revenue/month | Annual |
|-------------|-----------|-------------------|--------|
| 5,000 | 2,400 | $850-1,450 | $10K-17K |
| 10,000 | 4,800 | $1,700-2,900 | $20K-35K |
| 25,000 | 12,000 | $4,300-7,200 | $52K-86K |
| 50,000 | 24,000 | $8,600-14,400 | $103K-173K |
| 100,000 | 48,000 | $17,300-28,800 | $207K-346K |

*Based on 3 sends/week, 1 ad slot per send, $30-50 CPM. Does not include direct sponsors (2-5x higher CPM) or app conversion revenue.*

---

## The Competitive Advantage

| Us | Them |
|----|------|
| Multi-model AI newsroom producing 2-3 articles/day | Manual curation or single-model AI slop |
| Human writes every article with Opus | AI-generated or freelancer variable quality |
| Adversarial independence review (Grok 4) | No editorial QA, or same-model self-review |
| Breaking alerts in minutes | Breaking alerts in hours/days |
| "Follow the money" as editorial franchise | Generic health advice |
| Independence scores as trust signals | "Trust us" |
| App funnel as primary business model | Ad-dependent or paywall-dependent |
| $0.06 per article production cost | $50-500 per article (freelancers/staff) |

---

## Implementation Timeline

**Week 1:** Set up Beehiiv account, configure branding, migrate existing subscribers, update website subscribe forms

**Week 2:** Design email templates for each edition type. Set up referral program. Write and send first Monday Briefing

**Week 3:** First full week of 3x cadence (Mon/Wed/Fri). Set up recommendation network. First breaking alert test

**Week 4:** Analyze first month metrics. Optimize subject lines (A/B test). Adjust content mix based on engagement data

**Ongoing:** Pipeline auto-curates content. Human curates the newsletter. Referral and recommendation network drives growth. Every edition funnels to the app.

---

## Competitive Landscape

*All subscriber counts, pricing, and revenue figures verified via web search, March 2026.*

### The Major Players

#### STAT News — The industry incumbent
- **196,000+** newsletter subscribers. **30,000+** paying STAT+ members
- **$39/month** or **$399/year** for STAT+ (premium tier)
- **~$20M revenue**, 100 staff, subscriptions nearing 50% of revenue
- **Cadence:** Multiple daily newsletters (Morning Rounds, Health Tech, Pharma, etc.)
- **Audience:** Healthcare professionals, pharma executives, biotech investors, policy makers
- **Strengths:** Deep, original reporting. Pulitzer-caliber journalism. Institutional credibility. Strong paywall economics
- **Weaknesses:** Expensive ($399/yr prices out consumers). Industry insider tone — written for pharma execs, not for a 28-year-old wondering if their seed oil is killing them. No adversarial review process. No transparency into editorial independence
- **Sources:** [Adweek](https://www.adweek.com/media/stat-news-medical-subscribers/), [Nieman Lab](https://www.niemanlab.org/2018/10/stat-with-subscriptions-nearing-50-percent-of-revenue-looks-to-big-companies-for-more-members/), [STAT](https://www.statnews.com/signup/)

#### Huberman Lab Neural Network — The wellness giant
- **800,000+** newsletter subscribers
- **Free**, monthly cadence
- **Audience:** Biohackers, health optimizers, podcast listeners (18-45)
- **Content:** Neuroscience-backed protocols — actionable health steps distilled from podcast episodes
- **Strengths:** Massive reach. Strong personal brand. Genuinely useful protocols. Free
- **Weaknesses:** Entirely personality-driven (one person = single point of failure). Protocol-focused, not investigative — tells you what to do but doesn't question who profits from the advice. Monthly cadence is too infrequent for habit formation. No editorial independence framework. Faced credibility challenges in 2024
- **Source:** [Huberman Lab](https://www.hubermanlab.com/newsletter)

#### Healthcare Brew (Morning Brew) — The industry digest
- **100,000+** subscribers. Part of Morning Brew family (4M+ total across all Brews)
- **Free**, ad-supported, **2x/week**
- **Audience:** Healthcare administrators, providers, industry professionals
- **Content:** Healthcare industry news — policy, startups, pharma, tech. "No long articles or fluff"
- **Strengths:** Clean format. Strong brand halo from Morning Brew. Free. Industry-vetted advertisers
- **Weaknesses:** Industry-facing, not consumer health. You won't find "is your seed oil killing you" — you'll find "Q3 hospital reimbursement trends." No editorial opinion or investigation. No app funnel. Template voice, not distinctive
- **Sources:** [Healthcare Brew](https://www.healthcare-brew.com/subscribe), [Talking Biz News](https://talkingbiznews.com/media-news/how-healthcare-brew-reached-100000-subscriptions/)

#### Axios Vitals — The policy wire
- Part of Axios (22 newsletters, **2.5M subscribers** total)
- **Free**, daily (Mon-Fri)
- **Audience:** Policy wonks, healthcare industry, Hill staffers
- **Content:** Health policy, healthcare business, regulatory updates. Classic Axios "smart brevity" format
- **Strengths:** Daily. Authoritative on policy. Clean, scannable format
- **Weaknesses:** Policy-focused, not consumer health. Zero editorial voice — deliberately neutral. Doesn't investigate, just reports. No investigation into industry funding
- **Source:** [Axios Vitals](https://www.axios.com/signup/vitals)

### The Niche Players

#### ZOE / Tim Spector (Gut Feelings)
- **130,000+** ZOE program members (separate from Substack newsletter)
- **Substack** newsletter, free
- **Audience:** Health-conscious consumers interested in gut health and nutrition
- **Content:** Personalized nutrition, microbiome science, food as medicine
- **Strengths:** Strong scientific credibility (Tim Spector is a top epidemiologist). Tied to a product (ZOE test kit, $299). Engaged community
- **Weaknesses:** Narrow focus (gut/nutrition only). Tied to ZOE product — editorial independence questionable when the newsletter promotes the company's $299 test kit. Substack platform limits growth tools. Personality-dependent
- **Sources:** [ZOE](https://zoe.com/learn/tim-spector), [Sifted](https://sifted.eu/articles/tim-spector-zoe-health)

#### Examine.com
- **Paid** subscription (Examine+, Research Digest)
- **Monthly** email digest
- **Audience:** Health professionals, evidence-focused consumers, supplement users
- **Content:** Supplement and nutrition research analysis. Database of 400K+ studies
- **Strengths:** Gold standard for evidence-based supplement analysis. No industry affiliations. Trusted by doctors and dietitians
- **Weaknesses:** Extremely narrow (supplements and nutrition only). Academic tone — dense, not engaging. Monthly cadence. Paywalled. No editorial voice or opinion. No investigation into industry funding
- **Source:** [Examine](https://examine.com/)

#### Dave Asprey / Bulletproof
- Weekly "Insider" newsletter
- **Audience:** Biohackers, tech-adjacent health optimizers
- **Content:** Biohacking tips, longevity tech, supplement recommendations, performance optimization
- **Strengths:** Large podcast audience. Strong personal brand. Engaged biohacking community
- **Weaknesses:** Significant conflicts of interest — sells supplements, products, and Upgrade Labs franchises. Recommendations often align with products he profits from. Not evidence-first. Credibility concerns. Niche audience (biohackers, not mainstream)
- **Source:** [Dave Asprey](https://daveasprey.com/)

#### Mark Hyman (Mark's Picks)
- Weekly newsletter ("Mark's Picks")
- **Audience:** Functional medicine followers, health-conscious 35-55
- **Content:** Lifestyle recommendations, product picks, functional medicine insights
- **Strengths:** NYT bestselling author. Large podcast audience. Trusted voice in functional medicine
- **Weaknesses:** Personality-driven. Product recommendations blur editorial and commercial lines. Functional medicine framing limits mainstream appeal. Older demographic than our target
- **Source:** [Dr. Hyman](https://drhyman.com/)

### The Gap We Fill

| Attribute | STAT | Huberman | Healthcare Brew | Axios | ZOE | Examine | alumi |
|-----------|------|----------|----------------|-------|-----|---------|-------|
| **Consumer-facing** (not industry) | No | Yes | No | No | Yes | Partial | **Yes** |
| **Investigative** (not just reporting) | Yes | No | No | No | No | No | **Yes** |
| **Follows the money** (industry funding) | Sometimes | Never | Never | Never | Never | Never | **Always** |
| **Affordable** (free or <$10/mo) | No ($399/yr) | Yes (free) | Yes (free) | Yes (free) | Free + $299 kit | Paid | **Yes (free)** |
| **3x/week+** cadence | Yes | No (monthly) | No (2x/week) | Yes (daily) | Irregular | Monthly | **Yes** |
| **Target: 20-35 year olds** | No (40+) | Partial | No | No | Partial | No | **Yes** |
| **Editorial independence scoring** | No | No | No | No | No | No | **Yes** |
| **App funnel** (not just content) | No | No | No | No | Yes (ZOE kit) | No | **Yes** |
| **Multi-model AI production** | No | No | No | No | No | No | **Yes** |
| **No conflicts of interest** | Mostly | No (sponsors) | Ads | Ads | Sells kits | Yes | **Yes** |

### What No One Else Does

1. **"Follow the money" as a franchise.** Not occasional investigative pieces — a dedicated section in every single edition tracking who funds health science. STAT does investigations but doesn't have a systematic, recurring industry-funding tracker. Nobody else even tries.

2. **Editorial independence scoring.** Every article scored 1-10 by an adversarial AI reviewer (different provider than the writer). Score shown to readers. This is completely unprecedented in health media. It turns editorial QA into a marketing asset.

3. **Consumer-facing investigative journalism at $0.** STAT is the only real investigative health journalism newsletter, and it costs $399/year. We deliver the same editorial ambition to a 25-year-old for free.

4. **AI newsroom at $0.06/article.** Every competitor either pays $50-500 per article (staff/freelancers) or uses unreviewed AI slop. We have multi-model AI research + human Opus writing + adversarial Grok review + automated PubMed fact-checking. The content quality of a $500 article at the economics of automation.

5. **Newsletter → app funnel.** ZOE does this (newsletter → $299 test kit), but their editorial independence is compromised because they're promoting their own product in their own editorial content. Our app and our journalism are separate products with separate value — the newsletter builds trust, the app converts it. No other health newsletter has this clean a funnel.

---

## One Sentence

We built an AI newsroom that produces editorial-quality health journalism for $0.06 per article. The newsletter puts it in your inbox 3x/week, follows the money that other health media won't, and introduces you to an app that puts the same investigative intelligence to work on your own health data.

---

*alumi news — Evidence. Wherever it leads.*
