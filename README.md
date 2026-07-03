# literally every CCG

Every paper card game. One chaotic pack at a time.

**Live:** https://omnideck-zeta.vercel.app

Rip Pokémon-Pocket-style booster packs drawn from **88,000+ real cards** across
11 paper TCGs — Magic: The Gathering, Pokémon, Yu-Gi-Oh!, Disney Lorcana,
One Piece, Gundam, Dragon Ball Fusion World, Union Arena, Star Wars Unlimited,
Flesh and Blood, and Riftbound: League of Legends — all mixed into one pool
with unified rarity tiers.

## Features

- Swipe-to-tear pack opening with a tap-through card stack
- OMNIRULES duels — three rulesets merged into one game: Magic cards cost
  mana and suffer summoning sickness, Pokémon attack only with energy
  attached, and Yu-Gi-Oh monsters tribute-summon by sacrificing your board
  (yes, you can sacrifice a Grizzly Bears to summon Blue-Eyes White Dragon)
- Quick skirmishes: 3-lane stat fights with real P/T, HP/attack and ATK/DEF
  normalized onto one 1–100 scale, against a tier-matched AI
- Unified 6/3/1 booster structure (hit slot: Legendary 8% / Epic 20% / Rare 72%)
- Interactive holographic card effects — tilt, glare, rainbow and gold foils
- Persistent binder with counts, per-game and per-tier filters, and completion tracking
- Broken card images are detected and replaced server-side before they count

## Stack

Next.js on Vercel. The card database is built by `scripts/seed-full.mjs`,
which ingests full catalogs from Scryfall bulk data, the official
pokemon-tcg-data dump, YGOPRODeck, Lorcast, apitcg data repos, swu-db, and
the-fab-cube — then normalizes every game's native rarities into five shared
tiers, and each battle game's combat stats onto a shared 1–100 ATK/HP scale.
Pack odds and battle resolution are server-authoritative via `/api/pack`
and `/api/battle`.

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
Bandai, FFG/Asmodee, Legend Story Studios, Riot Games). This is a non-commercial fan
project; images are hotlinked from public databases.
