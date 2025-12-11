# Tune Health

A premium health and wellness editorial website featuring science-backed articles on mental health, nutrition, fitness, sleep science, and longevity.

## Tech Stack

- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom design system
- **Animations**: GSAP + ScrollTrigger
- **Smooth Scroll**: Lenis
- **Typography**: Playfair Display, Inter, Crimson Pro

## Getting Started

### Prerequisites

- Node.js (see `.nvmrc` for version)
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens the development server at `http://localhost:3000`

### Production Build

```bash
npm run build
```

Outputs to `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
├── index.html              # Homepage
├── articles/               # Article pages
│   └── mirtazapine-guide.html
├── js/
│   └── main.js            # All JavaScript (animations, navigation, theme)
├── css/
│   └── style.css          # Tailwind + custom components
├── assets/                 # Images, icons, logos
├── public/                 # Static assets (robots.txt)
├── tailwind.config.js      # Tailwind theme configuration
├── vite.config.js          # Vite build configuration
└── postcss.config.js       # PostCSS configuration
```

## Features

- Responsive design with mobile-first approach
- Dark/light theme toggle with system preference detection
- Smooth scroll animations with GSAP ScrollTrigger
- Magazine-style editorial layout
- Search overlay
- Newsletter subscription form
- Article reading progress indicator

## Design System

### Colors

- **Primary**: Red palette (`#ef4444` base)
- **Neutral**: Stone palette

### Typography

- **Headings**: Playfair Display (serif)
- **UI/Navigation**: Inter (sans-serif)
- **Body Text**: Crimson Pro (serif)

### Key Components

- `.container-editorial` - Main content container (max-width: 1400px)
- `.btn-primary`, `.btn-secondary` - Button styles
- `.article-card`, `.featured-card` - Article card layouts
- `.reveal` - Scroll-triggered animation class

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Development guidelines for AI assistants
- [CHANGELOG.md](./CHANGELOG.md) - Version history and changes

## License

All rights reserved.
