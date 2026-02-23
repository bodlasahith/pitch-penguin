export default function GameFlowInfographic() {
  const INK   = "#1f2430"
  const CREAM = "#faf8f4"
  const SW    = 2.8   // standard stroke width for characters

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 920 340"
      style={{ width: "100%", height: "auto", display: "block", background: CREAM }}
    >
      <defs>
        {/* ─────────────────────────────────────────────────────
            PENGUIN  — head center at (0,0)
            Crown tip to ~y=-70, body down to ~y+55
            Flippers: two rounded paddle shapes on body sides
        ───────────────────────────────────────────────────── */}
        <g id="pg">
          <g fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
            {/* crown */}
            <polygon points="-25,-55 -15,-70 0,-55 15,-70 25,-55 25,-45 -25,-45" strokeWidth="4"/>
            <circle cx="-15" cy="-70" r="4" strokeWidth="3"/>
            <circle cx="15"  cy="-70" r="4" strokeWidth="3"/>
            <circle cx="0"   cy="-50" r="2" strokeWidth="2"/>
            {/* head circle */}
            <circle cx="0" cy="0" r="55" strokeWidth="4"/>
            {/* belly */}
            <ellipse cx="0" cy="10" rx="30" ry="35" strokeWidth="3"/>
            {/* eyes */}
            <circle cx="-15" cy="0"  r="8" strokeWidth="3"/>
            <circle cx="15"  cy="0"  r="8" strokeWidth="3"/>
            <circle cx="-15" cy="2"  r="4" strokeWidth="2.5"/>
            <circle cx="15"  cy="2"  r="4" strokeWidth="2.5"/>
            {/* beak */}
            <polygon points="0,2 -8,12 8,12" strokeWidth="3"/>
            {/* flippers — paddle ellipses rotated outward from body sides */}
            <ellipse cx="-48" cy="20" rx="10" ry="22" strokeWidth="3"
              transform="rotate(-22,-48,20)" fill="white"/>
            <ellipse cx="48"  cy="20" rx="10" ry="22" strokeWidth="3"
              transform="rotate(22,48,20)" fill="white"/>
          </g>
        </g>

        {/* ─────────────────────────────────────────────────────
            HAMSTER  — centered at (0,0)
            Suit torso bottom ~y=36. Arms emerge from jacket
            sides as short curved forearms with round paws.
        ───────────────────────────────────────────────────── */}
        <g id="hm">
          <g fill="none" stroke={INK} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
            {/* head + cheek-puffs */}
            <circle cx="0"   cy="4"   r="26"/>
            <circle cx="-17" cy="-12" r="8.2"/>
            <circle cx="17"  cy="-12" r="8.2"/>
            <circle cx="-17" cy="-12" r="3.6" strokeWidth="2"/>
            <circle cx="17"  cy="-12" r="3.6" strokeWidth="2"/>
            {/* sunglasses */}
            <rect x="-16" y="-6" width="13" height="10" rx="2.5"/>
            <rect x="3"   y="-6" width="13" height="10" rx="2.5"/>
            <path d="M -3 0 H 3"/>
            {/* muzzle */}
            <ellipse cx="0" cy="9" rx="8.5" ry="6.2"/>
            <circle cx="0" cy="8" r="1.8" fill={INK}/>
            <path d="M -7 15 Q 0 20 7 15"/>
            {/* suit torso */}
            <rect x="-10" y="18" width="20" height="18" rx="4"/>
            <circle cx="0" cy="30" r="3.8"/>
            <path d="M -1.4 29.2 L 1.2 29.2 M -1 31 L 1 31.8" strokeWidth="1.8"/>
            {/* arms — short forearms from jacket sides, elbowing down */}
            {/* left arm: shoulder at (-10,22), elbow out then forearm down */}
            <path d="M -10 22 Q -20 24 -18 34" strokeWidth={SW}/>
            {/* left paw — small circle */}
            <circle cx="-18" cy="36" r="4" strokeWidth={SW}/>
            {/* right arm */}
            <path d="M 10 22 Q 20 24 18 34" strokeWidth={SW}/>
            <circle cx="18" cy="36" r="4" strokeWidth={SW}/>
          </g>
        </g>

        {/* ─────────────────────────────────────────────────────
            HAMSTER TYPING  — same as above but paws angled
            forward/down onto keyboard. Arms extend more forward.
        ───────────────────────────────────────────────────── */}
        <g id="hm-type">
          <g fill="none" stroke={INK} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="0"   cy="4"   r="26"/>
            <circle cx="-17" cy="-12" r="8.2"/>
            <circle cx="17"  cy="-12" r="8.2"/>
            <circle cx="-17" cy="-12" r="3.6" strokeWidth="2"/>
            <circle cx="17"  cy="-12" r="3.6" strokeWidth="2"/>
            <rect x="-16" y="-6" width="13" height="10" rx="2.5"/>
            <rect x="3"   y="-6" width="13" height="10" rx="2.5"/>
            <path d="M -3 0 H 3"/>
            <ellipse cx="0" cy="9" rx="8.5" ry="6.2"/>
            <circle cx="0" cy="8" r="1.8" fill={INK}/>
            {/* slight forward lean smile */}
            <path d="M -7 15 Q 0 19 7 15"/>
            <rect x="-10" y="18" width="20" height="18" rx="4"/>
            <circle cx="0" cy="30" r="3.8"/>
            <path d="M -1.4 29.2 L 1.2 29.2 M -1 31 L 1 31.8" strokeWidth="1.8"/>
            {/* left arm: reaches forward+down toward keyboard */}
            <path d="M -10 23 Q -16 30 -12 40" strokeWidth={SW}/>
            <circle cx="-12" cy="42" r="4" strokeWidth={SW}/>
            {/* right arm: same mirror */}
            <path d="M 10 23 Q 16 30 12 40" strokeWidth={SW}/>
            <circle cx="12" cy="42" r="4" strokeWidth={SW}/>
          </g>
        </g>

        {/* ─────────────────────────────────────────────────────
            OCTOPUS  — centered at (0,0)
            Head top ~y=-22, tentacle tips ~y=35
        ───────────────────────────────────────────────────── */}
        <g id="oc">
          <g fill="none" stroke={INK} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="0"  cy="-2"  r="20"/>
            <ellipse cx="-7" cy="-4" rx="3.2" ry="4.2"/>
            <ellipse cx="7"  cy="-4" rx="3.2" ry="4.2"/>
            <circle cx="-7" cy="-2.7" r="1.5" fill={INK}/>
            <circle cx="7"  cy="-2.7" r="1.5" fill={INK}/>
            <path d="M -8 7 Q 0 14 8 7"/>
            {/* four tentacles */}
            <path d="M -16 14 Q -29 26 -17 35"/>
            <path d="M -5  16 Q -11 30 -2  36"/>
            <path d="M  5  16 Q  11 30  2  36"/>
            <path d="M  16 14 Q  29 26 17  35"/>
            {/* suckers */}
            <circle cx="-20" cy="29" r="1.6"/>
            <circle cx="-12" cy="33" r="1.6"/>
            <circle cx="-6"  cy="31" r="1.6"/>
            <circle cx="6"   cy="31" r="1.6"/>
            <circle cx="12"  cy="33" r="1.6"/>
            <circle cx="20"  cy="29" r="1.6"/>
          </g>
        </g>

        {/* ─────────────────────────────────────────────────────
            OCTOPUS TYPING — two front tentacles curve forward
            down onto keyboard; back tentacles hang naturally
        ───────────────────────────────────────────────────── */}
        <g id="oc-type">
          <g fill="none" stroke={INK} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="0"  cy="-2"  r="20"/>
            <ellipse cx="-7" cy="-4" rx="3.2" ry="4.2"/>
            <ellipse cx="7"  cy="-4" rx="3.2" ry="4.2"/>
            <circle cx="-7" cy="-2.7" r="1.5" fill={INK}/>
            <circle cx="7"  cy="-2.7" r="1.5" fill={INK}/>
            {/* excited smile for typing */}
            <path d="M -8 7 Q 0 16 8 7"/>
            {/* TYPING tentacles — two front ones arc forward & down */}
            <path d="M -8 18 Q -6 30 -10 42"/>
            <circle cx="-10" cy="43" r="1.6"/>
            <circle cx="-7"  cy="36" r="1.6"/>
            <path d="M 8 18 Q 6 30 10 42"/>
            <circle cx="10"  cy="43" r="1.6"/>
            <circle cx="7"   cy="36" r="1.6"/>
            {/* back tentacles hang to sides */}
            <path d="M -16 14 Q -28 22 -20 32"/>
            <circle cx="-22" cy="28" r="1.6"/>
            <circle cx="-18" cy="33" r="1.6"/>
            <path d="M  16 14 Q  28 22 20 32"/>
            <circle cx="22"  cy="28" r="1.6"/>
            <circle cx="18"  cy="33" r="1.6"/>
          </g>
        </g>

        {/* ─────────────────────────────────────────────────────
            CARD  — blank, label drawn inline
        ───────────────────────────────────────────────────── */}
        <g id="card">
          <rect x="-16" y="-24" width="32" height="44" rx="5" fill="#fff" stroke={INK} strokeWidth="2.5"/>
        </g>

        {/* ─────────────────────────────────────────────────────
            LAPTOP  — open, keyboard tray visible
        ───────────────────────────────────────────────────── */}
        <g id="laptop">
          <g fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
            {/* screen lid */}
            <rect x="-22" y="-28" width="44" height="30" rx="4" strokeWidth="2.4"/>
            {/* inner screen bezel */}
            <rect x="-17" y="-24" width="34" height="22" rx="2" strokeWidth="1.5"/>
            {/* keyboard base trapezoid */}
            <path d="M -26 2 L 26 2 L 22 10 L -22 10 Z" strokeWidth="2.4"/>
            {/* keyboard rows — subtle dot grid */}
            <line x1="-16" y1="5"  x2="16"  y2="5"  strokeWidth="1.2" opacity="0.5"/>
            <line x1="-14" y1="8"  x2="14"  y2="8"  strokeWidth="1.2" opacity="0.5"/>
          </g>
        </g>

        {/* ─────────────────────────────────────────────────────
            POSTER A — text lines + bold circle icon
        ───────────────────────────────────────────────────── */}
        <g id="posta">
          <g fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
            <rect x="-18" y="-28" width="36" height="54" rx="5" strokeWidth="2.5"/>
            {/* title bar */}
            <rect x="-13" y="-22" width="26" height="6" rx="2" strokeWidth="1.8"/>
            {/* text lines */}
            <line x1="-12" y1="-10" x2="12"  y2="-10" strokeWidth="1.8"/>
            <line x1="-12" y1="-4"  x2="8"   y2="-4"  strokeWidth="1.8"/>
            <line x1="-12" y1="2"   x2="12"  y2="2"   strokeWidth="1.8"/>
            {/* bold star / icon */}
            <circle cx="0" cy="16" r="8" strokeWidth="2"/>
            <line x1="0" y1="8"  x2="0"  y2="6"  strokeWidth="2"/>
            <line x1="0" y1="24" x2="0"  y2="26" strokeWidth="2"/>
            <line x1="8" y1="16" x2="10" y2="16" strokeWidth="2"/>
            <line x1="-8" y1="16" x2="-10" y2="16" strokeWidth="2"/>
          </g>
        </g>

        {/* ─────────────────────────────────────────────────────
            POSTER B — heading + bar chart
        ───────────────────────────────────────────────────── */}
        <g id="postb">
          <g fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
            <rect x="-18" y="-28" width="36" height="54" rx="5" strokeWidth="2.5"/>
            <rect x="-13" y="-22" width="26" height="6" rx="2" strokeWidth="1.8"/>
            {/* bar chart */}
            <line x1="-12" y1="18" x2="12"  y2="18" strokeWidth="1.8"/>
            <rect x="-10" y="-4"  width="5" height="22" rx="1" strokeWidth="1.8"/>
            <rect x="-2"  y="-10" width="5" height="28" rx="1" strokeWidth="1.8"/>
            <rect x="6"   y="0"   width="5" height="18" rx="1" strokeWidth="1.8"/>
          </g>
        </g>

        {/* ─────────────────────────────────────────────────────
            CASH BAG
        ───────────────────────────────────────────────────── */}
        <g id="bag">
          <g fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
            {/* tie knot + neck */}
            <path d="M -6 -18 Q 0 -25 6 -18" strokeWidth="2.2"/>
            <path d="M -9 -13 Q 0 -9 9 -13" strokeWidth="2.2"/>
            {/* sack body: symmetric, rounded bottom */}
            <path
              d="M -11 -12
                 C -20 -6 -20 9 -10 18
                 C -6 22 -2 23 0 23
                 C 2 23 6 22 10 18
                 C 20 9 20 -6 11 -12
                 C 7 -15 -7 -15 -11 -12 Z"
              strokeWidth="2.5"
            />
            {/* $ sign */}
            <text x="0" y="9" textAnchor="middle" fontSize="13" fontWeight="900"
              fill={INK} stroke="none">$</text>
          </g>
        </g>

        {/* ─────────────────────────────────────────────────────
            SPARKLE  — 4-pointed star
        ───────────────────────────────────────────────────── */}
        <g id="spark">
          <g stroke={INK} strokeLinecap="round">
            <line x1="0" y1="-9"  x2="0"  y2="9"  strokeWidth="2"/>
            <line x1="-9" y1="0"  x2="9"  y2="0"  strokeWidth="2"/>
            <line x1="-6" y1="-6" x2="6"  y2="6"  strokeWidth="1.4"/>
            <line x1="6"  y1="-6" x2="-6" y2="6"  strokeWidth="1.4"/>
          </g>
        </g>
      </defs>

      {/* ══════════════════════════════════
          BACKGROUND + FRAME
      ══════════════════════════════════ */}
      <rect width="920" height="340" fill={CREAM}/>
      <rect x="10" y="10" width="900" height="320" rx="18" fill="#fff" stroke={INK} strokeWidth="3"/>

      {/* ══════════════════════════════════
          TITLE BAR
      ══════════════════════════════════ */}
      <text x="460" y="44" textAnchor="middle" fontSize="21" fontWeight="900"
        fill={INK} letterSpacing="3">ROUND FLOW</text>
      <line x1="30" y1="52" x2="890" y2="52" stroke={INK} strokeWidth="2"/>

      {/* ══════════════════════════════════
          COLUMN DIVIDERS (dashed)
      ══════════════════════════════════ */}
      {[250, 470, 690].map(x => (
        <line key={x} x1={x} y1="52" x2={x} y2="330"
          stroke={INK} strokeWidth="1.5" strokeDasharray="4,3" opacity="0.35"/>
      ))}

      {/* ══════════════════════════════════
          ARROW CONNECTORS
      ══════════════════════════════════ */}
      {[250, 470, 690].map((x, i) => (
        <g key={i} transform={`translate(${x},191)`}>
          <circle cx="0" cy="0" r="13" fill={CREAM} stroke={INK} strokeWidth="2.2"/>
          <polygon points="-4,-5 5,0 -4,5" fill={INK}/>
        </g>
      ))}

      {/* ════════════════════════════════════════════════════════
          PHASE 1 — DEAL CARDS   (center x=140)
      ════════════════════════════════════════════════════════ */}
      <g transform="translate(140,0)">
        <text x="0" y="76" textAnchor="middle" fontSize="13.5" fontWeight="900"
          fill={INK} letterSpacing="1">1. Deal Cards</text>

        {/* TABLE */}
        <rect x="-82" y="234" width="164" height="18" rx="8"
          fill="#fff" stroke={INK} strokeWidth="2.4"/>
        <line x1="-58" y1="251" x2="-58" y2="265"
          stroke={INK} strokeWidth="2.2" strokeLinecap="round"/>
        <line x1="58"  y1="251" x2="58"  y2="265"
          stroke={INK} strokeWidth="2.2" strokeLinecap="round"/>

        {/* PENGUIN — dealing, flippers spread toward cards
            Scaled 0.36 → flipper tips land near cards.
            Left flipper tip in penguin-space ≈ (-58, 20)*0.36 + (0,168) = (-21, 175)
            Right flipper tip ≈ (+58, 20)*0.36 + (0,168) = (+21, 175)
            Cards are at x ≈ -52, 0, 52 y≈222 — flippers nicely reach */}
        <use href="#pg" transform="translate(0,168) scale(0.36)"/>

        {/* Cards fanned on table */}
        <g transform="translate(-52,234) rotate(-16)">
          <use href="#card"/>
          <text x="0" y="-7" textAnchor="middle" fontSize="5.8" fontWeight="900"
            fill={INK} stroke="none">PROBLEM</text>
        </g>
        <g transform="translate(0,232)">
          <use href="#card"/>
          <text x="0" y="-7" textAnchor="middle" fontSize="4.7" fontWeight="900"
            fill={INK} stroke="none">CONSTRAINT</text>
        </g>
        <g transform="translate(52,234) rotate(16)">
          <use href="#card"/>
          <text x="0" y="-7" textAnchor="middle" fontSize="5.8" fontWeight="900"
            fill={INK} stroke="none">TWIST</text>
        </g>
      </g>

      {/* ════════════════════════════════════════════════════════
          PHASE 2 — WRITE PITCH   (center x=360)

          Layout: hamster on left leaning right, laptop in front;
          octopus on right leaning left, laptop in front.
          Characters drawn at their own scale so arms/tentacles
          land naturally on the keyboard surface.

          Hamster: translate(-68,175) scale(0.72)
            → body center at (-68,175), suit bottom ~175+36*0.72=201
            → typing paws at ~(-68 ± 12*0.72, 175+42*0.72)=(-77 or -59, 205)
          Laptop for hamster: translate(-68,212)
            → keyboard surface at y=212+2*0.9=214 — paws land there ✓

          Octopus: translate(68,168) scale(0.88)
            → typing tentacle tips at ~(68±10*0.88, 168+43*0.88)=(60 or 77, 206)
          Laptop for octopus: translate(68,209)
            → keyboard surface at y=209+2=211 — tentacle tips land there ✓
      ════════════════════════════════════════════════════════ */}
      <g transform="translate(360,0)">
        <text x="0" y="76" textAnchor="middle" fontSize="13.5" fontWeight="900"
          fill={INK} letterSpacing="1">2. Write Pitch</text>

        {/* ── HAMSTER typing, leaning slightly right ── */}
        {/* Scale 0.72, lean right 8° around own center */}
        <use href="#hm-type" transform="translate(-68,135) scale(0.72) rotate(-8)"/>
        {/* Laptop positioned so keyboard (y=+2 in laptop space) aligns with paw tips */}
        <use href="#laptop"  transform="translate(-68,213) scale(0.88)"/>

        {/* ── OCTOPUS typing, leaning slightly left ── */}
        <use href="#oc-type" transform="translate(68,135) scale(0.88) rotate(8)"/>
        {/* Laptop — tentacle tips in world ≈ (68±9, 206), keyboard surface at 209+2=211 */}
        <use href="#laptop"  transform="translate(68,209) scale(0.88)"/>

        {/* TABLE surface behind both laptops */}
        <rect x="-105" y="221" width="210" height="14" rx="7"
          fill="#fff" stroke={INK} strokeWidth="2.2"/>
        <line x1="-78" y1="234" x2="-78" y2="252"
          stroke={INK} strokeWidth="2" strokeLinecap="round"/>
        <line x1="78"  y1="234" x2="78"  y2="252"
          stroke={INK} strokeWidth="2" strokeLinecap="round"/>

        {/* VS — faint, between the two */}
        <text x="0" y="196" textAnchor="middle" fontSize="12" fontWeight="900"
          fill={INK} opacity="0.28" letterSpacing="2">VS</text>

        {/* clock icon */}
        <g transform="translate(86,100)" fill="none" stroke={INK}
          strokeLinecap="round" strokeWidth="1.8">
          <circle cx="0" cy="0" r="10"/>
          <line x1="0" y1="0" x2="0" y2="-6"/>
          <line x1="0" y1="0" x2="5" y2="3"/>
        </g>
      </g>

      {/* ════════════════════════════════════════════════════════
          PHASE 3 — REVEAL   (center x=580)
      ════════════════════════════════════════════════════════ */}
      <g transform="translate(580,0)">
        <text x="0" y="76" textAnchor="middle" fontSize="13.5" fontWeight="900"
          fill={INK} letterSpacing="1">3. Reveal</text>

        {/* PENGUIN JUDGE at lectern, center */}
        <use href="#pg" transform="translate(0,155) scale(0.30)"/>
        {/* lectern */}
        <rect x="-16" y="162" width="32" height="18" rx="5" fill={INK}/>
        <rect x="-22" y="178" width="44" height="7"  rx="3" fill={INK}/>

        {/* HAMSTER left — holding poster A up  */}
        {/* Hamster arm in hamster-space: left paw at (-18,36)*0.56=(-10,20)
            Poster placed just above that */}
        <use href="#hm"    transform="translate(-40,208) scale(0.56) rotate(-5)"/>
        <use href="#posta" transform="translate(-72,173) rotate(-9)"/>
        {/* connection: hamster left paw → poster bottom edge */}
        <path d="M -57 222 Q -62 202 -68 191"
          fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round"/>

        {/* OCTOPUS right — holding poster B with a tentacle */}
        <use href="#oc"    transform="translate(40,210) scale(0.65) rotate(5)"/>
        <use href="#postb" transform="translate(72,172) rotate(9)"/>
        {/* connection: front tentacle curls up to hold poster */}
        <path d="M 57 210 Q 62 192 68 188"
          fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="68" cy="186" r="1.6" fill={INK}/>
      </g>

      {/* ════════════════════════════════════════════════════════
          PHASE 4 — VOTE / WIN   (center x=800)

          Penguin left, flipper extended right holding bag.
          Penguin at scale 0.32 → right flipper tip in world:
            (800-42) + 58*0.32 = 758+18.6 = ~776
          Bag center at ~(800-8,190)=(792,190)
          Octopus right, left front tentacle reaches left to bag.
          Octopus at scale 0.82, left tentacle tip in oc-type space
            ≈ (-10,43)*0.82 = (-8.2, 35.3) + world(848,172) = (840, 207) ← close to bag
      ════════════════════════════════════════════════════════ */}
      <g transform="translate(800,0)">
        <text x="0" y="76" textAnchor="middle" fontSize="13.5" fontWeight="900"
          fill={INK} letterSpacing="1">4. Vote</text>

        {/* PENGUIN — right flipper extended toward bag */}
        <use href="#pg" transform="translate(-44,182) scale(0.32)"/>

        {/* CASH BAG — midpoint */}
        <use href="#bag" transform="translate(6,187) scale(0.92)"/>

        {/* OCTOPUS — left tentacle curls to grasp bag */}
        <use href="#oc" transform="translate(52,170) scale(0.82)"/>

        {/* WINNER badge */}
        <rect x="-42" y="255" width="84" height="24" rx="8" fill={INK}/>
        <text x="0" y="272" textAnchor="middle" fontSize="12" fontWeight="900"
          fill="#fff" stroke="none" letterSpacing="1">WINNER!</text>

        {/* SPARKLES */}
        <use href="#spark" transform="translate(76,112) scale(0.72)"/>
        <use href="#spark" transform="translate(84,138) scale(0.46)"/>
        <use href="#spark" transform="translate(70,156) scale(0.36)"/>
        <use href="#spark" transform="translate(-68,120) scale(0.46)"/>
        <use href="#spark" transform="translate(-76,144) scale(0.34)"/>
      </g>

      {/* ══════════════════════════════════
          PHASE NUMBER BADGES (bottom)
      ══════════════════════════════════ */}
      {[140, 360, 580, 800].map((cx, i) => (
        <g key={i} transform={`translate(${cx},314)`}>
          <circle cx="0" cy="0" r="11" fill={INK}/>
          <text x="0" y="5" textAnchor="middle" fontSize="12" fontWeight="900"
            fill="#fff" stroke="none">{i+1}</text>
        </g>
      ))}

    </svg>
  )
}
