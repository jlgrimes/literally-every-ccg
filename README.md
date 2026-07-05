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
- OMNIRULES duels — creatures and characters from all 14 games battle
  under one merged rulebook: Magic cards cost their real printed mana and
  suffer summoning sickness, Pokémon attack only with energy attached and
  evolve on top of their pre-evolutions, Yu-Gi-Oh monsters tribute-summon
  by sacrificing your board (yes, you can sacrifice a Grizzly Bears to
  summon Blue-Eyes White Dragon) — and the other eleven games' characters
  all play on the universal mana system, cost scaling with how powerful
  the card is: real printed numbers where the game has them (Flesh and
  Blood power and block values), rarity-tier power bands everywhere else.
  Character types come from each game's real card-type data (Lorcana
  characters, SWU units and leaders, Digimon, Netrunner ICE and programs,
  Weiß characters, …) — events, items and sites stay collection-only
- Magic-style combat: attackers swing at the player, and the defender
  assigns blockers — chump-block with a Kuriboh, wall with a Snorlax, or
  take it to the face; empty decks bleed fatigue
- Spells, trainers and traps: ~15,000 non-creature cards classified into a
  shared effect vocabulary (damage, destroy, draw, buff, weaken, heal, board
  nuke, and deck-search tutors) with magnitudes read from their real rules
  text — Lightning Bolt burns, Professor Oak draws, Raigeki wipes the board,
  Demonic Tutor searches your deck
- Deck building, required: save up to 12 named decks built from cards you
  actually pulled (duplicates up to the copies you own) and switch the
  active one any time
- Multiplayer: create a match, send the 6-letter code to a friend, and duel
  each other's real decks under the merged rules — turn-based with live sync
- Quick skirmishes: 3-lane stat fights with real P/T, HP/attack and ATK/DEF
  normalized onto one 1–100 scale, against a tier-matched AI
- Unified 6/3/1 booster structure (hit slot: Legendary 8% / Epic 20% / Rare 72%)
- God packs: 1 in 200 packs arrives in a golden wrapper — all ten cards are
  epics and legendaries, rolled server-side like everything else
- Interactive holographic card effects — tilt, glare, rainbow and gold foils
- Persistent binder with counts, per-game and per-tier filters, and completion tracking
- Broken card images are detected and replaced server-side before they count

## Stack

Next.js on Vercel. The card database is built by `scripts/seed-full.mjs`,
which ingests full catalogs from Scryfall bulk data, the official
pokemon-tcg-data dump, YGOPRODeck, Lorcast, apitcg data repos, swu-db,
the-fab-cube, NetrunnerDB, and the Heart-of-the-Cards Weiß Schwarz DB —
then normalizes every game's native rarities into five shared tiers, and
each battle game's combat stats onto a shared 1–100 ATK/HP scale. Pack
odds and battle resolution are server-authoritative via `/api/pack` and
`/api/battle`.

```bash
npm install
npm run seed   # rebuild data/cards.json from live sources (~5 min)
npm run dev
```

### Multiplayer storage

Matches are stored via `lib/matchStore.js`. Locally it falls back to an
in-process map (two tabs against `npm run dev` just work). In production
(serverless) it needs Supabase:

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the deployment
   environment. The service key is only used server-side, in API routes.

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
