"use client";

// Full-page, scrollable OMNIRULES reference — opened from the ℹ button.
const SCALES = [
  ["Magic: The Gathering", "power / toughness × 10", "a 3/3 plays as 30⚔ 30♥"],
  ["Pokémon", "attack damage & HP ÷ 10", "120-damage attack hits for 12; 170 HP → 17♥"],
  ["Yu-Gi-Oh!", "ATK / DEF ÷ 100", "Blue-Eyes 3000/2500 → 30⚔ 25♥"],
  ["Disney Lorcana", "strength / willpower × 10", "a 4⚔/6⛨ character → 40⚔ 60♥"],
  ["Star Wars Unlimited", "power / HP × 10", "a 3/4 unit → 30⚔ 40♥"],
  ["Gundam", "AP / HP × 10", "a 3 AP / 4 HP unit → 30⚔ 40♥"],
  ["Riftbound", "might × 10", "a 4-might unit → 40⚔ 40♥"],
  ["Android: Netrunner", "strength × 10", "a strength-6 ICE → 60⚔ 60♥"],
  ["Flesh and Blood", "power / block × 10", "a 6-power, 3-block attack → 60⚔ 30♥"],
  ["One Piece", "power ÷ 100", "a 5000-power character → 50⚔ 50♥"],
  ["Weiß Schwarz", "power ÷ 100", "an 8500-power character → 85⚔ 85♥"],
  ["Digimon", "DP ÷ 100", "a 6000 DP Digimon → 60⚔ 60♥"],
  ["Union Arena", "BP ÷ 100", "a 3000 BP character → 30⚔ 30♥"],
  ["Dragon Ball Fusion World", "power ÷ 1000", "a 20000-power fighter → 20⚔ 20♥"],
];

export default function Rules({ onClose }) {
  return (
    <div className="packscreen rulesscreen">
      <div className="rules-head">
        <span className="display rules-title">OMNIRULES</span>
        <button className="pull10 display rules-x" onClick={onClose}>✕</button>
      </div>
      <div className="rules-body">
        <p className="rules-lede">
          Fourteen card games. One rulebook. Every creature and character you
          pull can fight — with the numbers printed on the real card.
        </p>

        <h3>The basics</h3>
        <ul>
          <li>You and your opponent each start at <b>25 HP</b>. Reach 0 and you lose.</li>
          <li>A deck is <b>20 creatures</b> built from cards you actually own — duplicates up to the copies in your binder. Spells, events, items and sites are collection pieces; they don't go in decks.</li>
          <li>Draw 1 card per turn (opening hand 4–5). Hand holds 8, board holds <b>5 creatures</b>.</li>
          <li>When your deck runs dry, each draw costs you <b>1 fatigue damage</b> instead.</li>
        </ul>

        <h3>Reading the cards</h3>
        <p>
          Every stat is the card's <b>printed number with the decimal point
          moved</b> — nothing is made up. If you know the card, you know its
          numbers here:
        </p>
        <table className="rules-table">
          <tbody>
            {SCALES.map(([g, rule, ex]) => (
              <tr key={g}><td><b>{g}</b><span>{rule}</span></td><td>{ex}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="rules-dim">
          A handful of cards with no printed combat stats (some Netrunner
          programs, promo printings) get power from their rarity tier instead.
        </p>

        <h3>💧 Mana — the universal cost</h3>
        <ul>
          <li>Your mana pool grows <b>+1 each turn</b> (cap 10) and refills at the start of your turn.</li>
          <li>Magic cards cost their <b>real printed mana</b> — though never more than their body is worth, since we don't simulate rules text.</li>
          <li>Every other game outside the trio pays mana too: the cost comes from the card's stats, at a <b>per-game exchange rate</b> tuned by thousands of simulated duels so no game's cards dominate. Bigger printed numbers → bigger mana cost.</li>
          <li>All mana-paid creatures have <b>summoning sickness</b>: they can't attack the turn they arrive (they can still block).</li>
        </ul>

        <h3>⚡ Pokémon — energy, attacks, evolution</h3>
        <ul>
          <li>Pokémon are <b>free to bench</b> and arrive with <b>3 energy</b> attached. You may attach <b>1 more energy per turn</b> (the ⚡+ button) to one of your Pokémon.</li>
          <li>They fight with their <b>real printed attacks</b> — each needs its printed energy cost. Your attack power is the strongest attack you can currently afford.</li>
          <li><b>Weakness:</b> Pokémon attacks hit rival <b>creatures for double damage</b>. Hits to the face are normal.</li>
          <li><b>Evolution:</b> a Stage 1/2 card can only be played on top of its named pre-evolution on your board. Damage carries over; energy stays.</li>
        </ul>

        <h3>⭐ Yu-Gi-Oh — summons and tributes</h3>
        <ul>
          <li>Monsters are free, attack <b>the turn they're summoned</b> (no sickness), and you get <b>one normal summon per turn</b>.</li>
          <li>Bonus <b>special summon</b>: once per turn you may also drop a small monster (printed ATK + DEF under 2500).</li>
          <li>Big monsters demand <b>tributes</b> — sacrifice your own creatures (from any game!): printed ATK + DEF of 5000+ costs 1 tribute, 8500+ costs 2. Yes, you can sacrifice a Grizzly Bears to summon Blue-Eyes White Dragon.</li>
        </ul>

        <h3>⚔ Combat — Magic-style blocking</h3>
        <ul>
          <li>On your turn: play cards, then <b>declare attackers</b>. Attackers swing at the enemy player, not at creatures.</li>
          <li>The defender then <b>assigns blockers</b> — any creature can block, one blocker per attacker. Sickness and missing energy stop you from attacking, never from blocking.</li>
          <li>Blocked pairs trade damage simultaneously. Damage sticks between turns; a creature at 0 HP is destroyed.</li>
          <li>Unblocked attackers hit the player for <b>ATK ÷ 10</b> (rounded up) — a 30⚔ creature deals 3.</li>
          <li>Declaring your attack ends your turn: after blocks resolve, your opponent goes.</li>
        </ul>

        <h3>🃏 Beyond the duel</h3>
        <ul>
          <li><b>VS FRIEND:</b> create a match, send the 6-letter code, and duel a real person — same rules, both of you on your own decks.</li>
          <li><b>Quick skirmish:</b> a 3-lane stat fight — pick 3 fighters, they slug it out against a tier-matched AI team.</li>
          <li><b>God packs:</b> 1 in 200 packs arrives golden — all ten cards epic or legendary.</li>
        </ul>

        <p className="rules-dim rules-end">
          Card images and names belong to their publishers. This is a fan
          project — go buy the real games, they're great.
        </p>
      </div>
    </div>
  );
}
