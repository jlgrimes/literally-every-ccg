# literally every CCG

Every paper card game. One chaotic pack at a time.

**Live:** https://omnideck-zeta.vercel.app

Rip Pokémon-Pocket-style booster packs drawn from **115,000+ real cards**
across 14 paper TCGs — Magic: The Gathering, Pokémon, Yu-Gi-Oh!, Disney
Lorcana, One Piece, Gundam, Dragon Ball Fusion World, Union Arena, Star Wars
Unlimited, Flesh and Blood, Riftbound: League of Legends, Digimon Card Game,
Android: Netrunner, and Weiß Schwarz — all mixed into one pool with unified
rarity tiers. Games without printed rarities get flavored ones: Netrunner
identities are legendary and agendas epic; Digimon tiers follow Digimon
levels (a Lv.7 mega is a legendary, an egg is a common).

## Features

- Swipe-to-tear pack opening with a tap-through card stack
- Unified 6/3/1 booster structure (hit slot: Legendary 8% / Epic 20% / Rare 72%)
- Interactive holographic card effects — tilt, glare, rainbow and gold foils
- Persistent binder with counts, per-game and per-tier filters, and completion tracking
- Broken card images are detected and replaced server-side before they count

## Stack

Next.js on Vercel. The card database is built by `scripts/seed-full.mjs`,
which ingests full catalogs from Scryfall bulk data, the official
pokemon-tcg-data dump, YGOPRODeck, Lorcast, apitcg data repos, swu-db,
the-fab-cube, NetrunnerDB, and the Heart-of-the-Cards Weiß Schwarz DB —
then normalizes every game's native rarities into five shared tiers.
Pack odds are server-authoritative via `/api/pack`.

```bash
npm install
npm run seed   # rebuild data/cards.json from live sources (~5 min)
npm run dev
```

## Credits & License

Card holographic/foil effects are the work of **Simon Goellner**
([@simeydotme](https://github.com/simeydotme)) from
[pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css),
vendored under GPL-3.0 — see `NOTICE.md`. Thanks, Simon. ♥

This project is licensed under **GPL-3.0** (see `LICENSE`).

All card images and names are the property of their respective publishers
(Wizards of the Coast, The Pokémon Company, Konami, Ravensburger/Disney,
Bandai, FFG/Asmodee, Legend Story Studios, Riot Games, Bushiroad, Null
Signal Games). This is a non-commercial fan project; images are hotlinked
from public databases.
