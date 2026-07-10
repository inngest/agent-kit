# AgentKit Documentation

Built with [Astro Starlight](https://starlight.astro.build/). Deployed on Vercel.

## Setup

```sh
cd docs
npm install
```

## Development

```sh
npm run dev
```

Opens a local server at `http://localhost:4321`.

## Build

```sh
npm run build
npm run preview  # preview the build locally
```

## Project structure

```
docs/
  astro.config.mjs          # Starlight config (sidebar, theme, redirects, analytics)
  vercel.json                # Vercel redirect rules
  public/
    brand/                   # Logos and favicon
    graphics/                # Images used in docs
  src/
    content/docs/            # All MDX content pages
    components/
      ParamField.astro       # API parameter documentation component
      Update.astro           # Changelog entry component
    styles/custom.css        # Theme overrides (green accent, component styles)
    content.config.ts        # Astro content collection config
```

## Adding content

Pages are MDX files in `src/content/docs/`. The file path determines the URL (e.g. `concepts/agents.mdx` becomes `/concepts/agents`).

Sidebar navigation is configured manually in `astro.config.mjs` under the `sidebar` array.

### Available components

```mdx
import { LinkCard, CardGrid } from '@astrojs/starlight/components';
import { Steps } from '@astrojs/starlight/components';
import { Tabs, TabItem } from '@astrojs/starlight/components';
import ParamField from '../../components/ParamField.astro';
import Update from '../../components/Update.astro';
```

Admonitions use markdown syntax:

```md
:::note
Note content.
:::

:::tip[Optional title]
Tip content.
:::
```

## Deployment

Deployed via Vercel with the project root set to `docs/`. Framework preset: Astro.

Redirects are defined in both `astro.config.mjs` (for dev/build) and `vercel.json` (for Vercel edge).
