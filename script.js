function __getInitialTab() {
  try {
    var p = new URLSearchParams(window.location.search);
    var t = p.get('tool') || p.get('tab') || window.location.hash.replace(/^#/, '');
    if (t && !t.startsWith('s=')) {
      if (!t.startsWith('tab-')) t = 'tab-' + t;
      if (document.getElementById(t)) return t;
    }
  } catch (e) {}
  return 'tab-calculator';
}
(function() {
// ==================== CORE UTILITIES ====================
const MAX_DICE_COUNT = 1000;
const MAX_DIE_FACES = 1000;
// Strict tokenizer: signs are preserved, malformed input is rejected loudly.
function parseHDExpression(expr) {
if (expr == null || !String(expr).trim()) return { components: [], flatBonus: 0, valid: false, error: 'Enter an expression, e.g. 8d10+24.' };
const s = String(expr).trim().toLowerCase().replace(/\s+/g, '').replace(/[\u2012-\u2015\u2212]/g, '-');
if (!/^[+-]?[0-9d+-]+$/.test(s)) return { components: [], flatBonus: 0, valid: false, error: 'Only numbers, "d", "+" and "-" are allowed.' };
const tokens = s.match(/[+-]?[^+-]+/g);
if (!tokens) return { components: [], flatBonus: 0, valid: false, error: 'Could not read that expression.' };
const components = [];
let flatBonus = 0;
for (const tok of tokens) {
  const sign = tok[0] === '-' ? -1 : 1;
  const body = tok.replace(/^[+-]/, '');
  if (body === '') return { components: [], flatBonus: 0, valid: false, error: 'Dangling "+" or "-" in the expression.' };
  const dm = body.match(/^(\d*)d(\d+)$/);
  if (dm) {
    const count = dm[1] === '' ? 1 : parseInt(dm[1], 10);
    const die = parseInt(dm[2], 10);
    if (count < 1) return { components: [], flatBonus: 0, valid: false, error: 'Dice count must be at least 1 (got "' + body + '").' };
    if (count > MAX_DICE_COUNT) return { components: [], flatBonus: 0, valid: false, error: 'Dice count is capped at ' + MAX_DICE_COUNT + '.' };
    if (die < 2) return { components: [], flatBonus: 0, valid: false, error: 'Die size must be at least 2 (got "' + body + '").' };
    if (die > MAX_DIE_FACES) return { components: [], flatBonus: 0, valid: false, error: 'Die size is capped at d' + MAX_DIE_FACES + '.' };
    components.push({ count, die, sign });
  } else if (/^\d+$/.test(body)) {
    flatBonus += sign * parseInt(body, 10);
  } else {
    return { components: [], flatBonus: 0, valid: false, error: 'Cannot read "' + body + '". Use forms like 8d10, 2d6 or +24.' };
  }
}
if (components.length === 0 && flatBonus === 0) return { components: [], flatBonus: 0, valid: false, error: 'No dice or bonus found.' };
return { components, flatBonus, valid: true, error: null };
}
function calculateHP(parsed) {
if (!parsed.valid) return { average: 0, min: 0, max: 0, totalHD: 0, dieBreakdown: [] };
let totalMin = 0, totalMax = 0, totalAvg = 0, totalHD = 0;
const dieBreakdown = [];
for (const comp of parsed.components) {
const sign = comp.sign === -1 ? -1 : 1;
const dieAvg = (comp.die + 1) / 2;
const lowEnd = sign * comp.count * 1;
const highEnd = sign * comp.count * comp.die;
const compMin = Math.min(lowEnd, highEnd);
const compMax = Math.max(lowEnd, highEnd);
const compAvg = sign * comp.count * dieAvg;
totalMin += compMin;
totalMax += compMax;
totalAvg += compAvg;
totalHD += comp.count;
dieBreakdown.push({ count: comp.count, die: comp.die, sign, avgPerDie: dieAvg, compMin, compMax, compAvg, label: `${sign < 0 ? '-' : ''}${comp.count}d${comp.die}` });
}
totalMin += parsed.flatBonus;
totalMax += parsed.flatBonus;
totalAvg += parsed.flatBonus;
const _rnd = (window.__ddhpRounding === 'floor') ? Math.floor : Math.round;
return { average: _rnd(totalAvg), exactAverage: totalAvg, min: totalMin, max: totalMax, totalHD, dieBreakdown, flatBonus: parsed.flatBonus, expression: formatExpression(parsed) };
}
function formatExpression(parsed) {
const parts = parsed.components.map((c, i) => `${c.sign === -1 ? '-' : (i > 0 ? '+' : '')}${c.count}d${c.die}`).join('');
if (parsed.flatBonus > 0) return parts + '+' + parsed.flatBonus;
if (parsed.flatBonus < 0) return parts + parsed.flatBonus;
return parts || '0';
}
function fmtMod(n) { return n >= 0 ? '+' + n : '' + n; }
function computeExactDistribution(parsed, maxWidth = 5000) {
if (!parsed.valid || parsed.components.length === 0) {
if (parsed.flatBonus !== 0) return { values: [parsed.flatBonus], probs: [1.0], min: parsed.flatBonus, max: parsed.flatBonus, mean: parsed.flatBonus };
return { values: [0], probs: [1.0], min: 0, max: 0, mean: 0 };
}
let dist = new Map();
dist.set(0, 1.0);
for (const comp of parsed.components) {
for (let i = 0; i < comp.count; i++) {
const newDist = new Map();
for (const [val, prob] of dist) {
const pEach = prob / comp.die;
const sgn = comp.sign === -1 ? -1 : 1;
for (let face = 1; face <= comp.die; face++) {
const newVal = val + sgn * face;
newDist.set(newVal, (newDist.get(newVal) || 0) + pEach);
}
}
dist = newDist;
if (dist.size > maxWidth) break;
}
if (dist.size > maxWidth) break;
}
const shiftedDist = new Map();
for (const [val, prob] of dist) shiftedDist.set(val + parsed.flatBonus, prob);
const sortedVals = [...shiftedDist.keys()].sort((a, b) => a - b);
const probs = sortedVals.map(v => shiftedDist.get(v));
const mean = sortedVals.reduce((s, v, i) => s + v * probs[i], 0);
return { values: sortedVals, probs, min: sortedVals[0], max: sortedVals[sortedVals.length - 1], mean };
}
function simulateRolls(parsed, n = 1000) {
let totalSum = 0, totalSq = 0, rmin = Infinity, rmax = -Infinity;
for (let i = 0; i < n; i++) {
let roll = parsed.flatBonus;
for (const comp of parsed.components) {
const sgn = comp.sign === -1 ? -1 : 1;
for (let j = 0; j < comp.count; j++) roll += sgn * (Math.floor(Math.random() * comp.die) + 1);
}
totalSum += roll;
totalSq += roll * roll;
if (roll < rmin) rmin = roll;
if (roll > rmax) rmax = roll;
}
const avg = totalSum / n;
return { min: rmin, max: rmax, average: avg, stddev: Math.sqrt(Math.max(0, totalSq / n - avg * avg)), n };
}
function singleRoll(parsed) {
let roll = parsed.flatBonus;
for (const comp of parsed.components) {
const sgn = comp.sign === -1 ? -1 : 1;
for (let j = 0; j < comp.count; j++) roll += sgn * (Math.floor(Math.random() * comp.die) + 1);
}
return roll;
}

// ==================== CR & XP TABLES ====================
const crTable2014 = {
0: [1, 6], 0.125: [7, 35], 0.25: [36, 49], 0.5: [50, 70],
1: [71, 85], 2: [86, 100], 3: [101, 115], 4: [116, 130],
5: [131, 145], 6: [146, 160], 7: [161, 175], 8: [176, 190],
9: [191, 205], 10: [206, 220], 11: [221, 235], 12: [236, 250],
13: [251, 265], 14: [266, 280], 15: [281, 295], 16: [296, 310],
17: [311, 325], 18: [326, 340], 19: [341, 355], 20: [356, 400],
21: [401, 445], 22: [446, 490], 23: [491, 535], 24: [536, 580],
25: [581, 625], 26: [626, 670], 27: [671, 715], 28: [716, 760],
29: [761, 805], 30: [806, 850]
};
const crTable2024 = {
0: [1, 8], 0.125: [7, 38], 0.25: [36, 52], 0.5: [50, 75],
1: [71, 90], 2: [86, 105], 3: [101, 120], 4: [116, 135],
5: [131, 150], 6: [146, 168], 7: [161, 185], 8: [176, 200],
9: [191, 218], 10: [206, 235], 11: [221, 252], 12: [236, 268],
13: [251, 285], 14: [266, 302], 15: [281, 320], 16: [296, 338],
17: [311, 355], 18: [326, 372], 19: [341, 390], 20: [356, 420],
21: [401, 468], 22: [446, 518], 23: [491, 568], 24: [536, 618],
25: [581, 668], 26: [626, 718], 27: [671, 768], 28: [716, 818],
29: [761, 868], 30: [806, 920]
};
function getCRRange(cr) {
const r2014 = crTable2014[cr] || [1, 10];
const r2024 = crTable2024[cr] || [1, 12];
return { min: Math.min(r2014[0], r2024[0]), max: Math.max(r2014[1], r2024[1]), range2014: r2014, range2024: r2024 };
}
const adventuringDayXP = {1:300,2:600,3:1200,4:1700,5:3500,6:4000,7:5000,8:6000,9:7500,10:9000,11:10500,12:11500,13:13500,14:15000,15:18000,16:20000,17:25000,18:27000,19:30000,20:40000};
const xpThresholds = {
1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
5: { easy: 250, medium: 500, hard: 750, deadly: 1100 },
6: { easy: 300, medium: 600, hard: 900, deadly: 1400 },
7: { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
8: { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
9: { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
11: { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
12: { easy: 900, medium: 1800, hard: 2700, deadly: 4000 },
13: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
14: { easy: 1200, medium: 2400, hard: 3600, deadly: 5100 },
15: { easy: 1300, medium: 2600, hard: 3900, deadly: 5700 },
16: { easy: 1500, medium: 3000, hard: 4500, deadly: 6400 },
17: { easy: 1800, medium: 3600, hard: 5400, deadly: 7200 },
18: { easy: 2000, medium: 4000, hard: 6000, deadly: 8000 },
19: { easy: 2100, medium: 4200, hard: 6300, deadly: 8400 },
20: { easy: 2400, medium: 4800, hard: 7200, deadly: 9600 }
};
const crToXP = {
0: 10, 0.125: 25, 0.25: 50, 0.5: 100,
1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900,
9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000,
16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000,
26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000
};
const xpForLevel = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
function getGroupMultiplier(numMonsters, numPCs) {
const ratio = numMonsters / Math.max(1, numPCs);
if (numMonsters <= 1) return 1;
if (numMonsters === 2) return 1.5;
if (numMonsters <= 6) {
if (numPCs <= 2) return numMonsters <= 6 ? 2 : 1.5;
if (numPCs <= 4) return numMonsters <= 6 ? 2 : 1.5;
return numMonsters <= 6 ? 1.5 : 1;
}
if (numMonsters <= 10) return numPCs >= 6 ? 2 : 2.5;
if (numMonsters <= 14) return numPCs >= 6 ? 2.5 : 3;
return numPCs >= 6 ? 3 : 4;
}
function getProfByCR(cr) {
if (cr <= 4) return 2; if (cr <= 8) return 3; if (cr <= 12) return 4;
if (cr <= 16) return 5; if (cr <= 20) return 6; if (cr <= 24) return 7;
if (cr <= 28) return 8; return 9;
}
function getAtkBonusByCR(cr) {
if (cr <= 0) return 3; if (cr <= 1) return 3; if (cr <= 3) return 5;
if (cr <= 5) return 6; if (cr <= 7) return 7; if (cr <= 9) return 9;
if (cr <= 11) return 10; if (cr <= 13) return 11; if (cr <= 15) return 12;
if (cr <= 17) return 13; if (cr <= 19) return 13; if (cr <= 23) return 15;
return 16;
}
function getDCByCR(cr) {
if (cr <= 1) return 13; if (cr <= 4) return 13; if (cr <= 6) return 14;
if (cr <= 8) return 15; if (cr <= 10) return 15; if (cr <= 12) return 17;
if (cr <= 14) return 18; if (cr <= 16) return 18; if (cr <= 18) return 20;
if (cr <= 20) return 21; if (cr <= 22) return 22; if (cr <= 24) return 23;
if (cr <= 26) return 24; return 25;
}
const spellSlotsTable = {
full: {
1:[2,0,0,0,0,0,0,0,0],2:[3,0,0,0,0,0,0,0,0],3:[4,2,0,0,0,0,0,0,0],
4:[4,3,0,0,0,0,0,0,0],5:[4,3,2,0,0,0,0,0,0],6:[4,3,3,0,0,0,0,0,0],
7:[4,3,3,1,0,0,0,0,0],8:[4,3,3,2,0,0,0,0,0],9:[4,3,3,3,1,0,0,0,0],
10:[4,3,3,3,2,0,0,0,0],11:[4,3,3,3,2,1,0,0,0],12:[4,3,3,3,2,1,0,0,0],
13:[4,3,3,3,2,1,1,0,0],14:[4,3,3,3,2,1,1,0,0],15:[4,3,3,3,2,1,1,1,0],
16:[4,3,3,3,2,1,1,1,0],17:[4,3,3,3,2,1,1,1,1],18:[4,3,3,3,3,1,1,1,1],
19:[4,3,3,3,3,2,1,1,1],20:[4,3,3,3,3,2,2,1,1]
},
half: {
1:[0,0,0,0,0,0,0,0,0],2:[2,0,0,0,0,0,0,0,0],3:[3,0,0,0,0,0,0,0,0],
4:[3,0,0,0,0,0,0,0,0],5:[4,2,0,0,0,0,0,0,0],6:[4,2,0,0,0,0,0,0,0],
7:[4,3,0,0,0,0,0,0,0],8:[4,3,0,0,0,0,0,0,0],9:[4,3,2,0,0,0,0,0,0],
10:[4,3,2,0,0,0,0,0,0],11:[4,3,3,0,0,0,0,0,0],12:[4,3,3,0,0,0,0,0,0],
13:[4,3,3,1,0,0,0,0,0],14:[4,3,3,1,0,0,0,0,0],15:[4,3,3,2,0,0,0,0,0],
16:[4,3,3,2,0,0,0,0,0],17:[4,3,3,3,1,0,0,0,0],18:[4,3,3,3,1,0,0,0,0],
19:[4,3,3,3,2,0,0,0,0],20:[4,3,3,3,2,0,0,0,0]
},
third: {
1:[0,0,0,0,0,0,0,0,0],2:[0,0,0,0,0,0,0,0,0],3:[3,0,0,0,0,0,0,0,0],
4:[3,0,0,0,0,0,0,0,0],5:[3,0,0,0,0,0,0,0,0],6:[3,0,0,0,0,0,0,0,0],
7:[4,2,0,0,0,0,0,0,0],8:[4,2,0,0,0,0,0,0,0],9:[4,2,0,0,0,0,0,0,0],
10:[4,3,0,0,0,0,0,0,0],11:[4,3,0,0,0,0,0,0,0],12:[4,3,0,0,0,0,0,0,0],
13:[4,3,1,0,0,0,0,0,0],14:[4,3,1,0,0,0,0,0,0],15:[4,3,2,0,0,0,0,0,0],
16:[4,3,2,0,0,0,0,0,0],17:[4,3,3,0,0,0,0,0,0],18:[4,3,3,0,0,0,0,0,0],
19:[4,3,3,1,0,0,0,0,0],20:[4,3,3,1,0,0,0,0,0]
},
warlock: {
1:[1,0,0,0,0,0,0,0,0],2:[2,0,0,0,0,0,0,0,0],3:[2,0,0,0,0,0,0,0,0],
4:[2,0,0,0,0,0,0,0,0],5:[2,0,0,0,0,0,0,0,0],6:[2,0,0,0,0,0,0,0,0],
7:[2,0,0,0,0,0,0,0,0],8:[2,0,0,0,0,0,0,0,0],9:[2,0,0,0,0,0,0,0,0],
10:[2,2,0,0,0,0,0,0,0],11:[3,0,0,0,0,0,0,0,0],12:[3,0,0,0,0,0,0,0,0],
13:[3,0,0,0,0,0,0,0,0],14:[3,0,0,0,0,0,0,0,0],15:[3,0,0,0,0,0,0,0,0],
16:[3,0,0,0,0,0,0,0,0],17:[4,0,0,0,0,0,0,0,0],18:[4,0,0,0,0,0,0,0,0],
19:[4,0,0,0,0,0,0,0,0],20:[4,0,0,0,0,0,0,0,0]
}
};
function getWarlockSlotLevel(lvl) {
if (lvl <= 4) return 1; if (lvl <= 8) return 2; if (lvl <= 14) return 3; return 4;
}
const monsterNames = {
aberration: ['Mindshredder','Gibbering','Star-Spawn','Otyugh','Aboleth','Chitine','Doppelganger','Grell','Intellect Devourer','Cloaker'],
beast: ['Dire Wolf','Giant Spider','Winter Wolf','Giant Constrictor Snake','Giant Ape','Triceratops','Giant Scorpion','Swarm of Ravens','Polar Bear','Giant Wasp'],
celestial: ['Deva','Planetar','Unicorn','Pegasus','Couatl','Ki-rin','Empyrean','Solar','Aasimar Guardian','Lantern Archon'],
construct: ['Stone Golem','Iron Cobra','Animated Armor','Flesh Golem','Clay Golem','Helmed Horror','Shield Guardian','Modron','Scarecrow','Homunculus'],
dragon: ['Dracolich','Dragon Turtle','Wyvern','Pseudodragon','Drake','Faerie Dragon','Shadow Dragon','Wyrmling','Young Dragon','Adult Dragon'],
elemental: ['Magmin','Gargoyle','Salamander','Djinni','Efreeti','Invisible Stalker','Water Elemental','Earth Elemental','Azer','Xorn'],
fey: ['Green Hag','Boggle','Dryad','Satyr','Pixie','Sprite','Quickling','Redcap','Korred','Sea Hag'],
fiend: ['Imp','Quasit','Hell Hound','Succubus','Erinyes','Barbed Devil','Marilith','Balor','Glabrezu','Shadow Demon'],
giant: ['Hill Giant','Frost Giant','Fire Giant','Cloud Giant','Storm Giant','Cyclops','Ettin','Troll','Ogre','Stone Giant'],
humanoid: ['Bandit Captain','Cult Fanatic','Knight','Mage','Veteran','Gladiator','Tribal Warrior','Berserker','Priest','Assassin'],
monstrosity: ['Manticore','Chimera','Griffon','Basilisk','Medusa','Minotaur','Rust Monster','Owlbear','Bulette','Gorgon'],
ooze: ['Black Pudding','Gelatinous Cube','Ochre Jelly','Gray Ooze','Cranium Rat','Darkmantle','Myconid','Slithering Tracker','Plasm','Ooze Overlord'],
plant: ['Shambling Mound','Treant','Awakened Tree','Gas Spore','Violet Fungus','Shrieker','Myconid Sovereign','Thorn Slinger','Needle Blight','Vine Horror'],
undead: ['Wraith','Vampire Spawn','Lich','Mummy Lord','Death Knight','Ghast','Wight','Shadow','Specter','Bone Naga']
};
const environments = {
arctic: ['Remorhaz','Winter Wolf','Yeti','Ice Devil','Frost Giant','Polar Bear','White Dragon'],
coast: ['Sahuagin','Merrow','Sea Hag','Kraken','Locathah','Koalinth','Lizardfolk','Chuul'],
desert: ['Sphinx','Lamia','Gnoll','Dust Mephit','Sand Wyrmling','Basilisk','Ankheg','Jackalwere'],
forest: ['Green Hag','Owlbear','Displacer Beast','Gnoll','Bugbear','Goblin','Wolf','Dire Wolf','Treant'],
grassland: ['Centaur','Hippogriff','Griffon','Bulette','Werewolf','Lion','Elephant','Roc'],
mountain: ['Stone Giant','Roc','Gargoyle','Wyvern','Griffon','Harpy','Peryton','Earth Elemental'],
swamp: ['Lizardfolk','Bullywug','Hydra','Black Pudding','Will-o-Wisp','Green Hag','Boggle','Blight'],
underdark: ['Mind Flayer','Beholder','Hook Horror','Grimlock','Darkmantle','Troglodyte','Deep Gnome','Roper'],
urban: ['Assassin','Bandit','Cultist','Spy','Mage','Thug','Kobold','Goblin','Rat Swarm','Shadow']
};

// ==================== DOM HELPERS ====================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
// Escape untrusted strings before they touch innerHTML.
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);
let currentHPResult = null;
function safeParse(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const val = JSON.parse(raw);
    return val == null ? fallback : val;
  } catch (err) {
    console.warn('Discarding corrupted storage key: ' + key, err);
    try { localStorage.removeItem(key); } catch (e2) { /* ignore */ }
    return fallback;
  }
}
let savedStates = safeParse('ddhp_saves', []);
if (!Array.isArray(savedStates)) savedStates = [];
let lastSession = safeParse('ddhp_lastSession', null);

// ==================== TAB SWITCHING ====================
function switchTab(tabId) {
$$('.tab-btn').forEach(b => b.classList.remove('active'));
$$('.tab-panel').forEach(p => p.classList.remove('active'));
const btn = document.querySelector(`[data-tab="${tabId}"]`);
const panel = document.getElementById(tabId);
if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }
if (panel) panel.classList.add('active');
$$('.tab-btn').forEach(b => { b.setAttribute('aria-selected', 'false'); b.setAttribute('tabindex', '-1'); });
if (btn) { btn.setAttribute('aria-selected', 'true'); btn.setAttribute('tabindex', '0'); }
}
$$('.tab-btn').forEach(btn => { btn.addEventListener('click', () => switchTab(btn.dataset.tab)); });
// Arrow-key navigation across the tablist (WAI-ARIA tabs pattern).
document.querySelector('.tab-nav').addEventListener('keydown', (e) => {
const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
if (!keys.includes(e.key)) return;
const tabs = Array.from($$('.tab-btn'));
const i = tabs.indexOf(document.activeElement);
if (i === -1) return;
e.preventDefault();
let next = i;
if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
else if (e.key === 'Home') next = 0;
else next = tabs.length - 1;
switchTab(tabs[next].dataset.tab);
tabs[next].focus();
});

// ==================== DARK MODE ====================
const darkToggle = $('#btnDarkToggle');
function applyDark(on) {
document.body.classList.toggle('dark', on);
darkToggle.setAttribute('aria-pressed', String(on));
}
applyDark(localStorage.getItem('ddhp_dark') === 'true');
darkToggle.addEventListener('click', () => {
const on = !document.body.classList.contains('dark');
applyDark(on);
try { localStorage.setItem('ddhp_dark', String(on)); } catch (err) { console.warn('Could not persist theme', err); }
});

// ==================== AUTO-SAVE ====================
function autoSave() {
const state = {
expression: $('#hdExpression').value, batchInput: $('#batchInput').value,
creatureSize: $('#creatureSize').value, creatureNumHD: $('#creatureNumHD').value,
creatureConMod: $('#creatureConMod').value, creatureFlatBonus: $('#creatureFlatBonus').value,
effBaseHP: $('#effBaseHP').value, effCR: $('#effCR').value,
effLegendaryResist: $('#effLegendaryResist').value, effRegen: $('#effRegen').value,
effTempHP: $('#effTempHP').value, pcRuleset: $('#pcRuleset').value,
pcConMod: $('#pcConMod').value, revTargetCR: $('#revTargetCR').value,
revSize: $('#revSize').value, probExpression: $('#probExpression').value,
timestamp: Date.now()
};
localStorage.setItem('ddhp_lastSession', JSON.stringify(state));
}
if (lastSession) {
try {
for (const [key, val] of Object.entries(lastSession)) {
const el = document.getElementById(key);
if (el && val !== undefined && key !== 'timestamp') el.value = val;
}
} catch (e) { console.warn('Could not restore the last session', e); }
}
document.addEventListener('input', (e) => {
if (e.target.closest('input,textarea,select') && !e.target.closest('#saveLoadModal')) {
clearTimeout(window._autoSaveTimer);
window._autoSaveTimer = setTimeout(autoSave, 1500);
}
});

// ==================== SAVE/LOAD MODAL ====================
const modal = $('#saveLoadModal');
$('#btnSave').addEventListener('click', () => {
const name = prompt('Enter a name for this save:', 'Save ' + new Date().toLocaleString());
if (!name) return;
const state = safeParse('ddhp_lastSession', {}) || {};
state.name = name; state.timestamp = Date.now();
savedStates.push(state);
let dropped = 0;
if (savedStates.length > 20) { dropped = savedStates.length - 20; savedStates = savedStates.slice(-20); }
try { localStorage.setItem('ddhp_saves', JSON.stringify(savedStates)); }
catch (err) { alert('Could not save: browser storage is full.'); return; }
alert('State saved as: ' + name + (dropped ? '\n\nNote: the ' + dropped + ' oldest save(s) were removed (20 slot limit).' : ''));
});
$('#btnLoad').addEventListener('click', () => {
savedStates = safeParse('ddhp_saves', []);
if (!Array.isArray(savedStates)) savedStates = [];
if (savedStates.length === 0) { alert('No saved states found.'); return; }
let html = '<ul style="list-style:none;padding:0;">';
savedStates.forEach((s, i) => {
html += `<li style="padding:8px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;justify-content:space-between;" data-idx="${i}">
<span>${esc(s.name || 'Unnamed')} <small>(${esc(new Date(s.timestamp).toLocaleString())})</small></span>
<button class="small" data-del="${i}">🗑️</button></li>`;
});
html += '</ul>';
$('#modalTitle').textContent = 'Load Saved State';
$('#modalContent').innerHTML = html;
modal.showModal();
$('#modalContent').querySelectorAll('li').forEach(li => {
li.addEventListener('click', (e) => {
if (e.target.closest('button')) return;
const idx = parseInt(li.dataset.idx);
const state = savedStates[idx];
for (const [key, val] of Object.entries(state)) {
const el = document.getElementById(key);
if (el && val !== undefined && key !== 'name' && key !== 'timestamp') el.value = val;
}
modal.close();
switchTab(__getInitialTab());
$('#btnCalculate').click();
});
});
$('#modalContent').querySelectorAll('[data-del]').forEach(btn => {
btn.addEventListener('click', (e) => {
e.stopPropagation();
savedStates.splice(parseInt(btn.dataset.del), 1);
localStorage.setItem('ddhp_saves', JSON.stringify(savedStates));
$('#btnLoad').click();
});
});
});
$('#btnCloseModal').addEventListener('click', () => modal.close());
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
$('#btnPrint').addEventListener('click', () => window.print());

// ==================== TAB 1: CALCULATOR ====================
function displayHPResult(result, resultGridId, breakdownId) {
const grid = document.getElementById(resultGridId);
const bd = document.getElementById(breakdownId);
if (!grid || !bd) return;
grid.innerHTML = `
<div class="result-item"><div class="value">${result.average}</div><div class="label">Average HP</div></div>
<div class="result-item"><div class="value">${result.min}</div><div class="label">Minimum HP</div></div>
<div class="result-item"><div class="value">${result.max}</div><div class="label">Maximum HP</div></div>
<div class="result-item"><div class="value">${result.totalHD}</div><div class="label">Total HD</div></div>`;
let breakdownHTML = '<strong>Step-by-Step Breakdown:</strong><br>';
for (const db of result.dieBreakdown) {
breakdownHTML += `<span class="die-group">${db.label}</span>: avg ${db.avgPerDie.toFixed(1)}/die → ${db.compAvg.toFixed(1)} total (min ${db.compMin}, max ${db.compMax})<br>`;
}
if (result.flatBonus !== 0) {
breakdownHTML += `Flat bonus: <span style="color:${result.flatBonus>=0?'var(--success)':'var(--danger)'}">${fmtMod(result.flatBonus)}</span><br>`;
}
breakdownHTML += `<strong>Final:</strong> ${result.exactAverage.toFixed(1)} (rounded to <strong>${result.average}</strong>), range ${result.min}–${result.max}`;
bd.innerHTML = breakdownHTML;
}
$('#btnCalculate').addEventListener('click', () => {
const expr = $('#hdExpression').value;
const parsed = parseHDExpression(expr);
if (!parsed.valid) { $('#resultGrid').innerHTML = '<p style="color:var(--danger);">\u26A0 ' + esc(parsed.error || 'Invalid expression.') + '</p>'; $('#breakdown').innerHTML = ''; return; }
currentHPResult = calculateHP(parsed);
displayHPResult(currentHPResult, 'resultGrid', 'breakdown');
$('#sbHP').value = currentHPResult.expression + ' (' + currentHPResult.average + ' avg)';
$('#probExpression').value = currentHPResult.expression;
autoSave();
});
$('#btnBatchCalculate').addEventListener('click', () => {
const raw = $('#batchInput').value;
const lines = raw.split(/[\n;,]+/).map(l => l.trim()).filter(l => l);
if (lines.length === 0) { $('#batchResults').innerHTML = '<p>No expressions entered.</p>'; return; }
let html = '<table><thead><tr><th>#</th><th>Expression</th><th>Average</th><th>Min</th><th>Max</th></tr></thead><tbody>';
let sumAvg = 0;
lines.forEach((line, i) => {
const parsed = parseHDExpression(line);
if (parsed.valid) {
const r = calculateHP(parsed);
sumAvg += r.average;
html += `<tr><td>${i+1}</td><td><code>${r.expression}</code></td><td><strong>${r.average}</strong></td><td>${r.min}</td><td>${r.max}</td></tr>`;
} else {
html += `<tr><td>${i+1}</td><td><code>${line}</code></td><td colspan="3" style="color:var(--danger);">Invalid</td></tr>`;
}
});
html += `<tr style="font-weight:700;background:var(--highlight);"><td colspan="2">Sum of Averages</td><td><strong>${sumAvg}</strong></td><td colspan="2"></td></tr>`;
html += '</tbody></table>';
$('#batchResults').innerHTML = html;
autoSave();
});

// ==================== TAB 2: CREATURE ====================
$('#btnConScore').addEventListener('click', () => {
const score = parseInt($('#creatureConScore').value) || 10;
$('#creatureConMod').value = Math.floor((score - 10) / 2);
});
$('#btnBuildCreature').addEventListener('click', () => {
const dieSize = $('#creatureSize').value;
const numHD = parseInt($('#creatureNumHD').value) || 1;
const conMod = parseInt($('#creatureConMod').value) || 0;
const flatBonus = parseInt($('#creatureFlatBonus').value) || 0;
const expr = `${numHD}${dieSize}` + (conMod * numHD + flatBonus >= 0 ? '+' : '') + (conMod * numHD + flatBonus);
$('#hdExpression').value = expr;
const parsed = parseHDExpression(expr);
const result = calculateHP(parsed);
currentHPResult = result;
displayHPResult(result, 'creatureResultGrid', 'creatureBreakdown');
$('#sbHP').value = result.expression + ' (' + result.average + ' avg)';
$('#probExpression').value = result.expression;
autoSave();
});

// ==================== TAB 3: EFFECTIVE HP ====================
function getCheckedTypes(groupId) {
const checked = [];
document.querySelectorAll(`#${groupId} input:checked`).forEach(cb => checked.push(cb.dataset.type));
return checked;
}
$('#btnCalcEffective').addEventListener('click', () => {
const baseHP = parseInt($('#effBaseHP').value) || 100;
const crTier = parseInt($('#effCR').value);
const resistances = getCheckedTypes('resistancesGroup');
const immunities = getCheckedTypes('immunitiesGroup');
const vulnerabilities = getCheckedTypes('vulnerabilitiesGroup');
const legResistCount = parseInt($('#effLegendaryResist').value) || 0;
const regen = parseInt($('#effRegen').value) || 0;
const tempHP = parseInt($('#effTempHP').value) || 0;
const effResistances = resistances.filter(r => !immunities.includes(r));
const effVulnerabilities = vulnerabilities.filter(v => !immunities.includes(v));
const finalVulnerabilities = effVulnerabilities.filter(v => !effResistances.includes(v));
const allDefensive = [...new Set([...effResistances, ...immunities])];
let multiplier = 1.0;
let multExplanation = 'No resistances/immunities → multiplier ×1.0';
if (allDefensive.length >= 3) { multiplier = 2.0; multExplanation = `≥3 types (${allDefensive.join(', ')}) → <strong>×2.0</strong>`; }
else if (allDefensive.length === 2) { multiplier = 1.5; multExplanation = `2 types (${allDefensive.join(', ')}) → <strong>×1.5</strong>`; }
else if (allDefensive.length === 1) { multiplier = 1.25; multExplanation = `1 type (${allDefensive.join(', ')}) → <strong>×1.25</strong>`; }
if (finalVulnerabilities.length > 0) {
multiplier *= 0.5;
multExplanation += `<br>Vulnerabilities (${finalVulnerabilities.join(', ')}) → ×0.5`;
}
const effectiveFromDefenses = Math.round(baseHP * multiplier);
let legResistBonusPerUse = 10;
if (crTier >= 11) legResistBonusPerUse = 30;
else if (crTier >= 5) legResistBonusPerUse = 20;
const legResistTotal = legResistCount * legResistBonusPerUse;
const regenBonus = regen * 3;
const totalEffective = effectiveFromDefenses + legResistTotal + regenBonus + tempHP;
$('#effResultGrid').innerHTML = `
<div class="result-item"><div class="value">${baseHP}</div><div class="label">Base HP</div></div>
<div class="result-item"><div class="value">×${multiplier.toFixed(2)}</div><div class="label">Defense Mult</div></div>
<div class="result-item"><div class="value">${effectiveFromDefenses}</div><div class="label">After Defenses</div></div>
<div class="result-item"><div class="value">+${legResistTotal}</div><div class="label">Leg. Resist</div></div>
<div class="result-item"><div class="value">+${regenBonus}</div><div class="label">Regen</div></div>
<div class="result-item"><div class="value">+${tempHP}</div><div class="label">Temp HP</div></div>
<div class="result-item" style="grid-column:1/-1;background:var(--accent);color:#fff;"><div class="value" style="color:#fff;">${totalEffective}</div><div class="label" style="color:#ffe8d0;">Effective HP Total</div></div>`;
$('#effExplanation').innerHTML = multExplanation + `<br>Legendary Resistance: CR tier ${crTier} → +${legResistBonusPerUse}/use. Regen: +3×. Temp HP: flat.`;
autoSave();
});
$('#btnCalcDPR').addEventListener('click', () => {
const dpr = parseFloat($('#dprInput').value) || 30;
let hpToUse = currentHPResult ? currentHPResult.average : parseInt($('#effBaseHP').value) || 100;
const effHPText = $('#effResultGrid').querySelector('.result-item:last-child .value');
if (effHPText) { const ehp = parseInt(effHPText.textContent); if (!isNaN(ehp) && ehp > 0) hpToUse = ehp; }
$('#dprResult').innerHTML = `<strong>Survival Estimate:</strong> ${hpToUse} eff. HP ÷ ${dpr} DPR ≈ <strong>${(hpToUse / dpr).toFixed(1)} rounds</strong>.`;
});

// ==================== TAB 4: REVERSE ====================
$('#btnReverse').addEventListener('click', () => {
const targetCR = parseFloat($('#revTargetCR').value);
const prefSize = $('#revSize').value;
const crRange = getCRRange(targetCR);
const dieSizes = prefSize === 'any' ? ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] : [prefSize];
const suggestions = [];
for (const dieStr of dieSizes) {
const die = parseInt(dieStr.replace('d', ''));
const dieAvg = (die + 1) / 2;
for (let conMod = -3; conMod <= 8; conMod++) {
for (let numHD = 1; numHD <= 50; numHD++) {
const avgHP = Math.round(numHD * dieAvg + numHD * conMod);
if (avgHP >= crRange.min && avgHP <= crRange.max) {
const expr = `${numHD}${dieStr}` + (conMod * numHD >= 0 ? '+' : '') + (conMod * numHD);
const tier = avgHP <= crRange.min + (crRange.max - crRange.min) / 3 ? 'Low' : avgHP >= crRange.max - (crRange.max - crRange.min) / 3 ? 'High' : 'Mid';
suggestions.push({ expr, avgHP, numHD, dieStr, conMod, tier, score: Math.abs(avgHP - (crRange.min + crRange.max) / 2) });
}
}
}
}
suggestions.sort((a, b) => a.score - b.score);
const top = suggestions.slice(0, 8);
let html = `<p>Target CR <strong>${targetCR}</strong>: HP range ${crRange.range2014[0]}–${crRange.range2014[1]} (2014) / ${crRange.range2024[0]}–${crRange.range2024[1]} (2024).</p>`;
html += '<table><thead><tr><th>Expression</th><th>Avg HP</th><th>HD</th><th>Die</th><th>Con</th><th>Tier</th><th>Action</th></tr></thead><tbody>';
top.forEach(s => {
html += `<tr><td><code>${s.expr}</code></td><td><strong>${s.avgHP}</strong></td><td>${s.numHD}</td><td>${s.dieStr}</td><td>${fmtMod(s.conMod)}</td>
<td><span class="badge ${s.tier==='Low'?'warn':s.tier==='High'?'':'green'}">${s.tier}</span></td>
<td><button class="small use-suggestion" data-expr="${s.expr}">Use</button></td></tr>`;
});
html += '</tbody></table>';
$('#reverseResults').innerHTML = html;
$('#reverseResults').querySelectorAll('.use-suggestion').forEach(btn => {
btn.addEventListener('click', () => {
$('#hdExpression').value = btn.dataset.expr;
switchTab(__getInitialTab());
$('#btnCalculate').click();
});
});
autoSave();
});

// ==================== TAB 5: PC BUILDER ====================
$('#btnAddClass').addEventListener('click', () => {
const row = document.createElement('div');
row.className = 'pc-class-row input-row';
row.style.marginBottom = '8px';
row.innerHTML = `
<select class="pc-class-select">
<option value="d12">Barbarian (d12)</option><option value="d10">Fighter (d10)</option>
<option value="d10">Paladin (d10)</option><option value="d10">Ranger (d10)</option>
<option value="d8" selected>Monk (d8)</option><option value="d8">Rogue (d8)</option>
<option value="d8">Bard (d8)</option><option value="d8">Cleric (d8)</option>
<option value="d8">Druid (d8)</option><option value="d8">Warlock (d8)</option>
<option value="d8">Artificer (d8)</option><option value="d6">Wizard (d6)</option>
<option value="d6">Sorcerer (d6)</option></select>
<input type="number" class="pc-levels" value="1" min="1" max="20">
<button class="small pc-remove-class" style="flex:0 0 auto;">✕</button>`;
$('#pcClasses').appendChild(row);
});
document.addEventListener('click', (e) => {
if (e.target.classList.contains('pc-remove-class')) e.target.closest('.pc-class-row').remove();
});
$('#btnCalcPC').addEventListener('click', () => {
const ruleset = $('#pcRuleset').value;
const conMod = parseInt($('#pcConMod').value) || 0;
const tough = $('#pcTough').checked;
const hillDwarf = $('#pcHillDwarf').checked;
const draconic = $('#pcDraconic').checked;
const customBonus = parseInt($('#pcCustomBonus').value) || 0;
const bonusPerLevel = (tough ? 2 : 0) + (hillDwarf ? 1 : 0) + (draconic ? 1 : 0) + customBonus;
const classRows = $$('.pc-class-row');
let totalHP = 0, breakdownLines = [], totalLevel = 0;
const fixedMap = { 'd6': 4, 'd8': 5, 'd10': 6, 'd12': 7 };
classRows.forEach((row, idx) => {
const dieSize = row.querySelector('.pc-class-select').value;
const levels = parseInt(row.querySelector('.pc-levels').value) || 0;
if (levels <= 0) return;
const die = parseInt(dieSize.replace('d', ''));
const fixedVal = fixedMap[dieSize] || Math.ceil((die + 1) / 2);
let classHP = 0;
for (let lvl = 1; lvl <= levels; lvl++) {
totalLevel++;
let hpThisLevel;
if (idx === 0 && lvl === 1) hpThisLevel = die + conMod + bonusPerLevel; // only the starting class maxes level 1
else hpThisLevel = fixedVal + conMod + bonusPerLevel;
classHP += hpThisLevel;
breakdownLines.push(`Level ${totalLevel} (Class ${idx+1}, ${dieSize}, class level ${lvl})${idx === 0 && lvl === 1 ? ' [max die — starting class]' : ' [fixed avg]'}: +${hpThisLevel} → total ${totalHP + classHP}`);
}
totalHP += classHP;
});
$('#pcResultGrid').innerHTML = `
<div class="result-item"><div class="value">${totalHP}</div><div class="label">Max HP</div></div>
<div class="result-item"><div class="value">${totalLevel}</div><div class="label">Total Levels</div></div>
<div class="result-item"><div class="value">${ruleset}</div><div class="label">Ruleset</div></div>
<div class="result-item"><div class="value">+${bonusPerLevel}/lvl</div><div class="label">Bonus/Level</div></div>`;
$('#pcBreakdown').innerHTML = `<div style="margin-bottom:8px;color:var(--text2);font-size:0.85rem;">Ruleset <strong>${esc(ruleset)}</strong>: fixed HP values are identical in 2014 and 2024. Only the <strong>starting class</strong> gets its maximum die at 1st level; every multiclass level uses the fixed average.</div>` + breakdownLines.map(l => `<div>${esc(l)}</div>`).join('');
autoSave();
});

// ==================== TAB 6: PROBABILITY ====================
function drawHistogram(canvas, dist) {
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
const rect = canvas.getBoundingClientRect();
canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
ctx.scale(dpr, dpr);
const W = rect.width, H = rect.height;
ctx.clearRect(0, 0, W, H);
const { values, probs, mean } = dist;
if (values.length === 0) return;
const padding = { top: 20, right: 30, bottom: 50, left: 55 };
const plotW = W - padding.left - padding.right;
const plotH = H - padding.top - padding.bottom;
const maxProb = Math.max(...probs);
ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--input-bg').trim() || '#fffef9';
ctx.fillRect(0, 0, W, H);
ctx.strokeStyle = '#888'; ctx.lineWidth = 0.5;
ctx.beginPath();
ctx.moveTo(padding.left, padding.top);
ctx.lineTo(padding.left, padding.top + plotH);
ctx.lineTo(padding.left + plotW, padding.top + plotH);
ctx.stroke();
ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text2').trim() || '#4a3020';
ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
for (let i = 0; i <= 4; i++) {
const y = padding.top + plotH - (i / 4) * plotH;
ctx.fillText(((i / 4) * maxProb * 100).toFixed(1) + '%', padding.left - 6, y + 4);
}
const barWidth = Math.max(1, Math.min(plotW / values.length - 1, 30));
const accentColor = getComputedStyle(document.body).getPropertyValue('--bar-color').trim() || '#8b3a3a';
const accent2Color = getComputedStyle(document.body).getPropertyValue('--bar-color2').trim() || '#b5523c';
for (let i = 0; i < values.length; i++) {
const x = padding.left + (i / (values.length - 1 || 1)) * plotW - barWidth / 2;
const barH = (probs[i] / maxProb) * plotH;
const y = padding.top + plotH - barH;
ctx.fillStyle = values[i] <= mean + 0.5 && values[i] >= mean - 0.5 ? accent2Color : accentColor;
ctx.fillRect(x, y, barWidth, barH);
}
const meanX = padding.left + ((mean - values[0]) / (values[values.length - 1] - values[0] || 1)) * plotW;
ctx.strokeStyle = '#d4a040'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
ctx.beginPath(); ctx.moveTo(meanX, padding.top); ctx.lineTo(meanX, padding.top + plotH); ctx.stroke();
ctx.setLineDash([]);
ctx.fillStyle = '#d4a040'; ctx.textAlign = 'center';
ctx.fillText('Mean: ' + mean.toFixed(1), meanX, padding.top - 6);
ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text2').trim() || '#4a3020';
const numXLabels = Math.min(8, values.length);
for (let i = 0; i < numXLabels; i++) {
const idx = Math.floor(i * (values.length - 1) / (numXLabels - 1 || 1));
const x = padding.left + (idx / (values.length - 1 || 1)) * plotW;
ctx.fillText(values[idx], x, padding.top + plotH + 16);
}
ctx.fillText('HP Value', padding.left + plotW / 2, padding.top + plotH + 35);
}
$('#btnCalcProb').addEventListener('click', () => {
const expr = $('#probExpression').value;
const parsed = parseHDExpression(expr);
if (!parsed.valid) { $('#rollResult').textContent = parsed.error || 'Invalid expression.'; return; }
const totalDice = parsed.components.reduce((s, c) => s + Math.abs(c.count), 0);
let dist;
if (totalDice <= 200) dist = computeExactDistribution(parsed, 8000);
else {
const sim = simulateRolls(parsed, 5000);
dist = { values: [], probs: [], min: sim.min, max: sim.max, mean: sim.average, _simulated: true, _simData: sim };
}
const canvas = $('#probCanvas');
if (dist._simulated) {
const bucketCount = Math.min(60, dist._simData.max - dist._simData.min + 1);
const bucketSize = Math.max(1, Math.ceil((dist._simData.max - dist._simData.min + 1) / bucketCount));
const buckets = {};
for (let i = 0; i < 5000; i++) {
const r = singleRoll(parsed);
const bucket = Math.floor(r / bucketSize) * bucketSize;
buckets[bucket] = (buckets[bucket] || 0) + 1;
}
const sortedKeys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
dist = { values: sortedKeys, probs: sortedKeys.map(k => buckets[k] / 5000), min: dist._simData.min, max: dist._simData.max, mean: dist._simData.average, _simulated: true };
}
drawHistogram(canvas, dist);
$('#rollResult').textContent = dist._simulated ? `(Approx; ${totalDice} dice)` : `Exact (${totalDice} dice, ${dist.values.length} values). Mean: ${dist.mean.toFixed(1)}`;
window._currentProbDist = dist;
window._currentProbParsed = parsed;
autoSave();
});
$('#btnRollOnce').addEventListener('click', () => {
const parsed = window._currentProbParsed || parseHDExpression($('#probExpression').value);
if (!parsed.valid) { $('#rollResult').textContent = parsed.error || 'Invalid expression.'; return; }
const roll = singleRoll(parsed);
$('#rollResult').innerHTML = `<strong>🎲 Single Roll:</strong> <span style="font-size:1.5rem;color:var(--accent);">${roll}</span>`;
});
$('#btnRollMany').addEventListener('click', () => {
const parsed = window._currentProbParsed || parseHDExpression($('#probExpression').value);
if (!parsed.valid) { $('#simResult').textContent = parsed.error || 'Invalid expression.'; return; }
const sim = simulateRolls(parsed, 1000);
$('#simResult').innerHTML = `<strong>📊 1000-Roll Simulation:</strong> Min: <strong>${sim.min}</strong> | Max: <strong>${sim.max}</strong> | Avg: <strong>${sim.average.toFixed(2)}</strong> | σ: <strong>${sim.stddev.toFixed(2)}</strong>`;
});

// ==================== TAB 7: STATBLOCK ====================
function getModifier(score) { return Math.floor((score - 10) / 2); }
// fmtModSign is kept as an alias of fmtMod so both call sites share one implementation.
const fmtModSign = fmtMod;
$('#btnGenerateStatblock').addEventListener('click', () => {
const name = $('#sbName').value || 'Custom Monster';
const sizeType = $('#sbSizeType').value || 'Medium humanoid';
const align = $('#sbAlign').value || 'neutral';
const ac = $('#sbAC').value || '15';
const speed = $('#sbSpeed').value || '30 ft.';
const hpVal = $('#sbHP').value || (currentHPResult ? currentHPResult.expression + ' (' + currentHPResult.average + ' avg)' : '1');
const str = parseInt($('#sbSTR').value) || 10;
const dex = parseInt($('#sbDEX').value) || 10;
const con = parseInt($('#sbCON').value) || 10;
const intel = parseInt($('#sbINT').value) || 10;
const wis = parseInt($('#sbWIS').value) || 10;
const cha = parseInt($('#sbCHA').value) || 10;
const markdown = `> ## ${name}\n> *${sizeType}, ${align}*\n> ___\n> - **Armor Class** ${ac}\n> - **Hit Points** ${hpVal}\n> - **Speed** ${speed}\n> ___\n> | STR | DEX | CON | INT | WIS | CHA |\n> |:---:|:---:|:---:|:---:|:---:|:---:|\n> | ${str} (${fmtModSign(getModifier(str))}) | ${dex} (${fmtModSign(getModifier(dex))}) | ${con} (${fmtModSign(getModifier(con))}) | ${intel} (${fmtModSign(getModifier(intel))}) | ${wis} (${fmtModSign(getModifier(wis))}) | ${cha} (${fmtModSign(getModifier(cha))}) |\n> ___\n> **Actions**\n> *To be filled by the DM.*`;
const htmlPreview = `<div class="statblock">
<h2>${esc(name)}</h2>
<div class="sb-meta">${esc(sizeType)}, ${esc(align)}</div>
<div class="sb-line"><span class="sb-label">Armor Class</span> ${esc(ac)}</div>
<div class="sb-line"><span class="sb-label">Hit Points</span> ${esc(hpVal)}</div>
<div class="sb-line"><span class="sb-label">Speed</span> ${esc(speed)}</div>
<div class="sb-line" style="text-align:center;">
<strong>STR</strong> ${str} (${fmtModSign(getModifier(str))}) | <strong>DEX</strong> ${dex} (${fmtModSign(getModifier(dex))}) | <strong>CON</strong> ${con} (${fmtModSign(getModifier(con))}) |
<strong>INT</strong> ${intel} (${fmtModSign(getModifier(intel))}) | <strong>WIS</strong> ${wis} (${fmtModSign(getModifier(wis))}) | <strong>CHA</strong> ${cha} (${fmtModSign(getModifier(cha))})
</div>
<div class="sb-line"><em>Actions to be filled by the DM.</em></div></div>`;
$('#statblockPreview').innerHTML = htmlPreview;
window._statblockMarkdown = markdown;
window._statblockJSON = { name, sizeType, alignment: align, ac, hp: hpVal, speed, abilities: { str, dex, con, int: intel, wis, cha }, hdExpression: currentHPResult ? currentHPResult.expression : '', averageHP: currentHPResult ? currentHPResult.average : null };
autoSave();
});
$('#btnCopyStatblock').addEventListener('click', () => {
if (!window._statblockMarkdown) { alert('Generate a statblock first.'); return; }
navigator.clipboard.writeText(window._statblockMarkdown).then(() => alert('Markdown copied!')).catch(() => alert('Copy failed.'));
});
$('#btnExportJSON').addEventListener('click', () => {
if (!window._statblockJSON) { alert('Generate a statblock first.'); return; }
const json = JSON.stringify(window._statblockJSON, null, 2);
navigator.clipboard.writeText(json).then(() => alert('JSON exported!')).catch(() => {
const blob = new Blob([json], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a'); a.href = url; a.download = 'monster-statblock.json'; a.click();
URL.revokeObjectURL(url);
});
});

// ==================== TAB 8: COMPARE ====================
$('#btnCompare').addEventListener('click', () => {
const exprs = [];
$$('.compare-expr').forEach(input => { if (input.value.trim()) exprs.push(input.value.trim()); });
if (exprs.length < 2) { $('#compareResults').innerHTML = '<p>Enter at least 2 expressions.</p>'; return; }
const results = exprs.map(e => ({ expr: e, parsed: parseHDExpression(e), hp: null }));
results.forEach(r => { if (r.parsed.valid) r.hp = calculateHP(r.parsed); });
let html = '<table><thead><tr><th>Expression</th><th>Average</th><th>Min</th><th>Max</th><th>Durability</th></tr></thead><tbody>';
const maxAvg = Math.max(...results.filter(r => r.hp).map(r => r.hp.average), 1);
results.forEach(r => {
if (r.hp) {
const durability = (r.hp.average / maxAvg * 100).toFixed(0);
html += `<tr><td><code>${r.hp.expression}</code></td><td><strong>${r.hp.average}</strong></td><td>${r.hp.min}</td><td>${r.hp.max}</td><td>${durability}%</td></tr>`;
} else {
html += `<tr><td><code>${r.expr}</code></td><td colspan="4" style="color:var(--danger);">Invalid</td></tr>`;
}
});
html += '</tbody></table>';
$('#compareResults').innerHTML = html;
autoSave();
});

// ==================== TAB 9: TEMPLATES ====================
const dieStepOrder = ['d2', 'd3', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
$('#templateSelect').addEventListener('change', function() {
$('#customTemplateFields').style.display = this.value === 'custom' ? 'flex' : 'none';
});
$('#btnApplyTemplate').addEventListener('click', () => {
const template = $('#templateSelect').value;
const parsed = parseHDExpression($('#hdExpression').value);
if (!parsed.valid && template !== 'custom') {
$('#templateResult').innerHTML = '<span style="color:var(--danger);">No valid expression.</span>';
return;
}
let newComponents = parsed.components.map(c => ({ ...c }));
let newFlatBonus = parsed.flatBonus;
let note = '';
const totalHD = newComponents.reduce((s, c) => s + c.count, 0);
if (template === 'half-dragon') {
newComponents = newComponents.map(c => {
const idx = dieStepOrder.indexOf('d' + c.die);
const newIdx = Math.min(idx + 1, dieStepOrder.length - 1);
return { ...c, die: parseInt(dieStepOrder[newIdx].replace('d', '')) };
});
newFlatBonus += totalHD * 2;
note = 'Half-Dragon: Die +1 step, +2 Con per HD.';
} else if (template === 'skeleton') {
newComponents = [{ count: totalHD || 1, die: 8 }];
newFlatBonus = 0;
note = 'Skeleton: d8 HD, Con 0.';
} else if (template === 'zombie') {
newFlatBonus += totalHD * 2;
note = 'Zombie: +2 Con per HD.';
} else if (template === 'vampire') {
note = 'Vampire: Regen 20 (+60 eff. HP).';
} else if (template === 'custom') {
const dieOverride = $('#custDieSize').value;
const hdDelta = parseInt($('#custHDDelta').value) || 0;
const conDelta = parseInt($('#custConDelta').value) || 0;
const flatDelta = parseInt($('#custFlatDelta').value) || 0;
if (dieOverride && newComponents.length > 0) {
const newDie = parseInt(dieOverride.replace('d', ''));
newComponents = newComponents.map(c => ({ ...c, die: newDie }));
}
if (hdDelta !== 0 && newComponents.length > 0) newComponents[0].count = Math.max(1, newComponents[0].count + hdDelta);
const newTotalHD = newComponents.reduce((s, c) => s + c.count, 0);
newFlatBonus += conDelta * newTotalHD + flatDelta;
note = 'Custom template applied.';
}
const newParsed = { components: newComponents, flatBonus: newFlatBonus, valid: newComponents.length > 0 || newFlatBonus !== 0 };
const newExpr = formatExpression(newParsed);
$('#hdExpression').value = newExpr;
const result = calculateHP(newParsed);
currentHPResult = result;
$('#templateResult').innerHTML = `<strong>${note}</strong><br>New: <code>${newExpr}</code> — Avg HP: <strong>${result.average}</strong> (${result.min}–${result.max})`;
switchTab(__getInitialTab());
$('#btnCalculate').click();
autoSave();
});

// ==================== TAB 10: ENCOUNTER ====================
let partyData = [];
let monsterData = [];
let encounterHPTracker = [];
function renderParty() {
const list = $('#partyList');
list.innerHTML = '';
partyData.forEach((pc, idx) => {
const row = document.createElement('div');
row.className = 'enc-monster-row';
row.innerHTML = `
<input type="text" placeholder="PC Name" aria-label="PC name" value="${esc(pc.name || '')}" data-idx="${idx}" data-field="name">
<input type="number" placeholder="Level" value="${pc.level || 1}" min="1" max="20" data-idx="${idx}" data-field="level">
<input type="number" placeholder="Max HP" value="${pc.maxHP || 30}" min="1" data-idx="${idx}" data-field="maxHP">
<input type="number" placeholder="Avg DPR" value="${pc.dpr || 15}" min="0" data-idx="${idx}" data-field="dpr">
<button class="small" data-remove-party="${idx}">✕</button>`;
list.appendChild(row);
});
list.querySelectorAll('[data-field]').forEach(inp => {
inp.addEventListener('input', (e) => {
const idx = parseInt(e.target.dataset.idx);
const field = e.target.dataset.field;
partyData[idx][field] = field === 'name' ? e.target.value : parseFloat(e.target.value) || 0;
});
});
list.querySelectorAll('[data-remove-party]').forEach(btn => {
btn.addEventListener('click', () => { partyData.splice(parseInt(btn.dataset.removeParty), 1); renderParty(); });
});
}
function renderMonsters() {
const list = $('#monsterList');
list.innerHTML = '';
monsterData.forEach((m, idx) => {
const row = document.createElement('div');
row.className = 'enc-monster-row';
row.innerHTML = `
<input type="text" placeholder="Monster Name" aria-label="Monster name" value="${esc(m.name || '')}" data-idx="${idx}" data-field="name">
<select data-idx="${idx}" data-field="cr">
${Object.keys(crToXP).map(cr => `<option value="${cr}" ${parseFloat(cr)===parseFloat(m.cr)?'selected':''}>CR ${cr}</option>`).join('')}
</select>
<input type="number" placeholder="Count" value="${m.count || 1}" min="1" max="100" data-idx="${idx}" data-field="count">
<input type="number" placeholder="HP each" value="${m.hp || 30}" min="1" data-idx="${idx}" data-field="hp">
<button class="small" data-remove-monster="${idx}">✕</button>`;
list.appendChild(row);
});
list.querySelectorAll('[data-field]').forEach(inp => {
inp.addEventListener('input', (e) => {
const idx = parseInt(e.target.dataset.idx);
const field = e.target.dataset.field;
monsterData[idx][field] = field === 'name' ? e.target.value : parseFloat(e.target.value) || 0;
});
inp.addEventListener('change', (e) => {
const idx = parseInt(e.target.dataset.idx);
const field = e.target.dataset.field;
monsterData[idx][field] = field === 'cr' ? parseFloat(e.target.value) : (field === 'name' ? e.target.value : parseFloat(e.target.value) || 0);
});
});
list.querySelectorAll('[data-remove-monster]').forEach(btn => {
btn.addEventListener('click', () => { monsterData.splice(parseInt(btn.dataset.removeMonster), 1); renderMonsters(); });
});
}
$('#btnAddPC').addEventListener('click', () => { partyData.push({ name: 'PC ' + (partyData.length + 1), level: 3, maxHP: 30, dpr: 15 }); renderParty(); });
$('#btnQuickParty').addEventListener('click', () => {
partyData = [
{ name: 'Fighter', level: 3, maxHP: 32, dpr: 18 },
{ name: 'Wizard', level: 3, maxHP: 19, dpr: 22 },
{ name: 'Cleric', level: 3, maxHP: 24, dpr: 14 },
{ name: 'Rogue', level: 3, maxHP: 23, dpr: 20 }
];
renderParty();
});
$('#btnClearParty').addEventListener('click', () => { partyData = []; renderParty(); });
$('#btnAddMonster').addEventListener('click', () => { monsterData.push({ name: 'Monster ' + (monsterData.length + 1), cr: 2, count: 1, hp: 30 }); renderMonsters(); });
$('#btnClearMonsters').addEventListener('click', () => { monsterData = []; renderMonsters(); });
$('#btnCalcEncounter').addEventListener('click', () => {
if (partyData.length === 0) { $('#encResultGrid').innerHTML = '<p style="color:var(--danger);">Add at least one PC.</p>'; return; }
let totalEasy = 0, totalMedium = 0, totalHard = 0, totalDeadly = 0;
let totalPartyDPR = 0, totalPartyActions = 0;
partyData.forEach(pc => {
const lvl = Math.max(1, Math.min(20, parseInt(pc.level) || 1));
const t = xpThresholds[lvl];
totalEasy += t.easy; totalMedium += t.medium; totalHard += t.hard; totalDeadly += t.deadly;
totalPartyDPR += parseFloat(pc.dpr) || 0;
totalPartyActions += 1;
});
let totalMonsterXP = 0, totalMonsterCount = 0, totalMonsterHP = 0, totalMonsterActions = 0, totalMonsterDPR = 0;
monsterData.forEach(m => {
const xp = crToXP[m.cr] || 0;
totalMonsterXP += xp * (m.count || 1);
totalMonsterCount += (m.count || 1);
totalMonsterHP += (m.hp || 0) * (m.count || 1);
totalMonsterActions += (m.count || 1) * 2;
const baseDPR = m.cr <= 1 ? 10 : m.cr <= 4 ? 20 : m.cr <= 8 ? 35 : m.cr <= 12 ? 50 : m.cr <= 16 ? 70 : 90;
totalMonsterDPR += baseDPR * (m.count || 1);
});
let totalDayXP = 0;
partyData.forEach(pc => { totalDayXP += adventuringDayXP[Math.max(1, Math.min(20, parseInt(pc.level) || 1))] || 0; });
const multiplier = getGroupMultiplier(totalMonsterCount, partyData.length);
const adjustedXP = Math.round(totalMonsterXP * multiplier);
let difficulty = 'Trivial', diffColor = '#888';
if (adjustedXP >= totalDeadly) { difficulty = 'Deadly'; diffColor = '#a83232'; }
else if (adjustedXP >= totalHard) { difficulty = 'Hard'; diffColor = '#b5781e'; }
else if (adjustedXP >= totalMedium) { difficulty = 'Medium'; diffColor = '#4a7c3f'; }
else if (adjustedXP >= totalEasy) { difficulty = 'Easy'; diffColor = '#6aaa5a'; }
$('#encResultGrid').innerHTML = `
<div class="result-item"><div class="value">${totalEasy}</div><div class="label">Easy XP</div></div>
<div class="result-item"><div class="value">${totalMedium}</div><div class="label">Medium XP</div></div>
<div class="result-item"><div class="value">${totalHard}</div><div class="label">Hard XP</div></div>
<div class="result-item"><div class="value">${totalDeadly}</div><div class="label">Deadly XP</div></div>
<div class="result-item"><div class="value">${totalMonsterXP}</div><div class="label">Raw Monster XP</div></div>
<div class="result-item"><div class="value">×${multiplier.toFixed(1)}</div><div class="label">Group Mult</div></div>
<div class="result-item" style="background:${diffColor};color:#fff;"><div class="value" style="color:#fff;">${adjustedXP}</div><div class="label" style="color:#ffe8d0;">Adjusted XP</div></div>
<div class="result-item" style="background:${diffColor};color:#fff;"><div class="value" style="color:#fff;">${difficulty}</div><div class="label" style="color:#ffe8d0;">Difficulty</div></div>
<div class="result-item"><div class="value">${partyData.length ? Math.round(totalMonsterXP / partyData.length) : 0}</div><div class="label">XP per Player</div></div>
<div class="result-item"><div class="value">${totalDayXP}</div><div class="label">Adventuring Day XP</div></div>
<div class="result-item"><div class="value">${totalDayXP ? Math.round(adjustedXP / totalDayXP * 100) : 0}%</div><div class="label">of Day Budget</div></div>
<div class="result-item"><div class="value">${totalDayXP ? Math.max(0, Math.floor((totalDayXP - adjustedXP) / Math.max(1, adjustedXP))) : 0}</div><div class="label">Similar Fights Left</div></div>`;
const maxXP = totalDeadly * 1.5;
const easyPct = (totalEasy / maxXP) * 100;
const mediumPct = (totalMedium / maxXP) * 100;
const hardPct = (totalHard / maxXP) * 100;
const deadlyPct = (totalDeadly / maxXP) * 100;
const markerPct = Math.min(100, (adjustedXP / maxXP) * 100);
$('#difficultyBar').innerHTML = `
<div class="difficulty-segment" style="left:0;width:${easyPct}%;background:#6aaa5a;">Easy</div>
<div class="difficulty-segment" style="left:${easyPct}%;width:${mediumPct - easyPct}%;background:#4a7c3f;">Medium</div>
<div class="difficulty-segment" style="left:${mediumPct}%;width:${hardPct - mediumPct}%;background:#b5781e;">Hard</div>
<div class="difficulty-segment" style="left:${hardPct}%;width:${deadlyPct - hardPct}%;background:#a83232;">Deadly</div>
<div class="difficulty-marker" style="left:${markerPct}%;"></div>`;
const dayPct = totalDayXP ? Math.round(adjustedXP / totalDayXP * 100) : 0;
$('#difficultyVerdict').innerHTML = `<strong>${difficulty}</strong> encounter: ${adjustedXP} adjusted XP (${totalMonsterXP} raw \u00D7 ${multiplier.toFixed(1)}) vs. party budget (Easy ${totalEasy} / Med ${totalMedium} / Hard ${totalHard} / Deadly ${totalDeadly}).<br>
Awards <strong>${partyData.length ? Math.round(totalMonsterXP / partyData.length) : 0} XP per player</strong> and burns <strong>${dayPct}%</strong> of the ${totalDayXP} XP adventuring-day budget.
${dayPct >= 100 ? '<br><span class="badge danger">This single fight exceeds the whole day budget \u2014 expect a short/long rest afterwards.</span>' : dayPct >= 40 ? '<br><span class="badge">Heavy resource drain \u2014 plan a short rest.</span>' : '<br><span class="badge green">Sustainable \u2014 the party can keep going.</span>'}`;
const aeRatio = totalMonsterActions / Math.max(1, totalPartyActions);
$('#actionEconomy').innerHTML = `
<div class="action-econ-bar">
<span class="ae-label">👥 Party (${totalPartyActions})</span>
<div class="ae-track">${Array(Math.min(10, totalPartyActions)).fill(0).map(() => `<div class="ae-block filled">A</div>`).join('')}</div>
</div>
<div class="action-econ-bar">
<span class="ae-label">👹 Monsters (${totalMonsterActions})</span>
<div class="ae-track">${Array(Math.min(10, totalMonsterActions)).fill(0).map(() => `<div class="ae-block filled" style="background:var(--accent2);">M</div>`).join('')}</div>
</div>
<div class="highlight-box" style="margin-top:8px;">
<strong>Action Economy Ratio:</strong> ${aeRatio.toFixed(2)}:1 (monsters:party).
${aeRatio > 1.5 ? '<span class="badge danger">Monsters dominate</span>' : aeRatio < 0.7 ? '<span class="badge green">Party dominates</span>' : '<span class="badge">Balanced</span>'}
</div>`;
encounterHPTracker = [];
monsterData.forEach((m, idx) => {
for (let i = 0; i < (m.count || 1); i++) {
encounterHPTracker.push({ name: m.name + (m.count > 1 ? ` #${i+1}` : ''), maxHP: m.hp || 30, currentHP: m.hp || 30 });
}
});
renderHPTracker();
});
function renderHPTracker() {
const list = $('#hpTrackerList');
if (encounterHPTracker.length === 0) { list.innerHTML = '<p style="color:var(--text2);font-size:0.85rem;">Calculate an encounter first.</p>'; return; }
list.innerHTML = encounterHPTracker.map((c, idx) => {
const pct = Math.max(0, (c.currentHP / c.maxHP) * 100);
const cls = c.currentHP <= 0 ? 'dead' : pct > 50 ? 'healthy' : pct > 25 ? 'wounded' : 'critical';
return `<div style="margin-bottom:8px;">
<div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:2px;">
<strong>${esc(c.name)}</strong><span>${c.currentHP}/${c.maxHP}</span>
</div>
<div class="hp-bar-wrap"><div class="hp-bar-fill ${cls}" style="width:${pct}%;"></div></div>
<div style="display:flex;gap:4px;margin-top:4px;">
<button class="small" data-dmg="${idx}" data-amt="5">-5</button>
<button class="small" data-dmg="${idx}" data-amt="10">-10</button>
<button class="small" data-dmg="${idx}" data-amt="20">-20</button>
<button class="small" data-heal="${idx}" data-amt="5">+5</button>
<button class="small" data-heal="${idx}" data-amt="10">+10</button>
<button class="small" data-reset="${idx}">Reset</button>
</div>
</div>`;
}).join('');
list.querySelectorAll('[data-dmg]').forEach(btn => {
btn.addEventListener('click', () => {
const idx = parseInt(btn.dataset.dmg);
encounterHPTracker[idx].currentHP = Math.max(0, encounterHPTracker[idx].currentHP - parseInt(btn.dataset.amt));
renderHPTracker();
});
});
list.querySelectorAll('[data-heal]').forEach(btn => {
btn.addEventListener('click', () => {
const idx = parseInt(btn.dataset.heal);
const c = encounterHPTracker[idx];
c.currentHP = Math.min(c.maxHP, c.currentHP + parseInt(btn.dataset.amt));
renderHPTracker();
});
});
list.querySelectorAll('[data-reset]').forEach(btn => {
btn.addEventListener('click', () => {
const idx = parseInt(btn.dataset.reset);
encounterHPTracker[idx].currentHP = encounterHPTracker[idx].maxHP;
renderHPTracker();
});
});
}
$('#btnRefreshTracker').addEventListener('click', () => $('#btnCalcEncounter').click());

// ==================== TAB 11: COMBAT ====================
$('#btnCalcDPRFull').addEventListener('click', () => {
const attacks = parseInt($('#dprAttacks').value) || 1;
const diceExpr = $('#dprDice').value || '1d8';
const mod = parseInt($('#dprMod').value) || 0;
const atkBonus = parseInt($('#dprAtkBonus').value) || 5;
const targetAC = parseInt($('#dprTargetAC').value) || 15;
const critDice = $('#dprCritDice').value || diceExpr;
const diceParsed = parseHDExpression(diceExpr);
const critParsed = parseHDExpression(critDice);
const diceAvg = diceParsed.valid ? calculateHP(diceParsed).average : 0;
const critAvg = critParsed.valid ? calculateHP(critParsed).average : diceAvg;
const needed = targetAC - atkBonus;
let hitChance = (21 - needed) / 20;
if (hitChance < 0.05) hitChance = 0.05;
if (hitChance > 0.95) hitChance = 0.95;
const critChance = 0.05;
const normalHitChance = hitChance - critChance;
const dprPerAttack = (normalHitChance * (diceAvg + mod)) + (critChance * (critAvg + diceAvg + mod));
const totalDPR = dprPerAttack * attacks;
$('#dprFullResult').innerHTML = `
<strong>Hit Chance:</strong> ${(hitChance * 100).toFixed(1)}% (need ${needed}+)<br>
<strong>Crit Chance:</strong> 5%<br>
<strong>Normal Hit:</strong> ${diceAvg} + ${mod} = <strong>${diceAvg + mod}</strong><br>
<strong>Crit Damage:</strong> ${critAvg + diceAvg + mod}<br>
<strong>DPR per Attack:</strong> ${dprPerAttack.toFixed(2)}<br>
<strong style="color:var(--accent);font-size:1.1rem;">Total DPR (${attacks} attacks): ${totalDPR.toFixed(2)}</strong>`;
});
$('#btnCalcAoE').addEventListener('click', () => {
const diceExpr = $('#aoeDice').value || '8d6';
const dc = parseInt($('#aoeDC').value) || 15;
const saveBonus = parseInt($('#aoeSave').value) || 0;
const targets = parseInt($('#aoeTargets').value) || 1;
const resistRate = parseFloat($('#aoeDmgType').value) || 0;
const parsed = parseHDExpression(diceExpr);
const result = calculateHP(parsed);
const avgDmg = result.average;
const halfDmg = Math.floor(avgDmg / 2);
const needed = dc - saveBonus;
let saveChance = (21 - needed) / 20;
saveChance = Math.max(0.05, Math.min(0.95, saveChance));
const failChance = 1 - saveChance;
const dmgPerTarget = (failChance * avgDmg) + (saveChance * halfDmg);
const effectiveDmg = dmgPerTarget * (1 - resistRate);
const totalDmg = effectiveDmg * targets;
$('#aoeResult').innerHTML = `
<strong>Full Damage:</strong> ${avgDmg} | <strong>Half:</strong> ${halfDmg}<br>
<strong>DC:</strong> ${dc} vs +${saveBonus} → fail ${(failChance * 100).toFixed(1)}%<br>
<strong>Avg/target:</strong> ${dmgPerTarget.toFixed(1)}<br>
<strong>After resistance (${(resistRate*100).toFixed(0)}%):</strong> ${effectiveDmg.toFixed(1)}/target<br>
<strong style="color:var(--accent);font-size:1.1rem;">Total AoE (${targets} targets): ${totalDmg.toFixed(1)}</strong>`;
});
$('#btnCalcCrit').addEventListener('click', () => {
const diceExpr = $('#critDice').value || '2d6+4';
const critRange = parseInt($('#critRange').value) || 20;
const critBonusExpr = $('#critBonusDice').value || '';
const parsed = parseHDExpression(diceExpr);
const result = calculateHP(parsed);
const normalAvg = result.average;
const critParsed = { components: parsed.components.map(c => ({ count: c.count * 2, die: c.die, sign: c.sign })), flatBonus: parsed.flatBonus, valid: true };
const critResult = calculateHP(critParsed);
let bonusAvg = 0;
if (critBonusExpr) {
const bonusParsed = parseHDExpression(critBonusExpr);
if (bonusParsed.valid) bonusAvg = calculateHP(bonusParsed).average;
}
const totalCritAvg = critResult.average + bonusAvg;
const critChance = (21 - critRange) / 20;
const expectedBoost = (totalCritAvg - normalAvg) * critChance;
$('#critResult').innerHTML = `
<strong>Normal:</strong> ${normalAvg} avg (${result.min}–${result.max})<br>
<strong>Crit (doubled dice):</strong> ${critResult.average} avg (${critResult.min}–${critResult.max})<br>
${bonusAvg > 0 ? `<strong>+ Bonus Crit:</strong> ${bonusAvg} avg<br>` : ''}
<strong style="color:var(--accent);">Total Crit:</strong> ${totalCritAvg} avg<br>
<strong>Crit Range:</strong> ${critRange} (${(critChance*100).toFixed(0)}%)<br>
<strong>Avg DPR boost:</strong> +${expectedBoost.toFixed(2)}/attack`;
});
$('#btnCalcDC').addEventListener('click', () => {
const crSel = $('#dcFromCR').value;
let ability = parseInt($('#dcAbility').value) || 10;
let prof = parseInt($('#dcProf').value) || 2;
let fromCR = false;
if (crSel !== '') {
const cr = parseFloat(crSel);
ability = 14 + Math.floor(cr / 3);
prof = getProfByCR(cr);
fromCR = true;
}
const dc = 8 + prof + Math.floor((ability - 10) / 2);
$('#dcResult').innerHTML = `
<strong>Save DC:</strong> <span style="font-size:1.4rem;color:var(--accent);font-weight:700;">${dc}</span><br>
${fromCR ? `<em>Auto from CR ${crSel}</em><br>` : ''}
<strong>Formula:</strong> 8 + ${prof} + ${Math.floor((ability - 10) / 2)} = <strong>${dc}</strong><br>
<strong>Target needs ${dc}+</strong> (${((21 - dc) / 20 * 100).toFixed(0)}% chance)`;
});
$('#btnCalcAtk').addEventListener('click', () => {
const crSel = $('#atkFromCR').value;
let ability = parseInt($('#atkAbility').value) || 0;
let prof = parseInt($('#atkProf').value) || 2;
let fromCR = false;
if (crSel !== '') {
const cr = parseFloat(crSel);
prof = getProfByCR(cr);
ability = getAtkBonusByCR(cr) - prof;
fromCR = true;
}
const atkBonus = prof + ability;
$('#atkResult').innerHTML = `
<strong>Attack Bonus:</strong> <span style="font-size:1.4rem;color:var(--accent);font-weight:700;">${fmtMod(atkBonus)}</span><br>
${fromCR ? `<em>Auto from CR ${crSel}</em><br>` : ''}
<strong>Formula:</strong> ${prof} + ${fmtMod(ability)} = <strong>${fmtMod(atkBonus)}</strong><br>
<strong>Hit chance vs AC 15:</strong> ${((21 - (15 - atkBonus)) / 20 * 100).toFixed(0)}%`;
});
$('#btnCalcHeal').addEventListener('click', () => {
const current = parseInt($('#healCurrent').value) || 0;
const max = parseInt($('#healMax').value) || 1;
const diceExpr = $('#healDice').value || '1d8';
const status = $('#healStatus').value;
const parsed = parseHDExpression(diceExpr);
const result = calculateHP(parsed);
const avgHeal = result.average;
const newHP = Math.min(max, current + avgHeal);
const healed = newHP - current;
const pct = (newHP / max * 100).toFixed(0);
let statusNote = '';
if (status === 'downed') statusNote = `<br>⚠️ At 0 HP: any healing brings them conscious with ${Math.max(1, healed)} HP.`;
else if (status === 'dying') statusNote = `<br>💀 Dying: healing stabilizes with ${Math.max(1, healed)} HP.`;
else if (status === 'dead') statusNote = `<br>☠️ Dead: requires <strong>Revivify</strong> or <strong>Resurrection</strong>.`;
$('#healResult').innerHTML = `
<strong>Healing Dice:</strong> ${result.expression} → avg <strong>${avgHeal}</strong> (${result.min}–${result.max})<br>
<strong>Current HP:</strong> ${current}/${max}<br>
<strong>After Healing:</strong> ${newHP}/${max} (${pct}%)<br>
<strong>HP Restored:</strong> ${healed}${statusNote}`;
});

// ==================== TAB 12: MONSTER TOOLS ====================
$('#btnRandomMonster').addEventListener('click', () => {
const cr = parseFloat($('#randCR').value);
const typeSel = $('#randType').value;
const envSel = $('#randEnv').value;
let type = typeSel;
if (type === 'any') { const types = Object.keys(monsterNames); type = types[Math.floor(Math.random() * types.length)]; }
const names = monsterNames[type] || ['Unknown Horror'];
const prefixes = ['Ancient','Dire','Greater','Lesser','Shadow','Fell','Cursed','Savage','Elder','Frenzied'];
const name = Math.random() < 0.5 ? names[Math.floor(Math.random() * names.length)] : prefixes[Math.floor(Math.random() * prefixes.length)] + ' ' + names[Math.floor(Math.random() * names.length)];
let env = envSel;
if (env === 'any') { const envs = Object.keys(environments); env = envs[Math.floor(Math.random() * envs.length)]; }
const hpRange = getCRRange(cr);
const avgHP = Math.round((hpRange.min + hpRange.max) / 2);
const hdDie = avgHP > 200 ? 12 : avgHP > 100 ? 10 : avgHP > 50 ? 8 : 6;
const numHD = Math.max(1, Math.round(avgHP / ((hdDie + 1) / 2 + 2)));
const conMod = Math.max(-1, Math.round((avgHP / numHD - (hdDie + 1) / 2)));
const hdExpr = `${numHD}d${hdDie}${conMod >= 0 ? '+' : ''}${conMod * numHD}`;
const ac = Math.round(12 + Math.min(8, cr * 0.5));
const prof = getProfByCR(cr);
const atkBonus = getAtkBonusByCR(cr);
const dc = getDCByCR(cr);
const primary = 10 + Math.min(12, Math.floor(cr * 0.8));
const secondary = 10 + Math.min(8, Math.floor(cr * 0.5));
const abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
if (type === 'humanoid' || type === 'giant') { abilities.str = primary; abilities.con = secondary; abilities.dex = 10 + Math.floor(Math.random() * 4); }
else if (type === 'beast') { abilities.dex = primary; abilities.str = secondary; abilities.con = secondary; }
else if (type === 'dragon' || type === 'fiend' || type === 'celestial') { abilities.str = secondary; abilities.con = primary; abilities.cha = primary; }
else if (type === 'aberration' || type === 'construct') { abilities.con = primary; abilities.int = secondary; abilities.wis = secondary; }
else { abilities.str = secondary; abilities.dex = secondary; abilities.con = primary; }
const sizes = ['Small', 'Medium', 'Large', 'Huge'];
const size = cr < 1 ? sizes[Math.floor(Math.random() * 2)] : cr < 5 ? sizes[1 + Math.floor(Math.random() * 2)] : cr < 10 ? sizes[2] : sizes[Math.min(3, 1 + Math.floor(Math.random() * 3))];
const alignments = { aberration: ['chaotic evil','neutral evil'], beast: ['unaligned'], celestial: ['lawful good','neutral good'], construct: ['unaligned'], dragon: ['chaotic evil','lawful evil','neutral'], elemental: ['neutral'], fey: ['chaotic neutral','chaotic evil'], fiend: ['lawful evil','neutral evil','chaotic evil'], giant: ['chaotic evil','neutral evil','lawful evil'], humanoid: ['neutral','chaotic evil','lawful good','neutral evil'], monstrosity: ['neutral evil','chaotic evil'], ooze: ['unaligned'], plant: ['unaligned'], undead: ['lawful evil','neutral evil','chaotic evil'] };
const aligns = alignments[type] || ['neutral'];
const align = aligns[Math.floor(Math.random() * aligns.length)];
$('#randomMonsterResult').innerHTML = `
<div class="monster-card">
<div class="mc-name">${esc(name)}</div>
<div style="font-style:italic;font-size:0.85rem;color:var(--text2);margin-bottom:8px;">${size} ${type}, ${align} • CR ${cr} (${crToXP[cr]} XP)</div>
<div class="mc-stats">
<div class="mc-stat"><b>AC:</b> ${ac}</div>
<div class="mc-stat"><b>HP:</b> ${avgHP} (${hdExpr})</div>
<div class="mc-stat"><b>Speed:</b> 30 ft.</div>
<div class="mc-stat"><b>STR:</b> ${abilities.str} (${fmtModSign(getModifier(abilities.str))})</div>
<div class="mc-stat"><b>DEX:</b> ${abilities.dex} (${fmtModSign(getModifier(abilities.dex))})</div>
<div class="mc-stat"><b>CON:</b> ${abilities.con} (${fmtModSign(getModifier(abilities.con))})</div>
<div class="mc-stat"><b>INT:</b> ${abilities.int} (${fmtModSign(getModifier(abilities.int))})</div>
<div class="mc-stat"><b>WIS:</b> ${abilities.wis} (${fmtModSign(getModifier(abilities.wis))})</div>
<div class="mc-stat"><b>CHA:</b> ${abilities.cha} (${fmtModSign(getModifier(abilities.cha))})</div>
<div class="mc-stat"><b>Prof:</b> +${prof}</div>
<div class="mc-stat"><b>Atk:</b> +${atkBonus}</div>
<div class="mc-stat"><b>DC:</b> ${dc}</div>
</div>
<div style="margin-top:8px;font-size:0.82rem;color:var(--text2);"><b>Environment:</b> ${env} • <b>HD:</b> <code>${hdExpr}</code></div>
<div style="margin-top:8px;">
<button class="small" type="button" data-use-hd="${esc(hdExpr)}">📥 Use HD</button>
<button class="small" type="button" data-build-statblock="${esc(JSON.stringify({ name, sizeType: size + ' ' + type, align, ac, ...abilities }))}">📜 Build Statblock</button>
</div>
</div>`;
});
// Delegated handlers for the generated monster card (no inline JS).
$('#randomMonsterResult').addEventListener('click', (e) => {
const useHd = e.target.closest('[data-use-hd]');
if (useHd) {
$('#hdExpression').value = useHd.dataset.useHd;
switchTab(__getInitialTab());
$('#btnCalculate').click();
return;
}
const build = e.target.closest('[data-build-statblock]');
if (!build) return;
let d;
try { d = JSON.parse(build.dataset.buildStatblock); } catch (err) { console.warn('Bad statblock payload', err); return; }
$('#sbName').value = d.name;
$('#sbSizeType').value = d.sizeType;
$('#sbAlign').value = d.align;
$('#sbAC').value = d.ac;
$('#sbSTR').value = d.str; $('#sbDEX').value = d.dex; $('#sbCON').value = d.con;
$('#sbINT').value = d.int; $('#sbWIS').value = d.wis; $('#sbCHA').value = d.cha;
switchTab('tab-statblock');
$('#btnGenerateStatblock').click();
});
$('#btnGenAbilityScores').addEventListener('click', () => {
const cr = parseFloat($('#abilityCR').value);
const archetype = $('#abilityArchetype').value;
let scores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
if (archetype === 'brute') { scores.str = Math.min(20, 14 + Math.floor(cr / 4)); scores.con = Math.min(20, 14 + Math.floor(cr / 5)); scores.dex = 10; scores.int = Math.max(6, 10 - Math.floor(cr / 8)); scores.cha = Math.max(6, 10 - Math.floor(cr / 8)); }
else if (archetype === 'skirmisher') { scores.dex = Math.min(20, 15 + Math.floor(cr / 4)); scores.con = 12 + Math.floor(cr / 6); scores.str = 10; scores.wis = 12; }
else if (archetype === 'caster') { const primary = ['int','wis','cha'][Math.floor(Math.random() * 3)]; scores[primary] = Math.min(20, 16 + Math.floor(cr / 4)); scores.con = 12; scores.str = 8; scores.dex = 12; }
else if (archetype === 'tank') { scores.con = Math.min(20, 16 + Math.floor(cr / 4)); scores.str = 14; scores.dex = 10; scores.wis = 12; }
else { scores.str = 12 + Math.floor(cr / 6); scores.dex = 12 + Math.floor(cr / 6); scores.con = 12 + Math.floor(cr / 6); scores.int = 10 + Math.floor(cr / 8); scores.wis = 10 + Math.floor(cr / 8); scores.cha = 10 + Math.floor(cr / 8); }
for (const k in scores) scores[k] = Math.max(3, Math.min(24, scores[k]));
const prof = getProfByCR(cr);
$('#abilityScoreResult').innerHTML = `
<div class="result-grid">
${Object.entries(scores).map(([k, v]) => `<div class="result-item"><div class="value">${v}</div><div class="label">${k.toUpperCase()} (${fmtModSign(getModifier(v))})</div></div>`).join('')}
</div>
<div class="highlight-box">
<strong>Proficiency Bonus:</strong> +${prof}<br>
<strong>Typical Save DC:</strong> ${8 + prof + getModifier(scores.int > scores.wis && scores.int > scores.cha ? scores.int : scores.wis > scores.cha ? scores.wis : scores.cha)}<br>
<strong>Archetype:</strong> ${archetype} | <strong>CR:</strong> ${cr}
</div>`;
});
$('#btnCalcSkills').addEventListener('click', () => {
const cr = parseInt($('#skillCR').value);
const prof = getProfByCR(cr);
const abilities = {
STR: parseInt($('#skillSTR').value) || 10, DEX: parseInt($('#skillDEX').value) || 10,
CON: parseInt($('#skillCON').value) || 10, INT: parseInt($('#skillINT').value) || 10,
WIS: parseInt($('#skillWIS').value) || 10, CHA: parseInt($('#skillCHA').value) || 10
};
const skills = [];
$$('#skillProfGroup input').forEach(cb => {
const skill = cb.dataset.skill;
const ability = cb.dataset.ability;
const mod = getModifier(abilities[ability]);
const total = cb.checked ? mod + prof : mod;
skills.push({ skill, ability, mod, prof: cb.checked, total });
});
skills.sort((a, b) => b.total - a.total);
$('#skillResult').innerHTML = `<table>
<thead><tr><th>Skill</th><th>Ability</th><th>Mod</th><th>Prof</th><th>Total</th></tr></thead>
<tbody>${skills.map(s => `<tr style="${s.prof ? 'font-weight:700;' : ''}">
<td>${s.skill}</td><td>${s.ability}</td><td>${fmtModSign(s.mod)}</td>
<td>${s.prof ? '✓ +' + prof : '—'}</td>
<td style="color:var(--accent);"><strong>${fmtModSign(s.total)}</strong></td>
</tr>`).join('')}</tbody></table>
<div class="highlight-box" style="margin-top:8px;"><strong>Passive Perception:</strong> ${10 + getModifier(abilities.WIS) + (skills.find(s => s.skill === 'Perception')?.prof ? prof : 0)}</div>`;
});
$('#btnCalcLair').addEventListener('click', () => {
const baseHP = parseInt($('#lairBaseHP').value) || 100;
const baseDPR = parseInt($('#lairBaseDPR').value) || 40;
const lairDmg = parseInt($('#lairDmg').value) || 0;
const lairEffect = parseInt($('#lairEffect').value) || 0;
const legendaryCount = parseInt($('#legendaryCount').value) || 0;
const legendaryDPR = parseInt($('#legendaryDPR').value) || 0;
const lairHPValue = (lairDmg + lairEffect) * 3;
const legendaryHPValue = legendaryCount * legendaryDPR * 0.5;
const totalEffectiveHP = baseHP + lairHPValue + legendaryHPValue;
const totalEffectiveDPR = baseDPR + lairDmg + (legendaryCount * legendaryDPR);
const crIncrease = Math.max(0, Math.round((lairHPValue + legendaryHPValue) / 20));
$('#lairResult').innerHTML = `
<div class="result-grid">
<div class="result-item"><div class="value">${baseHP}</div><div class="label">Base HP</div></div>
<div class="result-item"><div class="value">+${lairHPValue}</div><div class="label">Lair Value</div></div>
<div class="result-item"><div class="value">+${legendaryHPValue}</div><div class="label">Legendary Value</div></div>
<div class="result-item" style="background:var(--accent);color:#fff;"><div class="value" style="color:#fff;">${totalEffectiveHP}</div><div class="label" style="color:#ffe8d0;">Effective HP</div></div>
<div class="result-item"><div class="value">${baseDPR}</div><div class="label">Base DPR</div></div>
<div class="result-item" style="background:var(--accent);color:#fff;"><div class="value" style="color:#fff;">${totalEffectiveDPR}</div><div class="label" style="color:#ffe8d0;">Effective DPR</div></div>
</div>
<div class="highlight-box"><strong>CR Adjustment:</strong> ~<strong>+${crIncrease}</strong><br><em>Lair ≈ +1 CR, 3 legendary ≈ +1 CR.</em></div>`;
});

// ==================== TAB 13: PC TOOLS ====================
let dsSuccesses = 0, dsFailures = 0;
function renderDeathSaves() {
const succ = $('#dsSuccesses');
const fail = $('#dsFailures');
succ.querySelectorAll('.ds-dot').forEach((dot, i) => {
dot.classList.toggle('success-marked', i < dsSuccesses);
dot.textContent = i < dsSuccesses ? '✓' : '';
});
fail.querySelectorAll('.ds-dot').forEach((dot, i) => {
dot.classList.toggle('failure-marked', i < dsFailures);
dot.textContent = i < dsFailures ? '✗' : '';
});
let status = 'Dying...', color = 'var(--warning)';
if (dsSuccesses >= 3) { status = '💚 Stable!'; color = 'var(--success)'; }
else if (dsFailures >= 3) { status = '💀 Dead.'; color = 'var(--danger)'; }
else if (dsSuccesses === 2 && dsFailures === 2) { status = '⚠️ Critical!'; color = 'var(--danger)'; }
else if (dsSuccesses === 2) { status = '🟢 One success away.'; color = 'var(--success)'; }
else if (dsFailures === 2) { status = '🔴 One failure away!'; color = 'var(--danger)'; }
$('#dsStatus').innerHTML = `<strong style="color:${color};">${status}</strong><br>Successes: ${dsSuccesses}/3 | Failures: ${dsFailures}/3`;
}
$('#dsSuccesses').addEventListener('click', (e) => {
const dot = e.target.closest('.ds-dot'); if (!dot) return;
const idx = parseInt(dot.dataset.idx);
if (idx < dsSuccesses) dsSuccesses = idx; else dsSuccesses = idx + 1;
renderDeathSaves();
});
$('#dsFailures').addEventListener('click', (e) => {
const dot = e.target.closest('.ds-dot'); if (!dot) return;
const idx = parseInt(dot.dataset.idx);
if (idx < dsFailures) dsFailures = idx; else dsFailures = idx + 1;
renderDeathSaves();
});
$('#btnDSRoll').addEventListener('click', () => {
if (dsSuccesses >= 3 || dsFailures >= 3) { $('#dsStatus').innerHTML = 'Already resolved. Reset first.'; return; }
const roll = Math.floor(Math.random() * 20) + 1;
let msg = `🎲 Rolled <strong>${roll}</strong> (DC 10): `;
if (roll === 20) { dsSuccesses = 0; dsFailures = 0; msg += '<strong style="color:var(--success);">NAT 20! Regain 1 HP!</strong>'; }
else if (roll === 1) { dsFailures += 2; msg += '<strong style="color:var(--danger);">NAT 1! Two failures!</strong>'; }
else if (roll >= 10) { dsSuccesses++; msg += '<strong style="color:var(--success);">Success!</strong>'; }
else { dsFailures++; msg += '<strong style="color:var(--danger);">Failure.</strong>'; }
renderDeathSaves();
$('#dsStatus').innerHTML = msg + '<br>' + $('#dsStatus').innerHTML;
});
$('#btnDSCritSuccess').addEventListener('click', () => { dsSuccesses = 0; dsFailures = 0; renderDeathSaves(); $('#dsStatus').innerHTML = '<strong style="color:var(--success);">💚 Nat 20! Regain 1 HP.</strong>'; });
$('#btnDSCritFail').addEventListener('click', () => { dsFailures = Math.min(3, dsFailures + 2); renderDeathSaves(); });
$('#btnDSReset').addEventListener('click', () => { dsSuccesses = 0; dsFailures = 0; renderDeathSaves(); });
const conditionEffects = {
blinded: '👁️ <b>Blinded:</b> Auto-fail sight checks. Attacks vs you have adv. Your attacks disadv.',
charmed: '💞 <b>Charmed:</b> Cannot attack charmer. Charmer has adv on social checks.',
deafened: '🔇 <b>Deafened:</b> Auto-fail hearing checks.',
frightened: '😱 <b>Frightened:</b> Disadv on attacks/checks while source in sight.',
grappled: '🤼 <b>Grappled:</b> Speed 0.',
incapacitated: '🚫 <b>Incapacitated:</b> Cannot take actions or reactions.',
invisible: '👻 <b>Invisible:</b> Heavily obscured. Attacks vs you have disadv.',
paralyzed: '⚡ <b>Paralyzed:</b> Incapacitated. Auto-fail STR/DEX saves. Attacks have adv and crit within 5ft.',
petrified: '🗿 <b>Petrified:</b> Resistance to all damage. Immune to poison/disease.',
poisoned: '☠️ <b>Poisoned:</b> Disadv on attack rolls and ability checks.',
prone: '🤸 <b>Prone:</b> Speed halved unless crawling. Attacks within 5ft adv, ranged disadv.',
restrained: '⛓️ <b>Restrained:</b> Speed 0. Attacks vs you adv. Your attacks disadv. DEX saves disadv.',
stunned: '💫 <b>Stunned:</b> Incapacitated. Auto-fail STR/DEX saves. Attacks vs you adv.',
unconscious: '😴 <b>Unconscious:</b> Incapacitated, prone. Auto-fail STR/DEX saves. Attacks adv and crit within 5ft.',
'exhaustion-1': '😓 <b>Exhaustion 1:</b> Disadv on ability checks.',
'exhaustion-2': '😰 <b>Exhaustion 2:</b> Speed halved.',
'exhaustion-3': '🥵 <b>Exhaustion 3:</b> Disadv on attack rolls and saving throws.',
concentrating: '🎯 <b>Concentrating:</b> Taking damage = CON save (DC 10 or half damage, higher).'
};
$$('#conditionChips .condition-chip').forEach(chip => {
chip.addEventListener('click', () => {
chip.classList.toggle('active');
const active = [];
$$('#conditionChips .condition-chip.active').forEach(c => active.push(conditionEffects[c.dataset.cond]));
$('#conditionEffects').innerHTML = active.length === 0 ? '<em>No active conditions.</em>' : active.join('<br><br>');
});
});
$('#btnCalcRest').addEventListener('click', () => {
const totalHD = parseInt($('#restTotalHD').value) || 0;
const dieSize = parseInt($('#restDieSize').value) || 8;
const conMod = parseInt($('#restConMod').value) || 0;
const current = parseInt($('#restCurrentHP').value) || 0;
const max = parseInt($('#restMaxHP').value) || 1;
const missing = max - current;
const avgPerHD = Math.max(1, Math.floor((dieSize + 1) / 2) + conMod);
const minPerHD = Math.max(1, 1 + conMod);
const hdNeeded = Math.ceil(missing / avgPerHD);
const hdToSpend = Math.min(totalHD, Math.max(0, hdNeeded));
const shortRestHeal = hdToSpend * avgPerHD;
const shortRestMin = hdToSpend * minPerHD;
const shortRestMax = hdToSpend * dieSize + hdToSpend * conMod;
const hdRemaining = totalHD - hdToSpend;
const hdRecovered = Math.max(1, Math.floor(totalHD / 2));
$('#restResult').innerHTML = `
<div class="result-grid">
<div class="result-item"><div class="value">${missing}</div><div class="label">HP Missing</div></div>
<div class="result-item"><div class="value">${avgPerHD}</div><div class="label">Avg per HD</div></div>
<div class="result-item"><div class="value">${hdToSpend}/${totalHD}</div><div class="label">HD to Spend</div></div>
</div>
<h4 style="margin-top:10px;">🌞 Short Rest (1 hour)</h4>
<ul class="recovery-list">
<li>Spend <strong>${hdToSpend} HD</strong> → heal <strong>${shortRestHeal}</strong> HP (${shortRestMin}–${shortRestMax})</li>
<li>HD remaining: <strong>${hdRemaining}</strong></li>
<li>New HP: <strong>${Math.min(max, current + shortRestHeal)}</strong></li>
</ul>
<h4 style="margin-top:10px;">🌙 Long Rest (8 hours)</h4>
<ul class="recovery-list">
<li>HP restored to <strong>${max}</strong> (full)</li>
<li>Recover <strong>${hdRecovered} HD</strong> (half total, min 1)</li>
<li>HD after long rest: <strong>${Math.min(totalHD, hdRemaining + hdRecovered)}</strong></li>
</ul>`;
});
const exhaustionEffects = {
0: '💚 <b>Level 0:</b> No effects.',
1: '😓 <b>Level 1:</b> Disadv on ability checks.',
2: '😰 <b>Level 2:</b> Speed halved.',
3: '🥵 <b>Level 3:</b> Disadv on attack rolls and saving throws.',
4: '💔 <b>Level 4:</b> Hit point maximum halved.',
5: '🛑 <b>Level 5:</b> Speed reduced to 0.',
6: '💀 <b>Level 6:</b> Death.'
};
let currentExhaustion = 0;
function renderExhaustion() {
$$('#exhaustionLevels .exhaustion-level').forEach(el => el.classList.toggle('active', parseInt(el.dataset.lvl) === currentExhaustion));
$('#exhaustionEffect').innerHTML = exhaustionEffects[currentExhaustion];
}
$$('#exhaustionLevels .exhaustion-level').forEach(el => {
el.addEventListener('click', () => { currentExhaustion = parseInt(el.dataset.lvl); renderExhaustion(); });
});
renderExhaustion();
let spellSlotState = [];
$('#btnCalcSlots').addEventListener('click', () => {
const level = Math.max(1, Math.min(20, parseInt($('#casterLevel').value) || 1));
const cls = $('#casterClass').value;
let slots;
if (cls === 'warlock') {
const slotLevel = getWarlockSlotLevel(level);
const slotCount = spellSlotsTable.warlock[level][0];
slots = Array(9).fill(0);
if (slotCount > 0) slots[slotLevel - 1] = slotCount;
} else {
slots = [...spellSlotsTable[cls][level]];
}
spellSlotState = slots.map((count, idx) => ({ level: idx + 1, max: count, used: 0 }));
renderSpellSlots();
});
function renderSpellSlots() {
const grid = $('#spellSlotGrid');
grid.innerHTML = spellSlotState.map((slot, idx) => {
if (slot.max === 0) return '';
const pips = Array(slot.max).fill(0).map((_, i) => `<div class="slot-pip ${i < slot.used ? '' : 'used'}" data-slot="${idx}" data-pip="${i}"></div>`).join('');
return `<div class="spell-slot-cell"><div class="lvl">Lvl ${slot.level}</div><div class="slots">${pips}</div><div style="font-size:0.7rem;color:var(--text2);">${slot.max - slot.used}/${slot.max}</div></div>`;
}).join('');
grid.querySelectorAll('.slot-pip').forEach(pip => {
pip.addEventListener('click', () => {
const slotIdx = parseInt(pip.dataset.slot);
const pipIdx = parseInt(pip.dataset.pip);
const slot = spellSlotState[slotIdx];
if (pipIdx < slot.used) slot.used = pipIdx; else slot.used = pipIdx + 1;
renderSpellSlots();
updateSlotSummary();
});
});
updateSlotSummary();
}
function updateSlotSummary() {
const totalMax = spellSlotState.reduce((s, slot) => s + slot.max, 0);
const totalUsed = spellSlotState.reduce((s, slot) => s + slot.used, 0);
$('#slotSummary').innerHTML = `<strong>Slots remaining:</strong> ${totalMax - totalUsed} / ${totalMax}`;
}
$('#btnResetSlots').addEventListener('click', () => { spellSlotState.forEach(slot => slot.used = 0); renderSpellSlots(); });
$('#btnCalcSlots').click();
let tempHPSources = [];
function renderTempHP() {
const stack = $('#tempHPStack');
if (tempHPSources.length === 0) {
stack.innerHTML = '<p style="color:var(--text2);font-size:0.85rem;">No temp HP sources.</p>';
} else {
stack.innerHTML = tempHPSources.map((src, idx) => `
<div class="temp-hp-row">
<input type="text" aria-label="Temp HP source name" value="${esc(src.name)}" data-temp-name="${idx}">
<input type="number" value="${src.current}" data-temp-current="${idx}" min="0">
<button class="small" data-temp-remove="${idx}">✕</button>
</div>`).join('');
stack.querySelectorAll('[data-temp-name]').forEach(inp => {
inp.addEventListener('input', (e) => { tempHPSources[parseInt(e.target.dataset.tempName)].name = e.target.value; });
});
stack.querySelectorAll('[data-temp-current]').forEach(inp => {
inp.addEventListener('input', (e) => { tempHPSources[parseInt(e.target.dataset.tempCurrent)].current = parseInt(e.target.value) || 0; updateTempHPResult(); });
});
stack.querySelectorAll('[data-temp-remove]').forEach(btn => {
btn.addEventListener('click', () => { tempHPSources.splice(parseInt(btn.dataset.tempRemove), 1); renderTempHP(); updateTempHPResult(); });
});
}
}
function updateTempHPResult() {
const baseMax = parseInt($('#tmpBaseHP').value) || 0;
const baseCurrent = parseInt($('#tmpCurrentHP').value) || 0;
const totalTemp = tempHPSources.reduce((s, src) => s + (src.current || 0), 0);
$('#tempHPResult').innerHTML = `
<strong>Base HP:</strong> ${baseCurrent}/${baseMax}<br>
<strong>Total Temp HP:</strong> ${totalTemp}<br>
<strong style="color:var(--accent);">Effective HP:</strong> ${baseCurrent + totalTemp}/${baseMax + totalTemp}<br>
<em style="font-size:0.8rem;">Damage applied to temp HP first. Lost on long rest.</em>`;
}
$('#btnAddTempHP').addEventListener('click', () => {
const amt = parseInt($('#tmpAmount').value) || 10;
tempHPSources.push({ name: 'Temp HP ' + (tempHPSources.length + 1), current: amt });
renderTempHP(); updateTempHPResult();
});
$('#btnApplyDamage').addEventListener('click', () => {
const amt = parseInt($('#tmpAmount').value) || 0;
if (amt <= 0) return;
let remaining = amt;
for (let i = tempHPSources.length - 1; i >= 0 && remaining > 0; i--) {
if (tempHPSources[i].current > 0) {
const taken = Math.min(tempHPSources[i].current, remaining);
tempHPSources[i].current -= taken; remaining -= taken;
}
}
if (remaining > 0) {
const baseCurrent = parseInt($('#tmpCurrentHP').value) || 0;
$('#tmpCurrentHP').value = Math.max(0, baseCurrent - remaining);
}
renderTempHP(); updateTempHPResult();
});
$('#btnLongRest').addEventListener('click', () => { tempHPSources = []; $('#tmpCurrentHP').value = $('#tmpBaseHP').value; renderTempHP(); updateTempHPResult(); });
renderTempHP(); updateTempHPResult();

// ==================== TAB 14: CR CALCULATOR (NEW) ====================
$('#btnCalcCR').addEventListener('click', () => {
const ac = parseInt($('#crAC').value) || 15;
const hp = parseInt($('#crHP').value) || 100;
const atkBonus = parseInt($('#crAtkBonus').value) || 7;
const dpr = parseInt($('#crDPR').value) || 30;
const saveDC = parseInt($('#crSaveDC').value) || 15;
const defenses = parseInt($('#crDefenses').value) || 0;
const magicResist = $('#crMagicResist').checked;
const flySpeed = $('#crFlySpeed').checked;
const legendary = $('#crLegendary').checked;
const lair = $('#crLair').checked;
// Defensive CR
const hpRanges = [
[1,6],[7,35],[36,49],[50,70],[71,85],[86,100],[101,115],[116,130],
[131,145],[146,160],[161,175],[176,190],[191,205],[206,220],[221,235],
[236,250],[251,265],[266,280],[281,295],[296,310],[311,325],[326,340],
[341,355],[356,400],[401,445],[446,490],[491,535],[536,580],[581,625],
[626,670],[671,715],[716,760]
];
const acByCR = [13,13,13,13,13,13,14,14,15,15,15,15,16,16,16,16,17,17,17,17,18,18,18,18,19,19,19,19,19,19,19,19];
let defCR = 0;
for (let i = 0; i < hpRanges.length; i++) {
if (hp >= hpRanges[i][0] && hp <= hpRanges[i][1]) { defCR = i; break; }
}
const expectedAC = acByCR[defCR];
let acAdjust = 0;
if (ac > expectedAC + 10) acAdjust = 2;
else if (ac > expectedAC + 5) acAdjust = 1;
else if (ac < expectedAC - 5) acAdjust = -1;
defCR = Math.max(0, Math.min(30, defCR + acAdjust));
// Offensive CR
const dprRanges = [
[0,1],[2,3],[4,5],[6,8],[9,10],[11,14],[15,17],[18,20],
[21,23],[24,26],[27,29],[30,32],[33,35],[36,39],[40,43],
[44,47],[48,51],[52,55],[56,59],[60,63],[64,67],[68,71],
[72,75],[76,79],[80,85],[86,91],[92,97],[98,103],[104,109],[110,115],[116,121],[122,127]
];
const atkByCR = [3,3,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15,15,16,16,17,17,18,18,19];
let offCR = 0;
for (let i = 0; i < dprRanges.length; i++) {
if (dpr >= dprRanges[i][0] && dpr <= dprRanges[i][1]) { offCR = i; break; }
}
const expectedAtk = atkByCR[offCR];
let atkAdjust = 0;
if (atkBonus > expectedAtk + 4) atkAdjust = 2;
else if (atkBonus > expectedAtk + 2) atkAdjust = 1;
else if (atkBonus < expectedAtk - 2) atkAdjust = -1;
offCR = Math.max(0, Math.min(30, offCR + atkAdjust));
// Average
let avgCR = (defCR + offCR) / 2;
// Defense adjustment
let defenseAdjust = 0;
if (defenses === 1) defenseAdjust = 0.5;
else if (defenses === 2) defenseAdjust = 1;
else if (defenses === 3) defenseAdjust = 2;
// Special traits
let specialAdjust = 0;
if (magicResist) specialAdjust += 0.5;
if (legendary) specialAdjust += 1;
if (lair) specialAdjust += 1;
if (flySpeed) specialAdjust += 0.25;
// Final CR
let finalCR = avgCR + defenseAdjust + specialAdjust;
finalCR = Math.max(0, Math.min(30, finalCR));
const crLabels = ['0','1/8','1/4','1/2','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30'];
const finalCRLabel = crLabels[Math.round(finalCR)] || '30+';
$('#crResult').innerHTML = `
<div class="result-grid">
<div class="result-item"><div class="value">${defCR}</div><div class="label">Defensive CR</div></div>
<div class="result-item"><div class="value">${offCR}</div><div class="label">Offensive CR</div></div>
<div class="result-item"><div class="value">${avgCR.toFixed(1)}</div><div class="label">Average CR</div></div>
<div class="result-item" style="background:var(--accent);color:#fff;"><div class="value" style="color:#fff;">${finalCR.toFixed(1)}</div><div class="label" style="color:#ffe8d0;">Final CR</div></div>
</div>
<div class="highlight-box">
<strong>Analysis:</strong><br>
• Defensive CR ${defCR} (HP ${hp}, AC ${ac}, expected AC ${expectedAC}, adj ${acAdjust >= 0 ? '+' : ''}${acAdjust})<br>
• Offensive CR ${offCR} (DPR ${dpr}, Atk +${atkBonus}, expected +${expectedAtk}, adj ${atkAdjust >= 0 ? '+' : ''}${atkAdjust})<br>
• Defense adjustment: +${defenseAdjust}<br>
• Special traits: +${specialAdjust.toFixed(2)}<br>
• <strong>Final CR: ${finalCR.toFixed(1)} (CR ${finalCRLabel})</strong> = ${crToXP[Math.round(finalCR)] || crToXP[30]} XP
</div>`;
});

// ==================== TAB 15: CONCENTRATION (NEW) ====================
$('#btnCalcConc').addEventListener('click', () => {
const damage = parseInt($('#concDamage').value) || 20;
const conMod = parseInt($('#concConMod').value) || 0;
const warCaster = $('#concWarCaster').checked;
const resilient = $('#concResilient').checked;
const spellLevel = parseInt($('#concSpellLevel').value) || 3;
const hits = parseInt($('#concHits').value) || 1;
const dc = Math.max(10, Math.floor(damage / 2));
const totalBonus = conMod + (resilient ? 2 : 0);
const needed = dc - totalBonus;
let successChance = (21 - needed) / 20;
successChance = Math.max(0.05, Math.min(0.95, successChance));
if (warCaster) successChance = 1 - Math.pow(1 - successChance, 2);
const multiHitSurvival = Math.pow(successChance, hits);
const avgDamageToBreak = Math.max(0, (needed - 1) * 2);
const damageToCertainBreak = (dc - totalBonus) * 2;
$('#concResult').innerHTML = `
<div class="result-grid">
<div class="result-item"><div class="value">${dc}</div><div class="label">Save DC</div></div>
<div class="result-item"><div class="value">${(successChance * 100).toFixed(1)}%</div><div class="label">Success Chance</div></div>
<div class="result-item"><div class="value">${needed}+</div><div class="label">Need on d20</div></div>
<div class="result-item"><div class="value">${(multiHitSurvival * 100).toFixed(1)}%</div><div class="label">Survive ${hits} hits</div></div>
</div>
<div class="highlight-box">
<strong>Formula:</strong> DC = max(10, ⌊${damage}/2⌋) = ${dc}<br>
<strong>Bonus:</strong> ${conMod} (CON)${resilient ? ' + 2 (Resilient)' : ''} = ${totalBonus}<br>
<strong>Need:</strong> ${dc} - ${totalBonus} = ${needed}+ on d20<br>
${warCaster ? '<strong>War Caster:</strong> Advantage on save<br>' : ''}
<strong>Success chance per hit:</strong> ${(successChance * 100).toFixed(1)}%<br>
<strong>Survival across ${hits} hits:</strong> ${(multiHitSurvival * 100).toFixed(1)}%<br>
<strong>Avg damage to break:</strong> ~${avgDamageToBreak.toFixed(0)} HP<br>
<strong>Certain break threshold:</strong> ${damageToCertainBreak}+ damage
</div>
<div class="highlight-box" style="margin-top:8px;">
<strong>Spell Level ${spellLevel} Context:</strong><br>
• Level ${spellLevel} spells typically last ${spellLevel <= 2 ? '1 minute' : spellLevel <= 5 ? '10 minutes' : '1 hour'}<br>
• At ${Math.round(60 / (1 - successChance))} avg damage per hit, you'll break after ~${Math.round(60 / (1 - successChance))} hits<br>
• Expected hits before breaking: ${(1 / (1 - successChance)).toFixed(1)}
</div>`;
});

// ==================== TAB 16: DAY BUDGET (NEW) ====================
$('#btnCalcDayBudget').addEventListener('click', () => {
const encounters = parseInt($('#dayEncounters').value) || 6;
const partySize = parseInt($('#dayPartySize').value) || 4;
const partyLevel = parseInt($('#dayPartyLevel').value) || 5;
const shortRests = parseInt($('#dayShortRests').value) || 2;
const mix = $('#dayDifficultyMix').value;
const threshold = xpThresholds[partyLevel] || xpThresholds[5];
const dailyBudget = threshold.medium * partySize;
const perEncounter = dailyBudget / encounters;
const spellSlotsPerDay = partyLevel <= 4 ? 3 : partyLevel <= 8 ? 5 : 7;
const hitDicePerDay = partyLevel;
const expectedHPDrain = partyLevel * 5 * encounters;
const difficultyMix = {
balanced: { easy: 0.25, medium: 0.5, hard: 0.2, deadly: 0.05 },
easy: { easy: 0.5, medium: 0.35, hard: 0.1, deadly: 0.05 },
medium: { easy: 0.15, medium: 0.6, hard: 0.2, deadly: 0.05 },
hard: { easy: 0.05, medium: 0.3, hard: 0.5, deadly: 0.15 },
deadly: { easy: 0, medium: 0.15, hard: 0.35, deadly: 0.5 }
};
const mixWeights = difficultyMix[mix];
const avgDifficulty = mixWeights.easy * threshold.easy + mixWeights.medium * threshold.medium + mixWeights.hard * threshold.hard + mixWeights.deadly * threshold.deadly;
const resourceDrain = {
spellSlots: Math.min(spellSlotsPerDay, encounters * 0.8),
hitDice: Math.min(hitDicePerDay, expectedHPDrain / 10),
hpPercent: Math.min(100, (expectedHPDrain / (partyLevel * 15 * partySize)) * 100)
};
$('#dayBudgetResult').innerHTML = `
<div class="result-grid">
<div class="result-item"><div class="value">${dailyBudget}</div><div class="label">Daily XP Budget</div></div>
<div class="result-item"><div class="value">${Math.round(perEncounter)}</div><div class="label">Per Encounter</div></div>
<div class="result-item"><div class="value">${encounters}</div><div class="label">Encounters</div></div>
<div class="result-item"><div class="value">${Math.round(avgDifficulty)}</div><div class="label">Avg Encounter XP</div></div>
</div>
<h4 style="margin-top:16px;">Resource Estimates</h4>
<div class="highlight-box">
<strong>Spell Slots:</strong> ~${spellSlotsPerDay} per caster/day<br>
<strong>Hit Dice:</strong> ${hitDicePerDay} per character<br>
<strong>Expected HP Loss:</strong> ~${expectedHPDrain} per day (${(expectedHPDrain / partySize).toFixed(0)} per PC)<br>
<strong>Short Rests:</strong> ${shortRests} recommended
</div>
<h4 style="margin-top:12px;">Resource Drain Visualization</h4>
<div style="margin:8px 0;">
<div style="font-size:0.85rem;font-weight:600;">Spell Slots Used: ${resourceDrain.spellSlots.toFixed(1)} / ${spellSlotsPerDay}</div>
<div class="resource-bar"><div class="resource-bar-fill" style="width:${(resourceDrain.spellSlots / spellSlotsPerDay * 100).toFixed(0)}%;">${(resourceDrain.spellSlots / spellSlotsPerDay * 100).toFixed(0)}%</div></div>
</div>
<div style="margin:8px 0;">
<div style="font-size:0.85rem;font-weight:600;">Hit Dice Spent: ${resourceDrain.hitDice.toFixed(1)} / ${hitDicePerDay}</div>
<div class="resource-bar"><div class="resource-bar-fill" style="width:${(resourceDrain.hitDice / hitDicePerDay * 100).toFixed(0)}%;">${(resourceDrain.hitDice / hitDicePerDay * 100).toFixed(0)}%</div></div>
</div>
<div style="margin:8px 0;">
<div style="font-size:0.85rem;font-weight:600;">HP Lost: ${resourceDrain.hpPercent.toFixed(0)}%</div>
<div class="resource-bar"><div class="resource-bar-fill" style="width:${resourceDrain.hpPercent.toFixed(0)}%;">${resourceDrain.hpPercent.toFixed(0)}%</div></div>
</div>
<div class="highlight-box" style="margin-top:12px;">
<strong>DMG Guideline:</strong> A typical adventuring day = 6-8 encounters, 1-2 short rests.<br>
<strong>Difficulty Mix:</strong> ${mix} — ${Math.round(mixWeights.easy * 100)}% Easy, ${Math.round(mixWeights.medium * 100)}% Medium, ${Math.round(mixWeights.hard * 100)}% Hard, ${Math.round(mixWeights.deadly * 100)}% Deadly
</div>`;
});
let dayTimeline = [];
function renderDayTimeline() {
const container = $('#dayTimeline');
if (dayTimeline.length === 0) { container.innerHTML = '<p style="color:var(--text2);font-size:0.85rem;">No encounters added yet.</p>'; return; }
container.innerHTML = dayTimeline.map((item, idx) => {
if (item.type === 'rest') {
return `<div class="timeline-item" style="border-left-color:var(--success);">
<div class="enc-num">🌞</div>
<div class="enc-details"><strong>Short Rest</strong> — Recover Hit Dice, some spell slots</div>
<button class="small" data-remove-timeline="${idx}">✕</button>
</div>`;
}
const diffColors = { easy: 'var(--success)', medium: '#4a7c3f', hard: 'var(--warning)', deadly: 'var(--danger)' };
return `<div class="timeline-item" style="border-left-color:${diffColors[item.difficulty]};">
<div class="enc-num">${idx + 1}</div>
<div class="enc-details">
<strong>Encounter ${idx + 1}</strong> — ${item.difficulty.charAt(0).toUpperCase() + item.difficulty.slice(1)}<br>
<span style="font-size:0.85rem;color:var(--text2);">HP Drain: ${item.hpDrain}%</span>
</div>
<button class="small" data-remove-timeline="${idx}">✕</button>
</div>`;
}).join('');
container.querySelectorAll('[data-remove-timeline]').forEach(btn => {
btn.addEventListener('click', () => { dayTimeline.splice(parseInt(btn.dataset.removeTimeline), 1); renderDayTimeline(); });
});
}
$('#btnAddTimelineEnc').addEventListener('click', () => {
dayTimeline.push({ type: 'encounter', difficulty: $('#timelineEncDiff').value, hpDrain: parseInt($('#timelineHPDrain').value) || 15 });
renderDayTimeline();
});
$('#btnAddShortRest').addEventListener('click', () => { dayTimeline.push({ type: 'rest' }); renderDayTimeline(); });
$('#btnClearTimeline').addEventListener('click', () => { dayTimeline = []; renderDayTimeline(); });
renderDayTimeline();

// ==================== TAB 17: PARTY RADAR (NEW) ====================
$('#btnCalcRadar').addEventListener('click', () => {
const dpr = parseInt($('#radarDPR').value) || 60;
const aoe = parseInt($('#radarAoE').value) || 40;
const healing = parseInt($('#radarHealing').value) || 50;
const tank = parseInt($('#radarTank').value) || 800;
const utility = parseInt($('#radarUtility').value) || 8;
const control = parseInt($('#radarControl').value) || 3;
const canvas = $('#radarCanvas');
const ctx = canvas.getContext('2d');
const dprScale = window.devicePixelRatio || 1;
const rect = canvas.getBoundingClientRect();
canvas.width = rect.width * dprScale; canvas.height = rect.height * dprScale;
ctx.scale(dprScale, dprScale);
const W = rect.width, H = rect.height;
const centerX = W / 2, centerY = H / 2;
const maxRadius = Math.min(W, H) / 2 - 40;
const maxValues = { dpr: 100, aoe: 80, healing: 100, tank: 1500, utility: 20, control: 10 };
const normalized = {
dpr: Math.min(100, (dpr / maxValues.dpr) * 100),
aoe: Math.min(100, (aoe / maxValues.aoe) * 100),
healing: Math.min(100, (healing / maxValues.healing) * 100),
tank: Math.min(100, (tank / maxValues.tank) * 100),
utility: Math.min(100, (utility / maxValues.utility) * 100),
control: Math.min(100, (control / maxValues.control) * 100)
};
const labels = ['Single DPR', 'AoE DPR', 'Healing', 'Tankiness', 'Utility', 'Control'];
const values = [normalized.dpr, normalized.aoe, normalized.healing, normalized.tank, normalized.utility, normalized.control];
const numAxes = labels.length;
const angleStep = (Math.PI * 2) / numAxes;
ctx.clearRect(0, 0, W, H);
ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
for (let i = 1; i <= 5; i++) {
const radius = (maxRadius / 5) * i;
ctx.beginPath();
for (let j = 0; j <= numAxes; j++) {
const angle = angleStep * j - Math.PI / 2;
const x = centerX + Math.cos(angle) * radius;
const y = centerY + Math.sin(angle) * radius;
if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
}
ctx.stroke();
}
ctx.strokeStyle = '#999';
for (let i = 0; i < numAxes; i++) {
const angle = angleStep * i - Math.PI / 2;
const x = centerX + Math.cos(angle) * maxRadius;
const y = centerY + Math.sin(angle) * maxRadius;
ctx.beginPath(); ctx.moveTo(centerX, centerY); ctx.lineTo(x, y); ctx.stroke();
ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text2').trim() || '#333';
ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
const labelX = centerX + Math.cos(angle) * (maxRadius + 20);
const labelY = centerY + Math.sin(angle) * (maxRadius + 20);
ctx.fillText(labels[i], labelX, labelY);
}
ctx.fillStyle = 'rgba(139, 58, 58, 0.3)';
ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#8b3a3a';
ctx.lineWidth = 2;
ctx.beginPath();
for (let i = 0; i <= numAxes; i++) {
const idx = i % numAxes;
const angle = angleStep * idx - Math.PI / 2;
const radius = (values[idx] / 100) * maxRadius;
const x = centerX + Math.cos(angle) * radius;
const y = centerY + Math.sin(angle) * radius;
if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
}
ctx.fill(); ctx.stroke();
const avgScore = values.reduce((a, b) => a + b, 0) / values.length;
const minIdx = values.indexOf(Math.min(...values));
const minLabel = labels[minIdx];
$('#radarAnalysis').innerHTML = `
<div class="highlight-box">
<strong>Average Score:</strong> ${avgScore.toFixed(0)}/100<br>
<strong>Weakest Area:</strong> ${minLabel} (${values[minIdx].toFixed(0)}/100)<br>
<strong>Recommendation:</strong> ${
avgScore > 70 ? 'Well-balanced party!' :
avgScore > 50 ? 'Consider strengthening ' + minLabel + '.' :
'Party needs improvement, especially in ' + minLabel + '.'
}
</div>`;
});

// ==================== TAB 18: COMBAT TRACKER (Phase 1) ====================
const CT_KEY = 'ddhp_combat_v2';
const CT_CONDITIONS = ['Blinded','Charmed','Deafened','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious','Concentrating'];
let ctState = { list: [], turn: 0, round: 1, log: [] };

function ctSave() {
  try { localStorage.setItem(CT_KEY, JSON.stringify(ctState)); }
  catch (e) { console.warn('Could not save combat state', e); }
}
function ctLoad() {
  try {
    const raw = localStorage.getItem(CT_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p && Array.isArray(p.list)) ctState = { list: p.list, turn: p.turn || 0, round: p.round || 1, log: Array.isArray(p.log) ? p.log : [] };
  } catch (e) { console.warn('Could not restore combat state', e); }
}
function ctUid() { return Math.random().toString(36).slice(2, 9); }
function ctFind(id) { return ctState.list.find(c => c.id === id); }
function ctSnapshot(c) { return JSON.parse(JSON.stringify(c)); }
function ctPush(text, before) {
  ctState.log.unshift({ id: ctUid(), round: ctState.round, text: text, before: before ? ctSnapshot(before) : null, time: Date.now() });
  ctState.log = ctState.log.slice(0, 60);
}
function ctSortList() {
  const activeId = ctState.list[ctState.turn] ? ctState.list[ctState.turn].id : null;
  ctState.list.sort((a, b) => b.init - a.init || b.dex - a.dex || a.name.localeCompare(b.name));
  if (activeId) {
    const i = ctState.list.findIndex(c => c.id === activeId);
    if (i >= 0) ctState.turn = i;
  }
}
function ctMake(o) {
  o = o || {};
  const maxHP = Math.max(1, parseInt(o.maxHP) || 10);
  return {
    id: ctUid(),
    name: o.name || 'Combatant',
    kind: o.kind === 'pc' ? 'pc' : 'monster',
    dex: parseInt(o.dex) || 0,
    init: (o.init === undefined || o.init === null || o.init === '') ? (Math.floor(Math.random() * 20) + 1 + (parseInt(o.dex) || 0)) : parseInt(o.init),
    ac: parseInt(o.ac) || 12,
    maxHP: maxHP,
    hp: o.hp === undefined ? maxHP : Math.max(0, Math.min(maxHP, parseInt(o.hp))),
    temp: 0,
    conditions: [],
    ds: 0,
    df: 0,
    stable: false
  };
}
function ctHpColor(c) {
  if (c.hp <= 0) return '#777';
  const pct = c.hp / c.maxHP;
  if (pct <= 0.25) return '#a83232';
  if (pct <= 0.5) return '#c1671f';
  if (pct <= 0.75) return '#b5951e';
  return '#4a7c3f';
}
function ctDots(n, total) { return '\u25CF'.repeat(n) + '\u25CB'.repeat(Math.max(0, total - n)); }

function ctRender() {
  const list = $('#ctList');
  const standing = ctState.list.filter(c => c.hp > 0).length;
  const active = ctState.list[ctState.turn];
  $('#ctSummary').innerHTML = `
<div class="result-item"><div class="value">${ctState.round}</div><div class="label">Round</div></div>
<div class="result-item"><div class="value">${ctState.list.length}</div><div class="label">Combatants</div></div>
<div class="result-item"><div class="value">${standing}</div><div class="label">Standing</div></div>
<div class="result-item"><div class="value" style="font-size:1.05rem;">${esc(active ? active.name : '\u2014')}</div><div class="label">Current Turn</div></div>`;

  if (ctState.list.length === 0) {
    list.innerHTML = '<p style="color:var(--text2);font-size:0.85rem;">No combatants yet. Add PCs and monsters above, or import them from the Encounter tab.</p>';
    ctRenderLog();
    ctSave();
    return;
  }

  list.innerHTML = ctState.list.map((c, idx) => {
    const pct = Math.round((c.hp / c.maxHP) * 100);
    const isActive = idx === ctState.turn;
    const conds = CT_CONDITIONS.map(cond => {
      const on = c.conditions.indexOf(cond) >= 0;
      return `<button type="button" class="small" data-ct-cond="${c.id}" data-cond="${esc(cond)}" aria-pressed="${on}" style="padding:2px 7px;font-size:0.7rem;border-radius:999px;${on ? 'background:var(--accent);color:#fff;' : 'opacity:0.65;'}">${esc(cond)}</button>`;
    }).join(' ');
    const death = (c.kind === 'pc' && c.hp === 0) ? `
<div class="highlight-box" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
<strong style="font-size:0.8rem;">Death Saves</strong>
<span style="color:var(--success);">Successes ${ctDots(c.ds, 3)}</span>
<span style="color:var(--danger);">Failures ${ctDots(c.df, 3)}</span>
<button class="small" data-ct-ds="${c.id}">+ Success</button>
<button class="small" data-ct-df="${c.id}">+ Failure</button>
<button class="small" data-ct-dsclear="${c.id}">Clear</button>
${c.stable ? '<span class="badge green">Stable</span>' : ''}
${c.df >= 3 ? '<span class="badge danger">Dead</span>' : ''}
</div>` : '';

    return `<div class="initiative-item ${isActive ? 'active' : ''}" style="flex-direction:column;align-items:stretch;${c.hp === 0 ? 'opacity:0.72;' : ''}">
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
    <input type="number" class="ct-mini" data-ct-init="${c.id}" value="${c.init}" aria-label="Initiative for ${esc(c.name)}" style="width:58px;text-align:center;font-weight:700;">
    <span class="init-name">${esc(c.name)}</span>
    <span class="badge">${c.kind === 'pc' ? 'PC' : 'Monster'}</span>
    <span class="init-hp">AC ${c.ac}</span>
    <span class="init-hp">${c.hp}/${c.maxHP} HP${c.temp > 0 ? ' (+' + c.temp + ' temp)' : ''}</span>
    <button class="small" data-ct-remove="${c.id}" aria-label="Remove ${esc(c.name)}" style="margin-left:auto;">&#10005;</button>
  </div>
  <div class="resource-bar" style="margin-top:6px;"><div class="resource-bar-fill" style="width:${Math.max(0, pct)}%;background:${ctHpColor(c)};">${pct}%</div></div>
  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px;">
    <input type="number" class="ct-mini" data-ct-amt="${c.id}" placeholder="0" aria-label="Damage or healing amount for ${esc(c.name)}" style="width:76px;">
    <button class="small" data-ct-dmg="${c.id}">&#128165; Damage</button>
    <button class="small" data-ct-heal="${c.id}">&#128154; Heal</button>
    <button class="small" data-ct-temp="${c.id}">&#128737; Temp HP</button>
    <button class="small" data-ct-max="${c.id}">&#9874; Set Max HP</button>
  </div>
  <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">${conds}</div>
  ${death}
</div>`;
  }).join('');

  ctRenderLog();
  ctSave();
}

function ctRenderLog() {
  const box = $('#ctLog');
  if (!ctState.log.length) { box.innerHTML = '<p style="color:var(--text2);font-size:0.85rem;">Nothing logged yet.</p>'; return; }
  box.innerHTML = '<ol style="margin:0;padding-left:18px;font-size:0.87rem;">' + ctState.log.map(l =>
    `<li style="margin-bottom:4px;"><span style="color:var(--text2);">Round ${l.round}</span> &mdash; ${esc(l.text)}</li>`
  ).join('') + '</ol>';
}

function ctAmount(id) {
  const el = document.querySelector(`[data-ct-amt="${id}"]`);
  const v = Math.max(0, Math.round(parseFloat(el && el.value) || 0));
  if (el) el.value = '';
  return v;
}

function ctApplyDamage(c, amount) {
  let dmg = amount;
  if (c.temp > 0) { const absorbed = Math.min(c.temp, dmg); c.temp -= absorbed; dmg -= absorbed; }
  const wasUp = c.hp > 0;
  c.hp = Math.max(0, c.hp - dmg);
  if (c.hp === 0 && wasUp) {
    c.stable = false;
    if (c.kind === 'pc' && c.conditions.indexOf('Unconscious') < 0) c.conditions.push('Unconscious');
  }
}
function ctApplyHeal(c, amount) {
  const wasDown = c.hp === 0;
  c.hp = Math.min(c.maxHP, c.hp + amount);
  if (wasDown && c.hp > 0) {
    c.ds = 0; c.df = 0; c.stable = false;
    c.conditions = c.conditions.filter(x => x !== 'Unconscious');
  }
}

// Delegated handlers for the whole combat tab
$('#tab-initiative').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const d = btn.dataset;
  let c;

  if (d.ctRemove) {
    const i = ctState.list.findIndex(x => x.id === d.ctRemove);
    if (i < 0) return;
    ctPush(ctState.list[i].name + ' removed from combat', null);
    ctState.list.splice(i, 1);
    if (ctState.turn >= ctState.list.length) ctState.turn = 0;
    return ctRender();
  }
  if (d.ctDmg) {
    c = ctFind(d.ctDmg); if (!c) return;
    const amt = ctAmount(d.ctDmg); if (!amt) return;
    const before = ctSnapshot(c);
    ctApplyDamage(c, amt);
    ctPush(`${c.name} took ${amt} damage \u2192 ${c.hp}/${c.maxHP} HP`, before);
    return ctRender();
  }
  if (d.ctHeal) {
    c = ctFind(d.ctHeal); if (!c) return;
    const amt = ctAmount(d.ctHeal); if (!amt) return;
    const before = ctSnapshot(c);
    ctApplyHeal(c, amt);
    ctPush(`${c.name} healed ${amt} \u2192 ${c.hp}/${c.maxHP} HP`, before);
    return ctRender();
  }
  if (d.ctTemp) {
    c = ctFind(d.ctTemp); if (!c) return;
    const amt = ctAmount(d.ctTemp);
    const before = ctSnapshot(c);
    c.temp = Math.max(c.temp, amt); // temp HP does not stack, take the higher
    ctPush(`${c.name} temp HP set to ${c.temp}`, before);
    return ctRender();
  }
  if (d.ctMax) {
    c = ctFind(d.ctMax); if (!c) return;
    const amt = ctAmount(d.ctMax); if (!amt) return;
    const before = ctSnapshot(c);
    c.maxHP = amt; c.hp = Math.min(c.hp, amt);
    ctPush(`${c.name} max HP set to ${amt}`, before);
    return ctRender();
  }
  if (d.ctCond) {
    c = ctFind(d.ctCond); if (!c) return;
    const before = ctSnapshot(c);
    const cond = d.cond;
    const i = c.conditions.indexOf(cond);
    if (i >= 0) { c.conditions.splice(i, 1); ctPush(`${c.name} lost ${cond}`, before); }
    else { c.conditions.push(cond); ctPush(`${c.name} gained ${cond}`, before); }
    return ctRender();
  }
  if (d.ctDs) {
    c = ctFind(d.ctDs); if (!c) return;
    const before = ctSnapshot(c);
    c.ds = Math.min(3, c.ds + 1);
    if (c.ds >= 3) { c.stable = true; ctPush(`${c.name} is stable`, before); }
    else ctPush(`${c.name} succeeded a death save (${c.ds}/3)`, before);
    return ctRender();
  }
  if (d.ctDf) {
    c = ctFind(d.ctDf); if (!c) return;
    const before = ctSnapshot(c);
    c.df = Math.min(3, c.df + 1);
    ctPush(c.df >= 3 ? `${c.name} died` : `${c.name} failed a death save (${c.df}/3)`, before);
    return ctRender();
  }
  if (d.ctDsclear) {
    c = ctFind(d.ctDsclear); if (!c) return;
    const before = ctSnapshot(c);
    c.ds = 0; c.df = 0; c.stable = false;
    ctPush(`${c.name} death saves cleared`, before);
    return ctRender();
  }
});

$('#tab-initiative').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.ctInit) {
    const c = ctFind(el.dataset.ctInit);
    if (!c) return;
    c.init = parseInt(el.value) || 0;
    ctSortList();
    ctRender();
  }
});

$('#ctAdd').addEventListener('click', () => {
  const name = ($('#ctName').value || '').trim() || 'Combatant';
  const count = Math.max(1, Math.min(20, parseInt($('#ctCount').value) || 1));
  const kind = $('#ctKind').value;
  const dex = parseInt($('#ctDex').value) || 0;
  const initRaw = $('#ctInit').value;
  const maxHP = parseInt($('#ctMaxHP').value) || 10;
  const ac = parseInt($('#ctAC').value) || 12;
  for (let i = 0; i < count; i++) {
    ctState.list.push(ctMake({
      name: count > 1 ? `${name} ${i + 1}` : name,
      kind: kind, dex: dex, ac: ac, maxHP: maxHP,
      init: initRaw === '' ? undefined : parseInt(initRaw)
    }));
  }
  ctPush(`${count > 1 ? count + ' \u00D7 ' : ''}${name} joined the fight`, null);
  ctSortList();
  $('#ctName').value = ''; $('#ctInit').value = '';
  ctRender();
});

$('#ctRollAll').addEventListener('click', () => {
  ctState.list.forEach(c => { c.init = Math.floor(Math.random() * 20) + 1 + c.dex; });
  ctSortList();
  ctPush('Initiative rerolled for all combatants', null);
  ctRender();
});
$('#ctSort').addEventListener('click', () => { ctSortList(); ctRender(); });
$('#ctNext').addEventListener('click', () => {
  if (!ctState.list.length) return;
  ctState.turn++;
  if (ctState.turn >= ctState.list.length) { ctState.turn = 0; ctState.round++; ctPush(`Round ${ctState.round} begins`, null); }
  ctRender();
});
$('#ctPrev').addEventListener('click', () => {
  if (!ctState.list.length) return;
  ctState.turn--;
  if (ctState.turn < 0) { ctState.turn = ctState.list.length - 1; ctState.round = Math.max(1, ctState.round - 1); }
  ctRender();
});
$('#ctUndo').addEventListener('click', () => {
  const entry = ctState.log.shift();
  if (!entry) return;
  if (entry.before) {
    const i = ctState.list.findIndex(c => c.id === entry.before.id);
    if (i >= 0) ctState.list[i] = entry.before;
  }
  ctRender();
});
$('#ctClear').addEventListener('click', () => {
  ctState = { list: [], turn: 0, round: 1, log: [] };
  ctRender();
});
$('#ctImportEncounter').addEventListener('click', () => {
  if (typeof monsterData === 'undefined' || !monsterData.length) { alert('Add monsters on the Encounter tab first.'); return; }
  monsterData.forEach(m => {
    const n = Math.max(1, parseInt(m.count) || 1);
    for (let i = 0; i < n; i++) {
      ctState.list.push(ctMake({
        name: n > 1 ? `${m.name || 'Monster'} ${i + 1}` : (m.name || 'Monster'),
        kind: 'monster',
        maxHP: parseInt(m.hp) || 20,
        ac: parseInt(m.ac) || 13
      }));
    }
  });
  ctPush('Imported monsters from the Encounter tab', null);
  ctSortList();
  ctRender();
});
$('#ctImportParty').addEventListener('click', () => {
  if (typeof partyData === 'undefined' || !partyData.length) { alert('Add PCs on the Encounter tab first.'); return; }
  partyData.forEach((pc, i) => {
    ctState.list.push(ctMake({
      name: pc.name || `PC ${i + 1}`,
      kind: 'pc',
      maxHP: parseInt(pc.hp) || 30,
      ac: parseInt(pc.ac) || 15
    }));
  });
  ctPush('Imported party from the Encounter tab', null);
  ctSortList();
  ctRender();
});

ctLoad();
ctRender();

// ==================== TAB 19: MONTE CARLO (NEW) ====================
$('#btnRunMonteCarlo').addEventListener('click', () => {
const partyHP = parseInt($('#mcPartyHP').value) || 120;
const partyDPR = parseInt($('#mcPartyDPR').value) || 80;
const partyAC = parseInt($('#mcPartyAC').value) || 16;
const monsterHP = parseInt($('#mcMonsterHP').value) || 200;
const monsterDPR = parseInt($('#mcMonsterDPR').value) || 50;
const monsterAtk = parseInt($('#mcMonsterAtk').value) || 7;
const sims = parseInt($('#mcSims').value) || 1000;
const partySize = parseInt($('#mcPartySize').value) || 4;
const monsterCount = parseInt($('#mcMonsterCount').value) || 1;
let partyWins = 0, totalRounds = 0, partyCasualties = 0;
const roundDistribution = {};
for (let sim = 0; sim < sims; sim++) {
let pHP = partyHP;
let mHP = monsterHP;
let rounds = 0;
while (pHP > 0 && mHP > 0 && rounds < 50) {
const partyVariance = 0.8 + Math.random() * 0.4;
const partyDmg = partyDPR * partyVariance * (partySize / 4);
mHP -= partyDmg;
if (mHP <= 0) { partyWins++; totalRounds += rounds; roundDistribution[rounds] = (roundDistribution[rounds] || 0) + 1; break; }
const monsterHitChance = Math.max(0.05, Math.min(0.95, (21 - (partyAC - monsterAtk)) / 20));
const monsterVariance = 0.8 + Math.random() * 0.4;
const monsterDmg = monsterDPR * monsterVariance * monsterHitChance * (monsterCount / 1);
pHP -= monsterDmg;
rounds++;
}
if (pHP <= 0) { partyCasualties++; totalRounds += rounds; }
}
const winRate = (partyWins / sims) * 100;
const avgRounds = totalRounds / sims;
const casualtyRate = (partyCasualties / sims) * 100;
const actionEconRatio = monsterCount / partySize;
$('#mcResult').innerHTML = `
<div class="result-grid">
<div class="result-item"><div class="value">${winRate.toFixed(1)}%</div><div class="label">Party Win Rate</div></div>
<div class="result-item"><div class="value">${avgRounds.toFixed(1)}</div><div class="label">Avg Rounds</div></div>
<div class="result-item"><div class="value">${casualtyRate.toFixed(1)}%</div><div class="label">Casualty Rate</div></div>
<div class="result-item"><div class="value">${actionEconRatio.toFixed(2)}</div><div class="label">Action Econ Ratio</div></div>
</div>
<div class="highlight-box">
<strong>Analysis:</strong> Based on ${sims} simulations<br>
${winRate > 75 ? '<span class="badge green">Favorable</span> Party has strong advantage' :
winRate > 50 ? '<span class="badge warn">Balanced</span> Even matchup' :
'<span class="badge danger">Dangerous</span> Party at significant disadvantage'}
</div>`;
// Draw histogram
const canvas = $('#mcCanvas');
const ctx = canvas.getContext('2d');
const dprScale = window.devicePixelRatio || 1;
const rect = canvas.getBoundingClientRect();
canvas.width = rect.width * dprScale; canvas.height = rect.height * dprScale;
ctx.scale(dprScale, dprScale);
const W = rect.width, H = rect.height;
ctx.clearRect(0, 0, W, H);
ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--input-bg').trim() || '#fffef9';
ctx.fillRect(0, 0, W, H);
const rounds = Object.keys(roundDistribution).map(Number).sort((a, b) => a - b);
if (rounds.length === 0) return;
const maxCount = Math.max(...rounds.map(r => roundDistribution[r]));
const padding = { top: 20, right: 20, bottom: 40, left: 50 };
const plotW = W - padding.left - padding.right;
const plotH = H - padding.top - padding.bottom;
const barWidth = Math.max(5, plotW / rounds.length - 2);
ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#8b3a3a';
rounds.forEach((r, i) => {
const x = padding.left + i * (plotW / rounds.length);
const barH = (roundDistribution[r] / maxCount) * plotH;
const y = padding.top + plotH - barH;
ctx.fillRect(x, y, barWidth, barH);
});
ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text2').trim() || '#333';
ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
rounds.forEach((r, i) => {
if (i % Math.ceil(rounds.length / 10) === 0) {
const x = padding.left + i * (plotW / rounds.length) + barWidth / 2;
ctx.fillText(r, x, padding.top + plotH + 16);
}
});
ctx.fillText('Rounds to Victory', padding.left + plotW / 2, padding.top + plotH + 32);
});

// ==================== TAB 20: XP TRACKER (NEW) ====================
let xpHistory = safeParse('ddhp_xpHistory', []);
if (!Array.isArray(xpHistory)) xpHistory = [];
function renderXPTracker() {
const currentLevel = parseInt($('#xpCurrentLevel').value) || 1;
const currentXP = parseInt($('#xpCurrent').value) || 0;
const nextLevelXP = xpForLevel[currentLevel + 1] || 999999;
const xpToNext = nextLevelXP - currentXP;
const progress = ((currentXP - xpForLevel[currentLevel]) / (nextLevelXP - xpForLevel[currentLevel])) * 100;
$('#xpResult').innerHTML = `
<div class="result-grid">
<div class="result-item"><div class="value">${currentLevel}</div><div class="label">Current Level</div></div>
<div class="result-item"><div class="value">${currentXP}</div><div class="label">Current XP</div></div>
<div class="result-item"><div class="value">${xpToNext > 0 ? xpToNext : 0}</div><div class="label">XP to Next</div></div>
</div>
<div class="highlight-box">
<strong>Progress:</strong> ${Math.min(100, progress).toFixed(1)}% to level ${currentLevel + 1}<br>
<div style="background:var(--card2);height:20px;border-radius:10px;overflow:hidden;margin-top:8px;">
<div style="background:var(--accent);height:100%;width:${Math.min(100, progress)}%;transition:width 0.3s;"></div>
</div>
</div>`;
if (xpHistory.length > 0) {
let historyHTML = '<h4>Session History</h4><ul style="list-style:none;padding:0;">';
xpHistory.slice(-10).reverse().forEach(entry => {
historyHTML += `<li style="padding:6px;background:var(--card2);margin-bottom:4px;border-radius:4px;">
<strong>+${entry.xp} XP</strong> → Level ${entry.level} (${entry.date})
</li>`;
});
historyHTML += '</ul>';
$('#xpHistory').innerHTML = historyHTML;
}
}
$('#btnAddXP').addEventListener('click', () => {
const sessionXP = parseInt($('#xpSession').value) || 0;
const currentLevel = parseInt($('#xpCurrentLevel').value) || 1;
const currentXP = parseInt($('#xpCurrent').value) || 0;
const newXP = currentXP + sessionXP;
$('#xpCurrent').value = newXP;
let newLevel = currentLevel;
while (newLevel < 20 && newXP >= xpForLevel[newLevel + 1]) newLevel++;
if (newLevel > currentLevel) {
$('#xpCurrentLevel').value = newLevel;
alert(`🎉 Level Up! You are now level ${newLevel}!`);
}
xpHistory.push({ xp: sessionXP, level: newLevel, date: new Date().toLocaleDateString() });
localStorage.setItem('ddhp_xpHistory', JSON.stringify(xpHistory));
renderXPTracker();
});
$('#btnResetXP').addEventListener('click', () => {
if (confirm('Reset XP history?')) {
xpHistory = [];
localStorage.setItem('ddhp_xpHistory', JSON.stringify(xpHistory));
renderXPTracker();
}
});
$('#btnExportXP').addEventListener('click', () => {
const json = JSON.stringify(xpHistory, null, 2);
navigator.clipboard.writeText(json).then(() => alert('XP history exported!')).catch(() => alert('Export failed.'));
});
renderXPTracker();
// Loot Split
$('#btnCalcLoot').addEventListener('click', () => {
const gp = parseInt($('#lootGP').value) || 0;
const xp = parseInt($('#lootXP').value) || 0;
const party = parseInt($('#lootParty').value) || 1;
const magicItems = parseInt($('#lootMagicItems').value) || 0;
const gpPerPC = Math.floor(gp / party);
const xpPerPC = Math.floor(xp / party);
$('#lootResult').innerHTML = `
<div class="result-grid">
<div class="result-item"><div class="value">${gpPerPC}</div><div class="label">GP per PC</div></div>
<div class="result-item"><div class="value">${xpPerPC}</div><div class="label">XP per PC</div></div>
<div class="result-item"><div class="value">${magicItems}</div><div class="label">Magic Items</div></div>
</div>
<div class="highlight-box">
<strong>Total Split:</strong> ${gp} GP ÷ ${party} PCs = ${gpPerPC} GP each<br>
<strong>XP Split:</strong> ${xp} XP ÷ ${party} PCs = ${xpPerPC} XP each<br>
<strong>Magic Items:</strong> ${magicItems} item(s) — distribute based on party needs
</div>`;
});

// ==================== INITIALIZATION ====================
function init() {
if (lastSession && lastSession.expression) $('#hdExpression').value = lastSession.expression;
$('#btnCalculate').click();
if (currentHPResult) $('#sbHP').value = currentHPResult.expression + ' (' + currentHPResult.average + ' avg)';
if ($('#probExpression').value) $('#btnCalcProb').click();
renderParty();
renderMonsters();
}
init();
console.log('🐉 D&D 5e Ultimate HP Calculator & Monster Builder ready!');
console.log('Total Features: 70+ including CR Calculator, Concentration, Day Budget, Party Radar, Initiative, Monte Carlo, XP Tracker');
})();

// ==================== SHAREABLE LINK ====================
const SHARE_FIELDS = ['hdExpression','batchInput','creatureSize','creatureNumHD','creatureConMod','creatureFlatBonus','effBaseHP','effCR','effLegendaryResist','effRegen','effTempHP','pcRuleset','pcConMod','revTargetCR','revSize','probExpression'];
function buildShareHash() {
  const data = { t: (document.querySelector('.tab-btn.active') || {}).dataset ? document.querySelector('.tab-btn.active').dataset.tab : 'tab-calculator', f: {} };
  SHARE_FIELDS.forEach(id => { const el = document.getElementById(id); if (el && el.value) data.f[id] = String(el.value).slice(0, 500); });
  try { return '#s=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data))))); }
  catch (err) { console.warn('Could not encode share link', err); return ''; }
}
function applyShareHash() {
  const m = location.hash.match(/^#s=(.+)$/);
  if (!m) return false;
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
    if (!data || typeof data !== 'object') return false;
    Object.entries(data.f || {}).forEach(([id, val]) => {
      if (!SHARE_FIELDS.includes(id)) return;
      const el = document.getElementById(id);
      if (el) el.value = String(val).slice(0, 500);
    });
    if (typeof data.t === 'string' && document.getElementById(data.t)) switchTab(data.t);
    return true;
  } catch (err) { console.warn('Could not read shared link', err); return false; }
}
const shareBtn = document.getElementById('btnShare');
if (shareBtn) shareBtn.addEventListener('click', async () => {
  const hash = buildShareHash();
  if (!hash) { alert('Could not build a share link.'); return; }
  const url = location.origin + location.pathname + location.search + hash;
  history.replaceState(null, '', hash);
  try { await navigator.clipboard.writeText(url); shareBtn.textContent = '✅ Copied'; }
  catch (err) { window.prompt('Copy this link:', url); shareBtn.textContent = '🔗 Share'; return; }
  setTimeout(() => { shareBtn.textContent = '🔗 Share'; }, 1800);
});
if (applyShareHash()) {
  const btn = document.getElementById('btnCalculate');
  if (btn) btn.click();
}

// ==================== KEYBOARD SHORTCUTS ====================
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  const tabs = Array.from(document.querySelectorAll('.tab-btn'));
  if (/^[1-9]$/.test(e.key)) { const i = parseInt(e.key, 10) - 1; if (tabs[i]) { switchTab(tabs[i].dataset.tab); tabs[i].focus(); e.preventDefault(); } return; }
  if (e.key === '0' && tabs[9]) { switchTab(tabs[9].dataset.tab); tabs[9].focus(); e.preventDefault(); return; }
  const k = e.key.toLowerCase();
  if (k === 'd') { const b = document.getElementById('btnDarkToggle'); if (b) { b.click(); e.preventDefault(); } }
  else if (k === 's') { const b = document.getElementById('btnShare'); if (b) { b.click(); e.preventDefault(); } }
  else if (k === '?') { alert('Keyboard shortcuts\n\n1–9, 0 — jump to a tab\nD — toggle dark mode\nS — copy share link\n? — this help'); }
});

// ==================== INSTALLABLE (manifest, no service worker) ====================
(function () {
  try {
    const icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='96' fill='%238b3a3a'/%3E%3Ctext x='256' y='360' font-size='288' text-anchor='middle' fill='%23f5e6d3' font-family='Georgia,serif'%3E%E2%9A%94%3C/text%3E%3C/svg%3E";
    const manifest = {
      name: 'D&D 5e HP Calculator & Monster Builder',
      short_name: '5e HP Forge',
      description: 'Hit point math, effective HP, CR tools, encounter balance and an initiative tracker for D&D 5e.',
      start_url: '.', scope: '.', display: 'standalone',
      background_color: '#f5e6d3', theme_color: '#8b3a3a',
      icons: [{ src: icon, sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = URL.createObjectURL(blob);
    document.head.appendChild(link);
  } catch (err) { console.warn('Could not attach the web app manifest', err); }
})();

/* ===== v4 ADD-ON MODULE (purely additive; does not modify any existing code) ===== */
(function(){
'use strict';
/* --------------------------------------------------------------
   v4 Add-on: Loot Roller, Random Encounter Generator,
   Lair & Legendary Actions, Damage & Kill Probability.
   Self-contained: own helpers, own state, own storage keys.
   -------------------------------------------------------------- */
const NS = 'v4';
const esc4 = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el = (id) => document.getElementById(id);
const rnd = (n) => Math.floor(Math.random() * n) + 1;
const rollDice = (n, f) => { let t = 0; for (let i = 0; i < n; i++) t += rnd(f); return t; };
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmt = (n) => Number(n).toLocaleString();

/* ---------- parse "2d6+3" style damage (local, strict) ---------- */
function parseDmg(expr) {
  const s = String(expr || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'Enter a damage expression, e.g. 2d6+3.' };
  if (!/^[+-]?[0-9d+-]+$/.test(s)) return { ok: false, error: 'Only numbers, "d", "+" and "-" are allowed.' };
  const toks = s.match(/[+-]?[^+-]+/g) || [];
  const dice = []; let flat = 0;
  for (const t of toks) {
    const sign = t[0] === '-' ? -1 : 1;
    const body = t.replace(/^[+-]/, '');
    if (!body) return { ok: false, error: 'Dangling "+" or "-".' };
    const m = body.match(/^(\d*)d(\d+)$/);
    if (m) {
      const n = m[1] === '' ? 1 : parseInt(m[1], 10), f = parseInt(m[2], 10);
      if (!n || !f || n > 200 || f > 1000) return { ok: false, error: 'Dice out of range (max 200 dice, d1000).' };
      dice.push({ n, f, sign });
    } else if (/^\d+$/.test(body)) { flat += sign * parseInt(body, 10); }
    else return { ok: false, error: 'Could not read "' + body + '".' };
  }
  if (!dice.length && !flat) return { ok: false, error: 'Nothing to roll.' };
  return { ok: true, dice, flat };
}
/* exact distribution via convolution; returns map offset->prob */
function dmgDistribution(p) {
  let dist = new Map([[p.flat, 1]]);
  for (const d of p.dice) {
    for (let i = 0; i < d.n; i++) {
      const next = new Map();
      for (const [v, pr] of dist) {
        for (let face = 1; face <= d.f; face++) {
          const k = v + d.sign * face;
          next.set(k, (next.get(k) || 0) + pr / d.f);
        }
      }
      dist = next;
      if (dist.size > 40000) return dist;
    }
  }
  return dist;
}

/* ---------- data tables ---------- */
const HOARD = {
  '0-4':  { coins: [[6,'d6',100,'cp'],[3,'d6',100,'sp'],[2,'d6',10,'gp']], gems: [[6,'d6',0,'10 gp gems'],[2,'d6',0,'25 gp art']], items: 1 },
  '5-10': { coins: [[2,'d6',100,'cp'],[2,'d6',1000,'sp'],[6,'d6',100,'gp'],[3,'d6',10,'pp']], gems: [[2,'d4',0,'25 gp gems'],[2,'d4',0,'250 gp art']], items: 2 },
  '11-16':{ coins: [[4,'d6',1000,'gp'],[5,'d6',100,'pp']], gems: [[3,'d6',0,'250 gp gems'],[2,'d4',0,'750 gp art']], items: 3 },
  '17+':  { coins: [[12,'d6',1000,'gp'],[8,'d6',1000,'pp']], gems: [[3,'d6',0,'1000 gp gems'],[1,'d10',0,'2500 gp art']], items: 4 }
};
const MAGIC_ITEMS = {
  minor: ['Potion of Healing','Spell Scroll (1st level)','Potion of Climbing','Bag of Holding','Driftglobe','+1 Weapon','Cloak of Protection','Goggles of Night','Immovable Rod','Boots of Elvenkind','Wand of Magic Missiles','Eyes of Minute Seeing'],
  major: ['+2 Weapon','Flame Tongue','Cloak of Displacement','Ring of Protection','Wand of Fireballs','Boots of Speed','Belt of Hill Giant Strength','Staff of Healing','Mantle of Spell Resistance','Ioun Stone of Reserve','Dancing Sword','Rod of Absorption']
};
const ENV_TABLES = {
  Forest: ['Wolf','Dire Wolf','Giant Spider','Owlbear','Bandit','Bandit Captain','Awakened Tree','Druid','Ettercap','Green Hag'],
  Dungeon: ['Skeleton','Zombie','Goblin','Hobgoblin','Bugbear','Gelatinous Cube','Mimic','Rust Monster','Wight','Ghoul'],
  Mountain: ['Griffon','Hill Giant','Stone Giant','Harpy','Wyvern','Ogre','Orc','Roc','Manticore','Young Red Dragon'],
  Swamp: ['Crocodile','Giant Frog','Lizardfolk','Shambling Mound','Will-o-Wisp','Black Dragon Wyrmling','Bullywug','Hydra'],
  Underdark: ['Drow','Duergar','Grick','Hook Horror','Mind Flayer','Cloaker','Quaggoth','Roper','Umber Hulk'],
  Coastal: ['Sahuagin','Merrow','Giant Crab','Harpy','Reef Shark','Water Elemental','Pirate (Bandit)','Sea Hag'],
  Urban: ['Thug','Spy','Cult Fanatic','Guard','Veteran','Doppelganger','Wererat','Assassin']
};
const COMPLICATIONS = ['They are already fighting something else.','They are wounded and fleeing.','They want to parley or trade.','Difficult terrain: heavy rain, fog, or mud.','They have set an ambush.','They are guarding treasure or a captive.','A third party arrives in 3 rounds.','They mistake the party for allies.'];
const LEGENDARY_LIB = [
  { name: 'Detect', cost: 1, text: 'The creature makes a Wisdom (Perception) check.' },
  { name: 'Attack', cost: 1, text: 'The creature makes one weapon attack.' },
  { name: 'Move', cost: 1, text: 'The creature moves up to its speed without provoking opportunity attacks.' },
  { name: 'Tail Sweep', cost: 2, text: 'Each creature within 10 ft. must succeed on a DC {DC} Dexterity save or be knocked prone.' },
  { name: 'Frightful Presence', cost: 2, text: 'Each creature within 60 ft. must succeed on a DC {DC} Wisdom save or be frightened for 1 minute.' },
  { name: 'Cast a Spell', cost: 2, text: 'The creature casts a spell from its list.' },
  { name: 'Devastating Blow', cost: 3, text: 'The creature makes one attack with advantage; on a hit the target takes an extra {DIE} damage.' }
];
const LAIR_LIB = [
  'Grasping roots or rubble erupts: each creature in a 20-ft radius must make a DC {DC} Dexterity save or be restrained until initiative 20 of the next round.',
  'A cloud of choking dust fills a 20-ft cube: creatures inside are blinded until the end of their next turn.',
  'The floor becomes difficult terrain in a 30-ft radius until initiative 20 of the next round.',
  'Magical darkness spreads from a point the creature chooses within 120 ft. in a 15-ft radius.',
  'A wall of the lair shifts, creating or sealing a passage of the creature\u2019s choosing.',
  'Each hostile creature within 60 ft. must make a DC {DC} Constitution save or take 5 (1d10) damage.'
];

/* ---------- inject tabs ---------- */
const TABS = [
  { id: 'v4-loot', label: '\uD83D\uDCB0 Loot Roller' },
  { id: 'v4-randenc', label: '\uD83C\uDFB2 Random Encounter' },
  { id: 'v4-lair', label: '\uD83D\uDC51 Lair & Legendary' },
  { id: 'v4-killprob', label: '\u2620\uFE0F Kill Probability' }
];
function activate(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); b.setAttribute('tabindex', '-1'); });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector('[data-tab="' + tabId + '"]');
  const panel = el(tabId);
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); btn.setAttribute('tabindex', '0'); btn.focus(); }
  if (panel) panel.classList.add('active');
}

function build() {
  const nav = document.querySelector('.tab-nav[role="tablist"]');
  const wrap = document.querySelector('.tab-panel') && document.querySelector('.tab-panel').parentNode;
  if (!nav || !wrap) return;

  TABS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tab-btn';
    b.setAttribute('role', 'tab');
    b.id = 'btn-' + t.id;
    b.setAttribute('aria-controls', t.id);
    b.setAttribute('aria-selected', 'false');
    b.setAttribute('tabindex', '-1');
    b.dataset.tab = t.id;
    b.textContent = t.label;
    b.addEventListener('click', () => activate(t.id));
    nav.appendChild(b);
  });

  const panels = document.createElement('div');
  panels.innerHTML = `
<section class="tab-panel" id="v4-loot" role="tabpanel" aria-labelledby="btn-v4-loot" tabindex="0">
  <div class="card">
    <h3>\uD83D\uDCB0 Treasure Hoard Roller</h3>
    <p class="muted">Rolls coins, gems/art and magic items using DMG-style hoard tiers.</p>
    <div class="input-row">
      <div class="input-group"><label for="v4LootTier">Challenge tier</label>
        <select id="v4LootTier"><option value="0-4">CR 0\u20134</option><option value="5-10">CR 5\u201310</option><option value="11-16">CR 11\u201316</option><option value="17+">CR 17+</option></select>
      </div>
      <div class="input-group"><label for="v4LootType">Hoard type</label>
        <select id="v4LootType"><option value="hoard">Hoard (coins + gems + items)</option><option value="individual">Individual (coins only)</option></select>
      </div>
      <div class="input-group"><label for="v4LootParty">Party size (split)</label><input type="number" id="v4LootParty" value="4" min="1" max="12"></div>
    </div>
    <div class="btn-row"><button class="primary" id="v4BtnLoot">Roll Treasure</button> <button id="v4BtnLootCopy">Copy Result</button></div>
    <div id="v4LootOut" aria-live="polite" style="margin-top:12px;"></div>
  </div>
</section>

<section class="tab-panel" id="v4-randenc" role="tabpanel" aria-labelledby="btn-v4-randenc" tabindex="0">
  <div class="card">
    <h3>\uD83C\uDFB2 Random Encounter Generator</h3>
    <p class="muted">Picks creatures by environment, scales the group to party level, and adds a twist.</p>
    <div class="input-row">
      <div class="input-group"><label for="v4EncEnv">Environment</label><select id="v4EncEnv"></select></div>
      <div class="input-group"><label for="v4EncLevel">Party level</label><input type="number" id="v4EncLevel" value="3" min="1" max="20"></div>
      <div class="input-group"><label for="v4EncSize">Party size</label><input type="number" id="v4EncSize" value="4" min="1" max="10"></div>
      <div class="input-group"><label for="v4EncDiff">Target difficulty</label>
        <select id="v4EncDiff"><option>Easy</option><option selected>Medium</option><option>Hard</option><option>Deadly</option></select>
      </div>
    </div>
    <div class="btn-row"><button class="primary" id="v4BtnEnc">Generate Encounter</button> <button id="v4BtnEncTwist">New Twist Only</button></div>
    <div id="v4EncOut" aria-live="polite" style="margin-top:12px;"></div>
  </div>
</section>

<section class="tab-panel" id="v4-lair" role="tabpanel" aria-labelledby="btn-v4-lair" tabindex="0">
  <div class="card">
    <h3>\uD83D\uDC51 Lair & Legendary Action Builder</h3>
    <div class="input-row">
      <div class="input-group"><label for="v4LairName">Creature name</label><input type="text" id="v4LairName" value="Ancient Wyrm"></div>
      <div class="input-group"><label for="v4LairDC">Save DC</label><input type="number" id="v4LairDC" value="17" min="5" max="30"></div>
      <div class="input-group"><label for="v4LairActions">Legendary actions / round</label><input type="number" id="v4LairActions" value="3" min="1" max="5"></div>
      <div class="input-group"><label for="v4LairDie">Bonus damage die</label><input type="text" id="v4LairDie" value="2d10"></div>
    </div>
    <div class="input-group"><label>Legendary options (pick any)</label><div id="v4LegList" class="chip-row"></div></div>
    <div class="input-group"><label>Lair actions (initiative 20)</label><div id="v4LairList" class="chip-row"></div></div>
    <div class="btn-row"><button class="primary" id="v4BtnLairGen">Generate Block</button> <button id="v4BtnLairCopy">Copy Markdown</button></div>
    <div id="v4LairOut" aria-live="polite" style="margin-top:12px;"></div>
  </div>
</section>

<section class="tab-panel" id="v4-killprob" role="tabpanel" aria-labelledby="btn-v4-killprob" tabindex="0">
  <div class="card">
    <h3>\u2620\uFE0F Expected Damage & Kill Probability</h3>
    <p class="muted">Exact math: hit chance, crits, resistance, and the odds of dropping the target in N rounds.</p>
    <div class="input-row">
      <div class="input-group"><label for="v4KpDmg">Damage per hit</label><input type="text" id="v4KpDmg" value="2d6+4"></div>
      <div class="input-group"><label for="v4KpAtk">Attack bonus</label><input type="number" id="v4KpAtk" value="7"></div>
      <div class="input-group"><label for="v4KpAC">Target AC</label><input type="number" id="v4KpAC" value="15" min="1" max="35"></div>
      <div class="input-group"><label for="v4KpHP">Target HP</label><input type="number" id="v4KpHP" value="45" min="1"></div>
    </div>
    <div class="input-row">
      <div class="input-group"><label for="v4KpNum">Attacks per round</label><input type="number" id="v4KpNum" value="2" min="1" max="12"></div>
      <div class="input-group"><label for="v4KpRounds">Rounds</label><input type="number" id="v4KpRounds" value="3" min="1" max="20"></div>
      <div class="input-group"><label for="v4KpAdv">Roll type</label><select id="v4KpAdv"><option value="normal">Normal</option><option value="adv">Advantage</option><option value="dis">Disadvantage</option></select></div>
      <div class="input-group"><label for="v4KpMit">Target mitigation</label><select id="v4KpMit"><option value="1">None</option><option value="0.5">Resistant</option><option value="2">Vulnerable</option><option value="0">Immune</option></select></div>
    </div>
    <div class="btn-row"><button class="primary" id="v4BtnKp">Calculate</button></div>
    <div id="v4KpOut" aria-live="polite" style="margin-top:12px;"></div>
  </div>
</section>`;
  while (panels.firstElementChild) wrap.appendChild(panels.firstElementChild);

  /* ---- Loot ---- */
  let lootText = '';
  el('v4BtnLoot').addEventListener('click', () => {
    const tier = el('v4LootTier').value;
    const type = el('v4LootType').value;
    const party = Math.max(1, parseInt(el('v4LootParty').value, 10) || 1);
    const t = HOARD[tier];
    const lines = [];
    let gpTotal = 0;
    const rate = { cp: 0.01, sp: 0.1, gp: 1, pp: 10 };
    t.coins.forEach(([n, d, mult, coin]) => {
      const faces = parseInt(d.slice(1), 10);
      let amt = rollDice(n, faces) * (mult || 1);
      if (type === 'individual') amt = Math.max(1, Math.round(amt / 10));
      gpTotal += amt * rate[coin];
      lines.push(`${fmt(amt)} ${coin}`);
    });
    const gems = [];
    if (type === 'hoard') {
      t.gems.forEach(([n, d, , label]) => {
        const faces = parseInt(d.slice(1), 10);
        const c = rollDice(n, faces);
        const unit = parseInt(label, 10) || 0;
        gpTotal += c * unit;
        gems.push(`${c} \u00D7 ${label}`);
      });
    }
    const items = [];
    if (type === 'hoard') {
      const count = t.items;
      for (let i = 0; i < count; i++) items.push(pick(i < count - 1 ? MAGIC_ITEMS.minor : (tier === '0-4' ? MAGIC_ITEMS.minor : MAGIC_ITEMS.major)));
    }
    const perHead = gpTotal / party;
    lootText = `Treasure (${tier}, ${type})\nCoins: ${lines.join(', ')}\n` +
      (gems.length ? `Gems/Art: ${gems.join(', ')}\n` : '') +
      (items.length ? `Magic Items: ${items.join(', ')}\n` : '') +
      `Total value: ${gpTotal.toFixed(1)} gp \u2014 ${perHead.toFixed(1)} gp each (${party} PCs)`;
    el('v4LootOut').innerHTML =
      `<div class="result-box"><div class="stat-grid">
        <div class="stat"><div class="stat-label">Total Value</div><div class="stat-value">${esc4(gpTotal.toFixed(1))} gp</div></div>
        <div class="stat"><div class="stat-label">Per Character</div><div class="stat-value">${esc4(perHead.toFixed(1))} gp</div></div>
        <div class="stat"><div class="stat-label">Magic Items</div><div class="stat-value">${items.length}</div></div>
      </div>
      <p><strong>Coins:</strong> ${esc4(lines.join(', '))}</p>
      ${gems.length ? `<p><strong>Gems / Art:</strong> ${esc4(gems.join(', '))}</p>` : ''}
      ${items.length ? `<p><strong>Magic Items:</strong></p><ul>${items.map(i => `<li>${esc4(i)}</li>`).join('')}</ul>` : ''}
      </div>`;
  });
  el('v4BtnLootCopy').addEventListener('click', () => {
    if (!lootText) return;
    if (navigator.clipboard) navigator.clipboard.writeText(lootText).catch(() => {});
  });

  /* ---- Random encounter ---- */
  const envSel = el('v4EncEnv');
  Object.keys(ENV_TABLES).forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = k; envSel.appendChild(o); });
  function genEnc() {
    const env = envSel.value;
    const lvl = Math.max(1, Math.min(20, parseInt(el('v4EncLevel').value, 10) || 1));
    const size = Math.max(1, parseInt(el('v4EncSize').value, 10) || 1);
    const diff = el('v4EncDiff').value;
    const mult = { Easy: 0.6, Medium: 1, Hard: 1.5, Deadly: 2.2 }[diff];
    const kinds = 1 + (Math.random() < 0.4 ? 1 : 0);
    const chosen = [];
    for (let i = 0; i < kinds; i++) {
      let name = pick(ENV_TABLES[env]);
      if (chosen.some(c => c.name === name)) continue;
      const base = Math.max(1, Math.round((lvl * size * mult) / (4 + lvl * 0.8)));
      const count = Math.max(1, base + Math.floor(Math.random() * 3) - 1);
      chosen.push({ name, count });
    }
    const twist = pick(COMPLICATIONS);
    const dist = pick(['30 ft. \u2014 immediate', '60 ft. \u2014 one round to react', '120 ft. \u2014 time to plan', 'Surprise: adjacent']);
    el('v4EncOut').innerHTML = `<div class="result-box">
      <p><strong>${esc4(env)} \u2014 ${esc4(diff)} (party ${size} \u00D7 level ${lvl})</strong></p>
      <ul>${chosen.map(c => `<li>${c.count} \u00D7 ${esc4(c.name)}</li>`).join('')}</ul>
      <p><strong>Starting distance:</strong> ${esc4(dist)}</p>
      <p id="v4EncTwist"><strong>Complication:</strong> ${esc4(twist)}</p>
      <p class="muted">Cross-check the exact XP budget in the Encounter tab.</p>
    </div>`;
  }
  el('v4BtnEnc').addEventListener('click', genEnc);
  el('v4BtnEncTwist').addEventListener('click', () => {
    const p = el('v4EncTwist');
    if (!p) return genEnc();
    p.innerHTML = '<strong>Complication:</strong> ' + esc4(pick(COMPLICATIONS));
  });

  /* ---- Lair & legendary ---- */
  const legBox = el('v4LegList'), lairBox = el('v4LairList');
  LEGENDARY_LIB.forEach((a, i) => {
    const l = document.createElement('label');
    l.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin:4px 10px 4px 0;';
    l.innerHTML = `<input type="checkbox" data-leg="${i}" ${i < 3 ? 'checked' : ''}> ${esc4(a.name)} (${a.cost})`;
    legBox.appendChild(l);
  });
  LAIR_LIB.forEach((a, i) => {
    const l = document.createElement('label');
    l.style.cssText = 'display:flex;align-items:flex-start;gap:6px;margin:4px 0;';
    l.innerHTML = `<input type="checkbox" data-lair="${i}" ${i < 2 ? 'checked' : ''}> <span>${esc4(a.slice(0, 90))}\u2026</span>`;
    lairBox.appendChild(l);
  });
  let lairMd = '';
  el('v4BtnLairGen').addEventListener('click', () => {
    const name = el('v4LairName').value.trim() || 'Creature';
    const dc = parseInt(el('v4LairDC').value, 10) || 15;
    const acts = parseInt(el('v4LairActions').value, 10) || 3;
    const die = el('v4LairDie').value.trim() || '2d10';
    const legs = Array.from(legBox.querySelectorAll('input:checked')).map(i => LEGENDARY_LIB[+i.dataset.leg]);
    const lairs = Array.from(lairBox.querySelectorAll('input:checked')).map(i => LAIR_LIB[+i.dataset.lair]);
    const sub = (s) => s.replace(/\{DC\}/g, dc).replace(/\{DIE\}/g, die);
    lairMd = `### ${name}\n\n**Legendary Actions.** ${name} can take ${acts} legendary actions, choosing from the options below. Only one can be used at a time and only at the end of another creature's turn. It regains spent legendary actions at the start of its turn.\n\n` +
      legs.map(a => `- **${a.name}${a.cost > 1 ? ' (Costs ' + a.cost + ' Actions)' : ''}.** ${sub(a.text)}`).join('\n') +
      (lairs.length ? `\n\n**Lair Actions.** On initiative count 20 (losing ties), ${name} takes a lair action to cause one of the following effects; it can't use the same effect two rounds in a row.\n\n` + lairs.map(a => `- ${sub(a)}`).join('\n') : '');
    el('v4LairOut').innerHTML = `<div class="result-box"><pre style="white-space:pre-wrap;font-family:inherit;">${esc4(lairMd)}</pre></div>`;
  });
  el('v4BtnLairCopy').addEventListener('click', () => {
    if (lairMd && navigator.clipboard) navigator.clipboard.writeText(lairMd).catch(() => {});
  });

  /* ---- Kill probability ---- */
  el('v4BtnKp').addEventListener('click', () => {
    const out = el('v4KpOut');
    const parsed = parseDmg(el('v4KpDmg').value);
    if (!parsed.ok) { out.innerHTML = `<div class="result-box error">${esc4(parsed.error)}</div>`; return; }
    const atk = parseInt(el('v4KpAtk').value, 10) || 0;
    const ac = parseInt(el('v4KpAC').value, 10) || 10;
    const hp = Math.max(1, parseInt(el('v4KpHP').value, 10) || 1);
    const num = Math.max(1, Math.min(12, parseInt(el('v4KpNum').value, 10) || 1));
    const rounds = Math.max(1, Math.min(20, parseInt(el('v4KpRounds').value, 10) || 1));
    const mode = el('v4KpAdv').value;
    const mit = parseFloat(el('v4KpMit').value);

    const need = Math.min(20, Math.max(2, ac - atk));
    let pHitRaw = (21 - need) / 20;              // includes nat 20s
    let pCrit = 1 / 20;
    if (mode === 'adv') { pHitRaw = 1 - Math.pow(1 - pHitRaw, 2); pCrit = 1 - Math.pow(19 / 20, 2); }
    if (mode === 'dis') { pHitRaw = Math.pow(pHitRaw, 2); pCrit = Math.pow(1 / 20, 2); }
    const pNormalHit = Math.max(0, pHitRaw - pCrit);

    // distributions
    const base = dmgDistribution(parsed);
    const critParsed = { dice: parsed.dice.map(d => ({ ...d, n: d.n * 2 })), flat: parsed.flat };
    const crit = dmgDistribution(critParsed);
    const scale = (v) => Math.max(0, Math.floor(v * mit));

    // one-attack distribution
    let one = new Map([[0, 1 - pHitRaw]]);
    const add = (m, k, p) => m.set(k, (m.get(k) || 0) + p);
    for (const [v, p] of base) add(one, scale(v), p * pNormalHit);
    for (const [v, p] of crit) add(one, scale(v), p * pCrit);

    // convolve for total attacks, capping at hp (absorbing state)
    const total = num * rounds;
    const cap = hp;
    const clamp = (v) => Math.min(v, cap);
    let cur = new Map([[0, 1]]);
    const perRoundKill = [];
    for (let a = 1; a <= total; a++) {
      const next = new Map();
      for (const [v, p] of cur) {
        if (v >= cap) { add(next, cap, p); continue; }
        for (const [d, q] of one) add(next, clamp(v + d), p * q);
      }
      cur = next;
      if (a % num === 0) perRoundKill.push(cur.get(cap) || 0);
    }
    // expected damage per attack (uncapped)
    let evOne = 0; for (const [v, p] of one) evOne += v * p;

    const rowsHtml = perRoundKill.map((p, i) => `<tr><td>Round ${i + 1}</td><td>${(p * 100).toFixed(1)}%</td></tr>`).join('');
    out.innerHTML = `<div class="result-box">
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">Hit Chance</div><div class="stat-value">${(pHitRaw * 100).toFixed(1)}%</div></div>
        <div class="stat"><div class="stat-label">Avg Dmg / Attack</div><div class="stat-value">${evOne.toFixed(2)}</div></div>
        <div class="stat"><div class="stat-label">Avg Dmg / Round</div><div class="stat-value">${(evOne * num).toFixed(2)}</div></div>
        <div class="stat"><div class="stat-label">Kill in ${rounds} Rd</div><div class="stat-value">${((perRoundKill[perRoundKill.length - 1] || 0) * 100).toFixed(1)}%</div></div>
      </div>
      <p class="muted">Needs a ${need}+ on the d20 vs AC ${esc4(ac)}${mit !== 1 ? ' \u2014 mitigation applied' : ''}. Rounds to kill on average: ${evOne * num > 0 ? (hp / (evOne * num)).toFixed(1) : '\u221E'}.</p>
      <table class="data-table"><thead><tr><th>Cumulative</th><th>Chance target is dropped</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    </div>`;
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
else build();
})();


(function(){
'use strict';
/* --------------------------------------------------------------
   v5 Add-on (Tier 1 + Tier 2):
   1. Dice Roller Sandbox        6. CR Auto-Estimator
   2. Damage vs Target           7. Rest & Recovery Manager
   3. Ability Score Roller       8. d20 Probability (adv/dis)
   4. Spell DC & Attack          9. NPC Generator
   5. Conditions Reference
   Self-contained: own helpers, own state, own storage keys.
   -------------------------------------------------------------- */
const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const g = (id) => document.getElementById(id);
const d = (n) => Math.floor(Math.random() * n) + 1;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const num = (id, dflt) => { const v = parseFloat((g(id) || {}).value); return Number.isFinite(v) ? v : dflt; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mod = (score) => Math.floor((score - 10) / 2);
const sgn = (n) => (n >= 0 ? '+' : '') + n;

/* ---------- shared parser (local, strict) ---------- */
function parse5(expr) {
  const s = String(expr || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'Enter an expression, e.g. 2d6+3.' };
  if (!/^[+-]?[0-9d+-]+$/.test(s)) return { ok: false, error: 'Only numbers, "d", "+" and "-" are allowed.' };
  const toks = s.match(/[+-]?[^+-]+/g) || [];
  const dice = []; let flat = 0;
  for (const t of toks) {
    const sign = t[0] === '-' ? -1 : 1;
    const body = t.replace(/^[+-]/, '');
    if (!body) return { ok: false, error: 'Dangling "+" or "-".' };
    const m = body.match(/^(\d*)d(\d+)$/);
    if (m) {
      const n = m[1] === '' ? 1 : parseInt(m[1], 10), f = parseInt(m[2], 10);
      if (!n || n > 500) return { ok: false, error: 'Dice count must be 1\u2013500.' };
      if (f < 2 || f > 1000) return { ok: false, error: 'Die size must be 2\u20131000.' };
      dice.push({ n, f, sign });
    } else if (/^\d+$/.test(body)) { flat += sign * parseInt(body, 10); }
    else return { ok: false, error: 'Could not read "' + body + '".' };
  }
  if (!dice.length && !flat) return { ok: false, error: 'Nothing to roll.' };
  return { ok: true, dice, flat };
}
function dist5(p) {
  let dist = new Map([[p.flat, 1]]);
  for (const dd of p.dice) {
    for (let i = 0; i < dd.n; i++) {
      const next = new Map();
      for (const [v, pr] of dist) for (let f = 1; f <= dd.f; f++) {
        const k = v + dd.sign * f; next.set(k, (next.get(k) || 0) + pr / dd.f);
      }
      dist = next;
      if (dist.size > 40000) return dist;
    }
  }
  return dist;
}
function avg5(p) { let a = p.flat; for (const dd of p.dice) a += dd.sign * dd.n * (dd.f + 1) / 2; return a; }

/* ---------- data ---------- */
const CONDITIONS = [
  ['Blinded', "Can't see, auto-fails sight checks. Attacks against it have advantage; its attacks have disadvantage."],
  ['Charmed', "Can't attack the charmer or target it with harmful effects. The charmer has advantage on social checks."],
  ['Deafened', "Can't hear and auto-fails ability checks requiring hearing."],
  ['Frightened', 'Disadvantage on checks and attacks while the source is in line of sight; can\u2019t willingly move closer.'],
  ['Grappled', 'Speed becomes 0. Ends if the grappler is incapacitated or the target is removed from reach.'],
  ['Incapacitated', "Can't take actions or reactions."],
  ['Invisible', 'Impossible to see without magic. Attacks against it have disadvantage; its attacks have advantage.'],
  ['Paralyzed', 'Incapacitated, can\u2019t move or speak, auto-fails STR/DEX saves. Attacks have advantage; hits within 5 ft are critical.'],
  ['Petrified', 'Transformed to stone: incapacitated, weight \u00d710, resistance to all damage, immune to poison and disease.'],
  ['Poisoned', 'Disadvantage on attack rolls and ability checks.'],
  ['Prone', 'Can only crawl. Disadvantage on attacks; attacks within 5 ft have advantage, ranged attacks have disadvantage.'],
  ['Restrained', 'Speed 0. Attacks against it have advantage, its attacks have disadvantage, disadvantage on DEX saves.'],
  ['Stunned', 'Incapacitated, can\u2019t move, speaks falteringly, auto-fails STR/DEX saves. Attacks have advantage.'],
  ['Unconscious', 'Incapacitated, drops everything, falls prone, auto-fails STR/DEX saves. Hits within 5 ft are critical.'],
  ['Exhaustion 1', '2014: disadvantage on ability checks. 2024: \u22122 to d20 tests.'],
  ['Exhaustion 2', '2014: speed halved. 2024: \u22124 to d20 tests.'],
  ['Exhaustion 3', '2014: disadvantage on attacks and saves. 2024: \u22126 to d20 tests.'],
  ['Exhaustion 4', '2014: hit point maximum halved. 2024: \u22128 to d20 tests.'],
  ['Exhaustion 5', '2014: speed reduced to 0. 2024: \u221210 to d20 tests.'],
  ['Exhaustion 6', 'Death.']
];
/* Defensive/offensive CR from the DMG monster creation table */
const DEF_CR = [[6,'0',13],[35,'1/8',13],[49,'1/4',13],[70,'1/2',13],[85,'1',13],[100,'2',13],[115,'3',13],[130,'4',14],[145,'5',15],[160,'6',15],[175,'7',15],[190,'8',16],[205,'9',16],[220,'10',17],[235,'11',17],[250,'12',17],[265,'13',18],[280,'14',18],[295,'15',18],[310,'16',18],[325,'17',19],[340,'18',19],[355,'19',19],[400,'20',19],[445,'21',19],[490,'22',19],[535,'23',19],[580,'24',19],[625,'25',19],[670,'26',19],[715,'27',19],[760,'28',19],[805,'29',19],[850,'30',19]];
const OFF_CR = [[1,'0',13,3],[3,'1/8',13,3],[5,'1/4',13,3],[8,'1/2',13,3],[14,'1',13,3],[20,'2',13,3],[26,'3',13,4],[32,'4',14,5],[38,'5',15,6],[44,'6',15,6],[50,'7',15,6],[56,'8',16,7],[62,'9',16,7],[68,'10',17,7],[74,'11',17,8],[80,'12',17,8],[86,'13',18,8],[92,'14',18,8],[98,'15',18,8],[104,'16',18,9],[110,'17',19,10],[116,'18',19,10],[122,'19',19,10],[140,'20',19,10],[158,'21',19,11],[176,'22',19,11],[194,'23',19,11],[212,'24',19,12],[230,'25',19,12],[248,'26',19,12],[266,'27',19,13],[284,'28',19,13],[302,'29',19,13],[320,'30',19,14]];
const CR_ORDER = ['0','1/8','1/4','1/2','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30'];
const CR_XP = {'0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700,'4':1100,'5':1800,'6':2300,'7':2900,'8':3900,'9':5000,'10':5900,'11':7200,'12':8400,'13':10000,'14':11500,'15':13000,'16':15000,'17':18000,'18':20000,'19':22000,'20':25000,'21':33000,'22':41000,'23':50000,'24':62000,'25':75000,'26':90000,'27':105000,'28':120000,'29':135000,'30':155000};
const HIT_DICE = { Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10, Bard: 8, Cleric: 8, Druid: 8, Monk: 8, Rogue: 8, Warlock: 8, Artificer: 8, Sorcerer: 6, Wizard: 6 };
const NPC = {
  first: ['Alaric','Brynn','Cassia','Doran','Elowen','Fendrel','Gwyn','Hesper','Ilric','Jora','Kellan','Lysa','Marek','Nessa','Orin','Perrin','Quilla','Rurik','Sable','Torvin','Ulma','Vess','Wren','Yorick','Zephyra'],
  last: ['Ashdown','Blackbriar','Coldwater','Duskmere','Emberly','Fallowfield','Grimsby','Hollowell','Ironvale','Kettleback','Lorrimer','Mossbourne','Nightingale','Oakenshield','Pelham','Quarrow','Ravenhurst','Stonewick','Thistlewood','Umberfall'],
  race: ['Human','Elf','Half-Elf','Dwarf','Halfling','Gnome','Tiefling','Dragonborn','Half-Orc','Goliath','Tabaxi','Firbolg'],
  role: ['Innkeeper','Blacksmith','Town guard','Merchant caravanner','Hedge witch','Temple acolyte','Dockhand','Scribe','Fence','Retired mercenary','Stablemaster','Alchemist','Bounty hunter','Minstrel','Cartographer'],
  trait: ['Never finishes a sentence.','Counts coins while talking.','Smells faintly of woodsmoke.','Laughs at their own jokes.','Speaks in proverbs.','Compulsively tidies things.','Whistles when nervous.','Always eating something.','Refuses to make eye contact.','Repeats your last word back to you.'],
  ideal: ['Honesty above comfort.','The strong protect the weak.','Wealth is freedom.','Tradition keeps us safe.','Change is the only law.','Loyalty to the guild, always.'],
  bond: ['Owes a debt to a dangerous person.','Is raising an orphaned niece.','Guards a family heirloom.','Sworn to avenge a burned village.','Their shop is their whole life.','Secretly loves a rival.'],
  flaw: ['Cannot resist a wager.','Talks before thinking.','Terrified of open water.','Greedy to a fault.','Holds grudges forever.','Drinks to forget.'],
  hook: ['Has a job nobody else will take.','Knows who really owns the mill.','Saw lights in the old barrow last night.','Is being blackmailed.','Wants a rival run out of town.','Lost a shipment on the north road.']
};

/* ---------- tabs ---------- */
const TABS = [
  { id: 'v5-dice',   label: '\uD83C\uDFB0 Dice Sandbox' },
  { id: 'v5-dmg',    label: '\uD83D\uDDE1\uFE0F Damage vs Target' },
  { id: 'v5-abil',   label: '\uD83D\uDCCA Ability Scores' },
  { id: 'v5-spell',  label: '\u2728 Spell DC' },
  { id: 'v5-cond',   label: '\uD83D\uDCD6 Conditions' },
  { id: 'v5-cr',     label: '\u2696\uFE0F CR Estimator' },
  { id: 'v5-rest',   label: '\uD83C\uDFD5\uFE0F Rest & Recovery' },
  { id: 'v5-d20',    label: '\uD83C\uDFAF d20 Odds' },
  { id: 'v5-npc',    label: '\uD83E\uDDD1 NPC Generator' }
];
function activate(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); b.setAttribute('tabindex', '-1'); });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector('[data-tab="' + tabId + '"]');
  const panel = g(tabId);
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); btn.setAttribute('tabindex', '0'); btn.focus(); }
  if (panel) panel.classList.add('active');
}

function build() {
  const nav = document.querySelector('.tab-nav[role="tablist"]');
  const first = document.querySelector('.tab-panel');
  const wrap = first && first.parentNode;
  if (!nav || !wrap) return;

  TABS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tab-btn';
    b.setAttribute('role', 'tab');
    b.id = 'btn-' + t.id;
    b.setAttribute('aria-controls', t.id);
    b.setAttribute('aria-selected', 'false');
    b.setAttribute('tabindex', '-1');
    b.dataset.tab = t.id;
    b.textContent = t.label;
    b.addEventListener('click', () => activate(t.id));
    nav.appendChild(b);
  });

  const holder = document.createElement('div');
  holder.innerHTML = `
<section class="tab-panel" id="v5-dice" role="tabpanel" aria-labelledby="btn-v5-dice" tabindex="0">
  <div class="card">
    <h3>\uD83C\uDFB0 Dice Roller Sandbox</h3>
    <p class="muted">Free-form rolling with keep highest/lowest, exploding dice and reroll thresholds.</p>
    <div class="input-row">
      <div class="input-group"><label for="v5DiceExpr">Expression</label><input type="text" id="v5DiceExpr" value="4d6" placeholder="e.g. 4d6+2"></div>
      <div class="input-group"><label for="v5DiceKeepMode">Keep</label>
        <select id="v5DiceKeepMode"><option value="all">All dice</option><option value="high">Keep highest</option><option value="low">Keep lowest</option></select>
      </div>
      <div class="input-group"><label for="v5DiceKeepN">Keep how many</label><input type="number" id="v5DiceKeepN" value="3" min="1" max="500"></div>
    </div>
    <div class="input-row">
      <div class="input-group"><label for="v5DiceExplode">Exploding dice</label>
        <select id="v5DiceExplode"><option value="0">No</option><option value="1">Yes \u2014 max face rerolls and adds</option></select>
      </div>
      <div class="input-group"><label for="v5DiceReroll">Reroll results at or below</label><input type="number" id="v5DiceReroll" value="0" min="0" max="20"></div>
      <div class="input-group"><label for="v5DiceTimes">Number of rolls</label><input type="number" id="v5DiceTimes" value="1" min="1" max="100"></div>
    </div>
    <div class="btn-row"><button class="primary" id="v5BtnDice">Roll</button> <button id="v5BtnDiceClear">Clear history</button></div>
    <div id="v5DiceOut" aria-live="polite" style="margin-top:12px;"></div>
    <div id="v5DiceHist" style="margin-top:12px;"></div>
  </div>
</section>

<section class="tab-panel" id="v5-dmg" role="tabpanel" aria-labelledby="btn-v5-dmg" tabindex="0">
  <div class="card">
    <h3>\uD83D\uDDE1\uFE0F Damage Calculator vs Target</h3>
    <p class="muted">Applies damage through temp HP and resistance, then reports the concentration DC and death-save state.</p>
    <div class="input-row">
      <div class="input-group"><label for="v5DmgHp">Current HP</label><input type="number" id="v5DmgHp" value="45"></div>
      <div class="input-group"><label for="v5DmgMax">Max HP</label><input type="number" id="v5DmgMax" value="60"></div>
      <div class="input-group"><label for="v5DmgTemp">Temp HP</label><input type="number" id="v5DmgTemp" value="0" min="0"></div>
    </div>
    <div class="input-row">
      <div class="input-group"><label for="v5DmgExpr">Damage roll or number</label><input type="text" id="v5DmgExpr" value="2d10+5"></div>
      <div class="input-group"><label for="v5DmgMode">Roll or average</label>
        <select id="v5DmgMode"><option value="roll">Roll it</option><option value="avg">Use average</option></select>
      </div>
      <div class="input-group"><label for="v5DmgMit">Mitigation</label>
        <select id="v5DmgMit"><option value="1">Normal</option><option value="0.5">Resistant</option><option value="0">Immune</option><option value="2">Vulnerable</option></select>
      </div>
    </div>
    <div class="input-row">
      <div class="input-group"><label for="v5DmgCrit">Critical hit</label><select id="v5DmgCrit"><option value="0">No</option><option value="1">Yes \u2014 double dice</option></select></div>
      <div class="input-group"><label for="v5DmgConc">Target is concentrating</label><select id="v5DmgConc"><option value="1">Yes</option><option value="0">No</option></select></div>
    </div>
    <div class="btn-row"><button class="primary" id="v5BtnDmg">Apply Damage</button> <button id="v5BtnDmgReset">Reset to Max</button></div>
    <div id="v5DmgOut" aria-live="polite" style="margin-top:12px;"></div>
  </div>
</section>

<section class="tab-panel" id="v5-abil" role="tabpanel" aria-labelledby="btn-v5-abil" tabindex="0">
  <div class="card">
    <h3>\uD83D\uDCCA Ability Score Roller</h3>
    <p class="muted">Roll 4d6 drop lowest, use the standard array, or build with point buy.</p>
    <div class="input-row">
      <div class="input-group"><label for="v5AbilMethod">Method</label>
        <select id="v5AbilMethod"><option value="4d6">4d6 drop lowest</option><option value="3d6">3d6 straight</option><option value="array">Standard array</option><option value="pb">Point buy (27 points)</option></select>
      </div>
      <div class="input-group"><label for="v5AbilSets">Sets to roll</label><input type="number" id="v5AbilSets" value="1" min="1" max="10"></div>
    </div>
    <div class="btn-row"><button class="primary" id="v5BtnAbil">Generate</button></div>
    <div id="v5AbilOut" aria-live="polite" style="margin-top:12px;"></div>
  </div>
</section>

<section class="tab-panel" id="v5-spell" role="tabpanel" aria-labelledby="btn-v5-spell" tabindex="0">
  <div class="card">
    <h3>\u2728 Spell Save DC & Attack Bonus</h3>
    <p class="muted">Works for characters and monsters. Also gives the DC a caster must beat to keep concentration.</p>
    <div class="input-row">
      <div class="input-group"><label for="v5SpAbil">Spellcasting ability score</label><input type="number" id="v5SpAbil" value="16" min="1" max="30"></div>
      <div class="input-group"><label for="v5SpLevel">Level or CR</label><input type="number" id="v5SpLevel" value="5" min="0" max="30"></div>
      <div class="input-group"><label for="v5SpMisc">Misc bonus</label><input type="number" id="v5SpMisc" value="0"></div>
    </div>
    <div class="input-row">
      <div class="input-group"><label for="v5SpTargetAc">Target AC</label><input type="number" id="v5SpTargetAc" value="15"></div>
      <div class="input-group"><label for="v5SpSaveMod">Target save modifier</label><input type="number" id="v5SpSaveMod" value="2"></div>
    </div>
    <div class="btn-row"><button class="primary" id="v5BtnSpell">Calculate</button></div>
    <div id="v5SpellOut" aria-live="polite" style="margin-top:12px;"></div>
  </div>
</section>

<section class="tab-panel" id="v5-cond" role="tabpanel" aria-labelledby="btn-v5-cond" tabindex="0">
  <div class="card">
    <h3>\uD83D\uDCD6 Conditions Reference</h3>
    <p class="muted">Search the rules text for every condition plus both exhaustion tracks.</p>
    <div class="input-row">
      <div class="input-group" style="flex:1;"><label for="v5CondSearch">Search</label><input type="text" id="v5CondSearch" placeholder="e.g. advantage, save, speed"></div>
    </div>
    <div id="v5CondOut" aria-live="polite" style="margin-top:12px;"></div>
  </div>
</section>

<section class="tab-panel" id="v5-cr" role="tabpanel" aria-labelledby="btn-v5-cr" tabindex="0">
  <div class="card">
    <h3>\u2696\uFE0F Challenge Rating Auto-Estimator</h3>
    <p class="muted">Averages defensive and offensive CR the way the DMG monster-creation tables do, then reports XP.</p>
    <div class="input-row">
      <div class="input-group"><label for="v5CrHp">Effective HP</label><input type="number" id="v5CrHp" value="120" min="1"></div>
      <div class="input-group"><label for="v5CrAc">Effective AC</label><input type="number" id="v5CrAc" value="16" min="1"></div>
      <div class="input-group"><label for="v5CrDpr">Damage per round (3-round avg)</label><input type="number" id="v5CrDpr" value="35" min="0"></div>
      <div class="input-group"><label for="v5CrAtk">Attack bonus or save DC</label><input type="number" id="v5CrAtk" value="7"></div>
    </div>
    <div class="input-row">
      <div class="input-group"><label for="v5CrAtkType">That number is a</label>
        <select id="v5CrAtkType"><option value="atk">Attack bonus</option><option value="dc">Save DC</option></select>
      </div>
    </div>
    <div class="btn-row"><button class="primary" id="v5BtnCr">Estimate CR</button></div>
    <div id="v5CrOut" aria-live="polite" style="margin-top:12px;"></div>
  </div>
</section>

<section class="tab-panel" id="v5-rest" role="tabpanel" aria-labelledby="btn-v5-rest" tabindex="0">
  <div class="card">
    <h3>\uD83C\uDFD5\uFE0F Rest & Recovery Manager</h3>
    <p class="muted">Spend hit dice on a short rest or apply a long rest under 2014 or 2024 rules.</p>
    <div class="input-row">
      <div class="input-group"><label for="v5RestClass">Class</label><select id="v5RestClass"></select></div>
      <div class="input-group"><label for="v5RestLevel">Level</label><input type="number" id="v5RestLevel" value="5" min="1" max="20"></div>
      <div class="input-group"><label for="v5RestCon">Con modifier</label><input type="number" id="v5RestCon" value="2"></div>
    </div>
    <div class="input-row">
      <div class="input-group"><label for="v5RestHp">Current HP</label><input type="number" id="v5RestHp" value="20"></div>
      <div class="input-group"><label for="v5RestMax">Max HP</label><input type="number" id="v5RestMax" value="44"></div>
      <div class="input-group"><label for="v5RestAvail">Hit dice available</label><input type="number" id="v5RestAvail" value="5" min="0"></div>
      <div class="input-group"><label for="v5RestSpend">Hit dice to spend</label><input type="number" id="v5RestSpend" value="2" min="0"></div>
    </div>
    <div class="input-row">
      <div class="input-group"><label for="v5RestRules">Ruleset</label><select id="v5RestRules"><option value="2014">2014</option><option value="2024">2024</option></select></div>
      <div class="input-group"><label for="v5RestExh">Exhaustion level</label><input type="number" id="v5RestExh" value="0" min="0" max="6"></div>
    </div>
    <div class="btn-row"><button class="primary" id="v5BtnShort">Short Rest</button> <button id="v5BtnLong">Long Rest</button></div>
    <div id="v5RestOut" aria-live="polite" style="margin-top:12px;"></div>
  </div>
</section>

<section class="tab-panel" id="v5-d20" role="tabpanel" aria-labelledby="btn-v5-d20" tabindex="0">
  <div class="card">
    <h3>\uD83C\uDFAF d20 Probability</h3>
    <p class="muted">Success odds with advantage, disadvantage, elven accuracy, lucky rerolls and crit chance.</p>
    <div class="input-row">
      <div class="input-group"><label for="v5D20Dc">Target number (AC or DC)</label><input type="number" id="v5D20Dc" value="15"></div>
      <div class="input-group"><label for="v5D20Mod">Your modifier</label><input type="number" id="v5D20Mod" value="7"></div>
      <div class="input-group"><label for="v5D20Crit">Crit range (nat X and up)</label><input type="number" id="v5D20Crit" value="20" min="15" max="20"></div>
      <div class="input-group"><label for="v5D20Attack">Treat as</label><select id="v5D20Attack"><option value="1">Attack roll (nat 1 misses, nat 20 hits)</option><option value="0">Ability check or save</option></select></div>
    </div>
    <div class="btn-row"><button class="primary" id="v5BtnD20">Calculate Odds</button></div>
    <div id="v5D20Out" aria-live="polite" style="margin-top:12px;"></div>
  </div>
</section>

<section class="tab-panel" id="v5-npc" role="tabpanel" aria-labelledby="btn-v5-npc" tabindex="0">
  <div class="card">
    <h3>\uD83E\uDDD1 Instant NPC Generator</h3>
    <p class="muted">Name, role, personality and a plot hook for the townsfolk your players just decided to interrogate.</p>
    <div class="input-row">
      <div class="input-group"><label for="v5NpcCount">How many</label><input type="number" id="v5NpcCount" value="3" min="1" max="12"></div>
    </div>
    <div class="btn-row"><button class="primary" id="v5BtnNpc">Generate NPCs</button> <button id="v5BtnNpcCopy">Copy</button></div>
    <div id="v5NpcOut" aria-live="polite" style="margin-top:12px;"></div>
  </div>
</section>`;
  while (holder.firstChild) wrap.appendChild(holder.firstChild);

  wire();
}

function box(html) { return '<div class="result-box">' + html + '</div>'; }
function stats(pairs) {
  return '<div class="stat-grid">' + pairs.map(p =>
    `<div class="stat"><div class="stat-label">${E(p[0])}</div><div class="stat-value">${E(p[1])}</div></div>`).join('') + '</div>';
}
function err(node, msg) { node.innerHTML = `<div class="result-box"><p class="muted">\u26A0 ${E(msg)}</p></div>`; }

function wire() {
  /* ---------- 1. Dice sandbox ---------- */
  const HIST_KEY = 'ddhp_v5_dicehist';
  let hist = [];
  try { const raw = localStorage.getItem(HIST_KEY); if (raw) hist = JSON.parse(raw) || []; } catch (e) { hist = []; }
  function saveHist() { try { localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(0, 25))); } catch (e) {} }
  function renderHist() {
    const n = g('v5DiceHist'); if (!n) return;
    if (!hist.length) { n.innerHTML = ''; return; }
    n.innerHTML = '<table><thead><tr><th>When</th><th>Roll</th><th>Total</th></tr></thead><tbody>' +
      hist.slice(0, 25).map(h => `<tr><td>${E(h.t)}</td><td>${E(h.e)}</td><td><strong>${E(h.v)}</strong></td></tr>`).join('') +
      '</tbody></table>';
  }
  renderHist();

  function rollOne(face, explode, rerollAt) {
    let r = d(face), tries = 0;
    while (rerollAt > 0 && r <= rerollAt && tries < 20) { r = d(face); tries++; }
    let total = r;
    if (explode) { let last = r, chain = 0; while (last === face && chain < 20) { last = d(face); total += last; chain++; } }
    return { total, natural: r };
  }
  const dOut = g('v5DiceOut');
  if (g('v5BtnDice')) g('v5BtnDice').addEventListener('click', () => {
    const p = parse5((g('v5DiceExpr') || {}).value);
    if (!p.ok) return err(dOut, p.error);
    const keepMode = g('v5DiceKeepMode').value;
    const keepN = clamp(Math.round(num('v5DiceKeepN', 1)), 1, 500);
    const explode = g('v5DiceExplode').value === '1';
    const rerollAt = clamp(Math.round(num('v5DiceReroll', 0)), 0, 20);
    const times = clamp(Math.round(num('v5DiceTimes', 1)), 1, 100);
    const results = [];
    for (let t = 0; t < times; t++) {
      let total = p.flat; const detail = [];
      for (const dd of p.dice) {
        let rolls = [];
        for (let i = 0; i < dd.n; i++) rolls.push(rollOne(dd.f, explode, rerollAt));
        let kept = rolls.map(r => r.total);
        let dropped = [];
        if (keepMode !== 'all' && keepN < kept.length) {
          const idx = kept.map((v, i) => [v, i]).sort((a, b) => keepMode === 'high' ? b[0] - a[0] : a[0] - b[0]);
          const keepIdx = new Set(idx.slice(0, keepN).map(x => x[1]));
          dropped = kept.filter((v, i) => !keepIdx.has(i));
          kept = kept.filter((v, i) => keepIdx.has(i));
        }
        const sum = kept.reduce((a, b) => a + b, 0);
        total += dd.sign * sum;
        detail.push(`${dd.sign < 0 ? '\u2212' : ''}${dd.n}d${dd.f} [${kept.join(', ')}]${dropped.length ? ' <span class="muted">dropped ' + dropped.join(', ') + '</span>' : ''} = ${dd.sign * sum}`);
      }
      if (p.flat) detail.push(`${sgn(p.flat)} flat`);
      results.push({ total, detail });
    }
    const label = (g('v5DiceExpr').value || '').trim() + (keepMode !== 'all' ? ` k${keepMode === 'high' ? 'h' : 'l'}${keepN}` : '') + (explode ? ' exploding' : '');
    const totals = results.map(r => r.total);
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    dOut.innerHTML = box(
      stats([['Total', times === 1 ? String(totals[0]) : totals.join(', ')], ['Average', mean.toFixed(2)], ['Lowest', String(Math.min.apply(null, totals))], ['Highest', String(Math.max.apply(null, totals))]]) +
      results.map((r, i) => `<p class="muted">${times > 1 ? 'Roll ' + (i + 1) + ': ' : ''}${r.detail.join(' &nbsp; ')} <strong>= ${r.total}</strong></p>`).join('')
    );
    hist.unshift({ t: new Date().toLocaleTimeString(), e: label, v: totals.join(', ') });
    hist = hist.slice(0, 25); saveHist(); renderHist();
  });
  if (g('v5BtnDiceClear')) g('v5BtnDiceClear').addEventListener('click', () => { hist = []; saveHist(); renderHist(); });

  /* ---------- 2. Damage vs target ---------- */
  const dmgOut = g('v5DmgOut');
  if (g('v5BtnDmgReset')) g('v5BtnDmgReset').addEventListener('click', () => {
    g('v5DmgHp').value = String(Math.round(num('v5DmgMax', 0)));
    g('v5DmgTemp').value = '0';
    dmgOut.innerHTML = '';
  });
  if (g('v5BtnDmg')) g('v5BtnDmg').addEventListener('click', () => {
    const p = parse5((g('v5DmgExpr') || {}).value);
    if (!p.ok) return err(dmgOut, p.error);
    const crit = g('v5DmgCrit').value === '1';
    const eff = crit ? { flat: p.flat, dice: p.dice.map(x => ({ n: x.n * 2, f: x.f, sign: x.sign })) } : p;
    let raw;
    if (g('v5DmgMode').value === 'avg') raw = Math.floor(avg5(eff));
    else { raw = eff.flat; for (const dd of eff.dice) for (let i = 0; i < dd.n; i++) raw += dd.sign * d(dd.f); }
    raw = Math.max(0, raw);
    const mit = parseFloat(g('v5DmgMit').value);
    const applied = Math.floor(raw * mit);
    let temp = Math.max(0, Math.round(num('v5DmgTemp', 0)));
    let hp = Math.round(num('v5DmgHp', 0));
    const maxHp = Math.round(num('v5DmgMax', 0));
    const absorbed = Math.min(temp, applied);
    temp -= absorbed;
    const toHp = applied - absorbed;
    const newHp = hp - toHp;
    g('v5DmgHp').value = String(Math.max(-999, newHp));
    g('v5DmgTemp').value = String(temp);
    const concDC = Math.max(10, Math.floor(toHp / 2));
    const instantDeath = newHp <= -maxHp;
    let state = 'Still standing';
    if (instantDeath) state = 'Dead \u2014 damage exceeded max HP below 0';
    else if (newHp <= 0) state = 'Unconscious \u2014 making death saves';
    else if (maxHp > 0 && newHp <= maxHp / 2) state = 'Bloodied \u2014 at or below half HP';
    dmgOut.innerHTML = box(
      stats([['Rolled', String(raw)], ['After mitigation', String(applied)], ['Absorbed by temp HP', String(absorbed)], ['New HP', Math.max(newHp, 0) + ' / ' + maxHp]]) +
      `<p class="muted">${E(state)}. Temp HP remaining: ${temp}.` +
      (g('v5DmgConc').value === '1' && toHp > 0 ? ` Concentration save: <strong>DC ${concDC}</strong> Constitution.` : '') +
      (crit ? ' Critical hit: damage dice doubled.' : '') + '</p>'
    );
  });

  /* ---------- 3. Ability scores ---------- */
  const PB_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
  const abilOut = g('v5AbilOut');
  if (g('v5BtnAbil')) g('v5BtnAbil').addEventListener('click', () => {
    const method = g('v5AbilMethod').value;
    const sets = clamp(Math.round(num('v5AbilSets', 1)), 1, 10);
    if (method === 'array') {
      const arr = [15, 14, 13, 12, 10, 8];
      abilOut.innerHTML = box('<p class="muted">Standard array \u2014 assign as you like.</p>' +
        stats(arr.map(v => [String(v), sgn(mod(v))])));
      return;
    }
    if (method === 'pb') {
      abilOut.innerHTML = box('<p class="muted">Point buy: 27 points, scores 8\u201315 before racial bonuses.</p>' +
        '<table><thead><tr><th>Score</th><th>Modifier</th><th>Point cost</th></tr></thead><tbody>' +
        Object.keys(PB_COST).map(s => `<tr><td>${E(s)}</td><td>${sgn(mod(+s))}</td><td>${PB_COST[s]}</td></tr>`).join('') +
        '</tbody></table><p class="muted">A common spread is 15, 15, 15, 8, 8, 8 (27 points) or 15, 14, 13, 12, 10, 8 (27 points).</p>');
      return;
    }
    const out = [];
    for (let s = 0; s < sets; s++) {
      const scores = [];
      for (let i = 0; i < 6; i++) {
        if (method === '3d6') scores.push(d(6) + d(6) + d(6));
        else {
          const r = [d(6), d(6), d(6), d(6)].sort((a, b) => b - a);
          scores.push(r[0] + r[1] + r[2]);
        }
      }
      scores.sort((a, b) => b - a);
      out.push(scores);
    }
    abilOut.innerHTML = box(out.map((sc, i) => {
      const total = sc.reduce((a, b) => a + b, 0);
      const modTotal = sc.reduce((a, b) => a + mod(b), 0);
      return `<p><strong>Set ${i + 1}</strong> \u2014 total ${total}, modifier total ${sgn(modTotal)}</p>` +
        stats(sc.map(v => [String(v), sgn(mod(v))]));
    }).join(''));
  });

  /* ---------- 4. Spell DC ---------- */
  function profFor(level) { return level <= 0 ? 2 : Math.max(2, Math.ceil(level / 4) + 1); }
  const spOut = g('v5SpellOut');
  if (g('v5BtnSpell')) g('v5BtnSpell').addEventListener('click', () => {
    const score = clamp(Math.round(num('v5SpAbil', 10)), 1, 30);
    const lvl = clamp(Math.round(num('v5SpLevel', 1)), 0, 30);
    const misc = Math.round(num('v5SpMisc', 0));
    const prof = profFor(lvl);
    const m = mod(score);
    const dc = 8 + prof + m + misc;
    const atk = prof + m + misc;
    const ac = Math.round(num('v5SpTargetAc', 10));
    const saveMod = Math.round(num('v5SpSaveMod', 0));
    const needHit = clamp(ac - atk, 2, 20);
    const hitPct = ((21 - needHit) / 20) * 100;
    const needSave = clamp(dc - saveMod, 2, 20);
    const savePct = ((21 - needSave) / 20) * 100;
    spOut.innerHTML = box(
      stats([['Save DC', String(dc)], ['Spell attack', sgn(atk)], ['Proficiency', sgn(prof)], ['Ability modifier', sgn(m)]]) +
      `<p class="muted">Against AC ${E(ac)} you hit on ${needHit}+ (${hitPct.toFixed(0)}%). A target with ${sgn(saveMod)} to the save succeeds on ${needSave}+ (${savePct.toFixed(0)}%), so your spell lands fully ${(100 - savePct).toFixed(0)}% of the time.</p>` +
      `<p class="muted">Concentration save DC is always the greater of 10 and half the damage taken.</p>`
    );
  });

  /* ---------- 5. Conditions ---------- */
  const condOut = g('v5CondOut');
  function renderCond() {
    const q = ((g('v5CondSearch') || {}).value || '').trim().toLowerCase();
    const rows = CONDITIONS.filter(c => !q || c[0].toLowerCase().includes(q) || c[1].toLowerCase().includes(q));
    condOut.innerHTML = rows.length
      ? '<table><thead><tr><th style="width:22%">Condition</th><th>Effect</th></tr></thead><tbody>' +
        rows.map(c => `<tr><td><strong>${E(c[0])}</strong></td><td>${E(c[1])}</td></tr>`).join('') + '</tbody></table>'
      : '<p class="muted">No condition matches that search.</p>';
  }
  if (g('v5CondSearch')) g('v5CondSearch').addEventListener('input', renderCond);
  renderCond();

  /* ---------- 6. CR estimator ---------- */
  function defCr(hp) { for (const row of DEF_CR) if (hp <= row[0]) return row; return DEF_CR[DEF_CR.length - 1]; }
  function offCr(dpr) { for (const row of OFF_CR) if (dpr <= row[0]) return row; return OFF_CR[OFF_CR.length - 1]; }
  const crOut = g('v5CrOut');
  if (g('v5BtnCr')) g('v5BtnCr').addEventListener('click', () => {
    const hp = Math.max(1, Math.round(num('v5CrHp', 1)));
    const ac = Math.max(1, Math.round(num('v5CrAc', 10)));
    const dpr = Math.max(0, Math.round(num('v5CrDpr', 0)));
    const atk = Math.round(num('v5CrAtk', 0));
    const isDc = g('v5CrAtkType').value === 'dc';
    const dRow = defCr(hp), oRow = offCr(dpr);
    let dIdx = CR_ORDER.indexOf(dRow[1]);
    let oIdx = CR_ORDER.indexOf(oRow[1]);
    const acDelta = Math.round((ac - dRow[2]) / 2);
    const offBase = isDc ? oRow[2] : oRow[3];
    const atkDelta = Math.round((atk - offBase) / 2);
    dIdx = clamp(dIdx + acDelta, 0, CR_ORDER.length - 1);
    oIdx = clamp(oIdx + atkDelta, 0, CR_ORDER.length - 1);
    const finalIdx = clamp(Math.round((dIdx + oIdx) / 2), 0, CR_ORDER.length - 1);
    const cr = CR_ORDER[finalIdx];
    crOut.innerHTML = box(
      stats([['Final CR', cr], ['XP', (CR_XP[cr] || 0).toLocaleString()], ['Defensive CR', CR_ORDER[dIdx]], ['Offensive CR', CR_ORDER[oIdx]]]) +
      `<p class="muted">Expected AC at defensive CR ${E(dRow[1])} is ${dRow[2]}; you have ${ac} (${sgn(acDelta)} CR step${Math.abs(acDelta) === 1 ? '' : 's'}). ` +
      `Expected ${isDc ? 'save DC' : 'attack bonus'} at offensive CR ${E(oRow[1])} is ${offBase}; you have ${atk} (${sgn(atkDelta)} step${Math.abs(atkDelta) === 1 ? '' : 's'}).</p>` +
      `<p class="muted">Feed effective HP from the Effective HP tab here if the creature has resistances or legendary resistances.</p>`
    );
  });

  /* ---------- 7. Rest & recovery ---------- */
  const restSel = g('v5RestClass');
  if (restSel && !restSel.options.length) {
    Object.keys(HIT_DICE).sort().forEach(c => {
      const o = document.createElement('option'); o.value = c; o.textContent = c + ' (d' + HIT_DICE[c] + ')'; restSel.appendChild(o);
    });
    restSel.value = 'Fighter';
  }
  const restOut = g('v5RestOut');
  function restCommon() {
    return {
      die: HIT_DICE[(restSel || {}).value] || 8,
      level: clamp(Math.round(num('v5RestLevel', 1)), 1, 20),
      con: Math.round(num('v5RestCon', 0)),
      hp: Math.round(num('v5RestHp', 0)),
      max: Math.max(1, Math.round(num('v5RestMax', 1))),
      avail: Math.max(0, Math.round(num('v5RestAvail', 0))),
      spend: Math.max(0, Math.round(num('v5RestSpend', 0))),
      rules: (g('v5RestRules') || {}).value || '2014',
      exh: clamp(Math.round(num('v5RestExh', 0)), 0, 6)
    };
  }
  if (g('v5BtnShort')) g('v5BtnShort').addEventListener('click', () => {
    const s = restCommon();
    const spend = Math.min(s.spend, s.avail);
    if (spend <= 0) return err(restOut, 'Set how many hit dice to spend (and make sure you have some available).');
    let healed = 0; const rolls = [];
    for (let i = 0; i < spend; i++) { const r = d(s.die); rolls.push(r); healed += Math.max(0, r + s.con); }
    const newHp = Math.min(s.max, s.hp + healed);
    g('v5RestHp').value = String(newHp);
    g('v5RestAvail').value = String(s.avail - spend);
    restOut.innerHTML = box(
      stats([['Healed', String(newHp - s.hp)], ['New HP', newHp + ' / ' + s.max], ['Dice spent', String(spend)], ['Dice left', String(s.avail - spend)]]) +
      `<p class="muted">Rolled ${rolls.map(r => 'd' + s.die + '=' + r).join(', ')}, each plus Con ${sgn(s.con)}.` +
      (s.rules === '2024' ? ' 2024: a short rest is 1 hour and you may also regain expended uses of short-rest features.' : ' 2014: a short rest is at least 1 hour.') + '</p>'
    );
  });
  if (g('v5BtnLong')) g('v5BtnLong').addEventListener('click', () => {
    const s = restCommon();
    const regain = s.rules === '2024' ? s.level : Math.max(1, Math.floor(s.level / 2));
    const totalDice = s.level;
    const newAvail = Math.min(totalDice, s.avail + regain);
    g('v5RestHp').value = String(s.max);
    g('v5RestAvail').value = String(newAvail);
    const newExh = Math.max(0, s.exh - 1);
    if (g('v5RestExh')) g('v5RestExh').value = String(newExh);
    restOut.innerHTML = box(
      stats([['HP', s.max + ' / ' + s.max], ['Hit dice regained', String(regain)], ['Hit dice now', newAvail + ' / ' + totalDice], ['Exhaustion', String(newExh)]]) +
      `<p class="muted">${s.rules === '2024'
        ? '2024 rules: a long rest restores all hit points and all spent hit dice, and removes one level of exhaustion.'
        : '2014 rules: a long rest restores all hit points and up to half your total hit dice (minimum 1), and removes one level of exhaustion.'}</p>`
    );
  });

  /* ---------- 8. d20 odds ---------- */
  const d20Out = g('v5D20Out');
  if (g('v5BtnD20')) g('v5BtnD20').addEventListener('click', () => {
    const dc = Math.round(num('v5D20Dc', 10));
    const m = Math.round(num('v5D20Mod', 0));
    const critAt = clamp(Math.round(num('v5D20Crit', 20)), 15, 20);
    const isAttack = g('v5D20Attack').value === '1';
    let need = dc - m;
    if (isAttack) need = clamp(need, 2, 20); else need = clamp(need, 1, 21);
    const pSingle = need > 20 ? 0 : Math.max(0, (21 - Math.max(need, 1)) / 20);
    const p = isAttack ? Math.min(pSingle, 19 / 20) : pSingle;
    const pAdv = 1 - Math.pow(1 - p, 2);
    const pDis = Math.pow(p, 2);
    const pElven = 1 - Math.pow(1 - p, 3);
    const pLucky = p + (1 - p) * (1 / 20) * p * 20 / 20;
    const crit = (21 - critAt) / 20;
    d20Out.innerHTML = box(
      stats([['Normal', (p * 100).toFixed(1) + '%'], ['Advantage', (pAdv * 100).toFixed(1) + '%'], ['Disadvantage', (pDis * 100).toFixed(1) + '%'], ['Elven Accuracy', (pElven * 100).toFixed(1) + '%']]) +
      stats([['Need on d20', (need > 20 ? 'Impossible' : Math.max(need, 1) + '+')], ['Crit chance', (crit * 100).toFixed(1) + '%'], ['Crit with advantage', ((1 - Math.pow(1 - crit, 2)) * 100).toFixed(1) + '%'], ['Advantage gain', ((pAdv - p) * 100).toFixed(1) + ' pts']]) +
      `<p class="muted">${isAttack ? 'Attack roll: a natural 1 always misses and a natural 20 always hits.' : 'Ability check or saving throw: no automatic success or failure on the die.'} Lucky-style rerolls of a miss land roughly ${((pLucky) * 100).toFixed(1)}%.</p>`
    );
  });

  /* ---------- 9. NPC generator ---------- */
  const npcOut = g('v5NpcOut');
  let lastNpcText = '';
  if (g('v5BtnNpc')) g('v5BtnNpc').addEventListener('click', () => {
    const n = clamp(Math.round(num('v5NpcCount', 1)), 1, 12);
    const list = [];
    for (let i = 0; i < n; i++) {
      list.push({
        name: pick(NPC.first) + ' ' + pick(NPC.last),
        race: pick(NPC.race), role: pick(NPC.role),
        trait: pick(NPC.trait), ideal: pick(NPC.ideal),
        bond: pick(NPC.bond), flaw: pick(NPC.flaw), hook: pick(NPC.hook)
      });
    }
    lastNpcText = list.map(p => `${p.name} — ${p.race} ${p.role}\n  Trait: ${p.trait}\n  Ideal: ${p.ideal}\n  Bond: ${p.bond}\n  Flaw: ${p.flaw}\n  Hook: ${p.hook}`).join('\n\n');
    npcOut.innerHTML = box(list.map(p => `
      <p><strong>${E(p.name)}</strong> \u2014 ${E(p.race)} ${E(p.role)}<br>
      <span class="muted">Trait:</span> ${E(p.trait)}<br>
      <span class="muted">Ideal:</span> ${E(p.ideal)}<br>
      <span class="muted">Bond:</span> ${E(p.bond)}<br>
      <span class="muted">Flaw:</span> ${E(p.flaw)}<br>
      <span class="muted">Hook:</span> ${E(p.hook)}</p>`).join('<hr>'));
  });
  if (g('v5BtnNpcCopy')) g('v5BtnNpcCopy').addEventListener('click', () => {
    if (!lastNpcText) return;
    try { navigator.clipboard.writeText(lastNpcText); } catch (e) {}
    const b = g('v5BtnNpcCopy'); const old = b.textContent; b.textContent = 'Copied!';
    setTimeout(() => { b.textContent = old; }, 1200);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
else build();
})();

/* ================= v6 ADDITIVE MODULE: VTT Export, Print Sheet, Bestiary, Settings ================= */
(function(){
'use strict';

/* rounding preference must be live before the first calculation */
try {
  var _r = localStorage.getItem('ddhp_rounding');
  window.__ddhpRounding = (_r === 'floor') ? 'floor' : 'round';
} catch (e) { window.__ddhpRounding = 'round'; }

const el = id => document.getElementById(id);
const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mod = n => Math.floor((n - 10) / 2);
const sgn = n => (n >= 0 ? '+' : '') + n;
const val = (id, d) => { const e = el(id); return e && e.value !== '' ? e.value : d; };
const iv = (id, d) => { const n = parseInt(val(id, d), 10); return isNaN(n) ? d : n; };

/* ---------------- SRD Bestiary ---------------- */
/* name, size/type, CR, AC, hit dice, speed, STR DEX CON INT WIS CHA */
const BEAST = [
['Bandit','Medium humanoid','1/8',12,'2d8',"30 ft.",11,12,12,10,10,10],
['Bandit Captain','Medium humanoid','2',15,'10d8+10',"30 ft.",15,16,14,14,11,14],
['Guard','Medium humanoid','1/8',16,'2d8+2',"30 ft.",13,12,12,10,11,10],
['Thug','Medium humanoid','1/2',11,'5d8+10',"30 ft.",15,11,14,10,10,11],
['Veteran','Medium humanoid','3',17,'11d8+11',"30 ft.",16,13,14,10,11,10],
['Knight','Medium humanoid','3',18,'8d8+16',"30 ft.",16,11,14,11,11,15],
['Spy','Medium humanoid','1',12,'6d8',"30 ft.",10,15,10,12,14,16],
['Assassin','Medium humanoid','8',15,'12d8+12',"30 ft.",11,16,14,13,11,10],
['Cultist','Medium humanoid','1/8',12,'2d8',"30 ft.",11,12,10,10,11,10],
['Cult Fanatic','Medium humanoid','2',13,'6d8',"30 ft.",11,14,12,10,13,14],
['Druid','Medium humanoid','2',11,'5d8',"30 ft.",10,12,13,12,15,11],
['Mage','Medium humanoid','6',12,'9d8',"30 ft.",9,14,11,17,12,11],
['Priest','Medium humanoid','2',13,'5d8',"25 ft.",10,10,12,13,16,13],
['Goblin','Small humanoid','1/4',15,'2d6',"30 ft.",8,14,10,10,8,8],
['Hobgoblin','Medium humanoid','1/2',18,'2d8+2',"30 ft.",13,12,12,10,10,9],
['Bugbear','Medium humanoid','1',16,'5d8+5',"30 ft.",15,14,13,8,11,9],
['Orc','Medium humanoid','1/2',13,'2d8+6',"30 ft.",16,12,16,7,11,10],
['Kobold','Small humanoid','1/8',12,'2d6',"30 ft.",7,15,9,8,7,8],
['Gnoll','Medium humanoid','1/2',15,'5d8',"30 ft.",14,12,11,6,10,7],
['Lizardfolk','Medium humanoid','1/2',15,'4d8+4',"30 ft., swim 30 ft.",15,10,13,7,12,7],
['Drow','Medium humanoid','1/4',15,'3d8',"30 ft.",10,14,10,11,11,12],
['Duergar','Medium humanoid','1',16,'5d8+5',"25 ft.",14,11,14,11,10,9],
['Skeleton','Medium undead','1/4',13,'2d8+4',"30 ft.",10,14,15,6,8,5],
['Zombie','Medium undead','1/4',8,'3d8+9',"20 ft.",13,6,16,3,6,5],
['Ghoul','Medium undead','1',12,'5d8',"30 ft.",13,15,10,7,10,6],
['Wight','Medium undead','3',14,'6d8+18',"30 ft.",15,14,16,10,13,15],
['Specter','Medium undead','1',12,'5d8',"fly 50 ft.",1,14,11,10,10,11],
['Wraith','Medium undead','5',13,'9d8+27',"fly 60 ft.",6,16,16,12,14,15],
['Vampire Spawn','Medium undead','5',15,'11d8+33',"30 ft.",16,16,16,11,10,12],
['Mummy','Medium undead','3',11,'8d8+24',"20 ft.",16,8,15,6,10,12],
['Lich','Medium undead','21',17,'18d8+54',"30 ft.",11,16,16,20,14,16],
['Wolf','Medium beast','1/4',13,'2d8+2',"40 ft.",12,15,12,3,12,6],
['Dire Wolf','Large beast','1',14,'5d10+10',"50 ft.",17,15,15,3,12,7],
['Brown Bear','Large beast','1',11,'4d10+12',"40 ft., climb 30 ft.",19,10,16,2,13,7],
['Giant Spider','Large beast','1',14,'4d10+4',"30 ft., climb 30 ft.",14,16,12,2,11,4],
['Giant Eagle','Large beast','1',13,'4d10+4',"10 ft., fly 80 ft.",16,17,13,8,14,10],
['Crocodile','Large beast','1/2',12,'3d10+3',"20 ft., swim 30 ft.",15,10,13,2,10,5],
['Owlbear','Large monstrosity','3',13,'7d10+21',"40 ft.",20,12,17,3,12,7],
['Ogre','Large giant','2',11,'7d10+21',"40 ft.",19,8,16,5,7,7],
['Hill Giant','Huge giant','5',13,'10d12+40',"40 ft.",21,8,19,5,9,6],
['Stone Giant','Huge giant','7',17,'11d12+44',"40 ft.",23,15,20,10,12,9],
['Frost Giant','Huge giant','8',15,'12d12+60',"40 ft.",23,9,21,9,10,12],
['Fire Giant','Huge giant','9',18,'13d12+65',"30 ft.",25,9,23,10,14,13],
['Troll','Large giant','5',15,'8d10+40',"30 ft.",18,13,20,7,9,7],
['Harpy','Medium monstrosity','1',11,'7d8+7',"20 ft., fly 40 ft.",12,13,12,7,10,13],
['Manticore','Large monstrosity','3',14,'11d10+8',"30 ft., fly 50 ft.",17,16,17,7,12,8],
['Wyvern','Large dragon','6',13,'13d10+39',"20 ft., fly 80 ft.",19,10,16,5,12,6],
['Basilisk','Medium monstrosity','3',15,'8d8+16',"20 ft.",16,8,15,2,8,7],
['Chimera','Large monstrosity','6',14,'12d10+48',"30 ft., fly 60 ft.",19,11,19,3,14,10],
['Hydra','Huge monstrosity','8',15,'15d12+75',"30 ft., swim 30 ft.",20,12,20,2,10,7],
['Mimic','Medium monstrosity','2',12,'9d8+18',"15 ft.",17,12,15,5,13,8],
['Gelatinous Cube','Large ooze','2',6,'8d10+40',"15 ft.",14,3,20,1,6,1],
['Rust Monster','Medium monstrosity','1/2',14,'5d8+5',"40 ft.",13,12,13,2,13,6],
['Umber Hulk','Large monstrosity','5',18,'11d10+33',"30 ft., burrow 20 ft.",20,13,16,9,10,10],
['Roper','Large monstrosity','5',20,'11d10+33',"10 ft., climb 10 ft.",18,8,17,7,16,6],
['Mind Flayer','Medium aberration','7',15,'13d8+13',"30 ft.",11,12,12,19,17,17],
['Beholder','Large aberration','13',18,'19d10+76',"0 ft., fly 20 ft.",10,14,18,17,15,17],
['Doppelganger','Medium monstrosity','3',14,'8d8+8',"30 ft.",11,18,14,11,12,14],
['Water Elemental','Large elemental','5',14,'12d10+48',"30 ft., swim 90 ft.",18,14,18,5,10,8],
['Fire Elemental','Large elemental','5',13,'12d10+48',"50 ft.",10,17,16,6,10,7],
['Air Elemental','Large elemental','5',15,'12d10+48',"fly 90 ft.",14,20,14,6,10,6],
['Earth Elemental','Large elemental','5',17,'12d10+60',"30 ft., burrow 30 ft.",20,8,20,5,10,5],
['Green Hag','Medium fey','3',17,'11d8+33',"30 ft.",18,12,16,13,14,14],
['Sea Hag','Medium fey','2',14,'6d8+12',"30 ft., swim 40 ft.",16,13,16,12,12,13],
['Ettercap','Medium monstrosity','2',13,'6d8+18',"30 ft., climb 30 ft.",14,15,13,7,12,8],
['Shambling Mound','Large plant','5',15,'16d10+48',"20 ft., swim 20 ft.",18,8,16,5,10,5],
['Will-o-Wisp','Tiny undead','2',19,'9d4',"fly 50 ft.",1,28,10,13,14,11],
['Griffon','Large monstrosity','2',12,'7d10+21',"30 ft., fly 80 ft.",18,15,16,2,13,8],
['Roc','Gargantuan monstrosity','11',15,'17d20+68',"20 ft., fly 120 ft.",28,10,20,3,10,9],
['Werewolf','Medium humanoid','3',12,'9d8+18',"30 ft.",15,13,14,10,11,10],
['Wererat','Medium humanoid','2',12,'6d8+6',"30 ft.",10,15,12,11,10,8],
['Black Dragon Wyrmling','Medium dragon','2',17,'6d8+12',"30 ft., fly 60 ft.",15,14,15,10,11,13],
['Young Red Dragon','Large dragon','10',18,'17d10+85',"40 ft., fly 80 ft.",23,10,21,14,11,19],
['Adult Red Dragon','Huge dragon','17',19,'19d12+133',"40 ft., fly 80 ft.",27,10,25,16,13,21],
['Ancient Red Dragon','Gargantuan dragon','24',22,'28d20+252',"40 ft., fly 80 ft.",30,10,29,18,15,23],
['Young White Dragon','Large dragon','6',17,'15d10+60',"30 ft., fly 80 ft.",18,10,18,6,11,12],
['Young Blue Dragon','Large dragon','9',18,'17d10+85',"40 ft., fly 80 ft.",21,10,21,14,13,17],
['Young Green Dragon','Large dragon','8',18,'16d10+64',"40 ft., fly 80 ft.",19,12,19,16,13,15],
['Awakened Tree','Huge plant','2',13,'7d12+14',"20 ft.",19,6,15,10,10,7],
['Treant','Huge plant','9',16,'20d12+80',"30 ft.",23,8,21,12,16,12],
['Ankheg','Large monstrosity','2',14,'6d10+6',"30 ft., burrow 10 ft.",17,11,13,1,13,6],
['Bulette','Large monstrosity','5',17,'9d10+45',"40 ft., burrow 40 ft.",19,11,21,2,10,5],
['Cloaker','Large aberration','8',14,'11d10+22',"10 ft., fly 40 ft.",17,15,12,13,12,14],
['Sahuagin','Medium humanoid','1/2',12,'4d8+4',"30 ft., swim 40 ft.",13,11,12,12,13,9],
['Merrow','Large monstrosity','2',13,'6d10+12',"10 ft., swim 40 ft.",18,10,15,8,10,9],
['Quaggoth','Medium humanoid','2',13,'6d8+18',"30 ft., climb 30 ft.",17,12,16,6,12,7],
['Hook Horror','Large monstrosity','3',15,'10d10+20',"30 ft., climb 30 ft.",18,10,15,6,12,7],
['Grick','Medium monstrosity','2',14,'5d8+5',"30 ft., climb 30 ft.",14,14,11,3,14,5]
];

function crToXP(cr){
  const t={'0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700,'4':1100,'5':1800,'6':2300,'7':2900,'8':3900,'9':5000,'10':5900,'11':7200,'12':8400,'13':10000,'14':11500,'15':13000,'16':15000,'17':18000,'18':20000,'19':22000,'20':25000,'21':33000,'22':41000,'23':50000,'24':62000,'25':75000,'30':155000};
  return t[cr]||0;
}
function crNum(cr){ if(cr==='1/8')return .125; if(cr==='1/4')return .25; if(cr==='1/2')return .5; return parseFloat(cr)||0; }
function avgHD(hd){
  let total=0; const re=/([+-]?)(\d*)d(\d+)|([+-]\d+)(?!d)/g; let m;
  while((m=re.exec(hd))){
    if(m[3]){ const s=m[1]==='-'?-1:1; const c=parseInt(m[2]||'1',10); const d=parseInt(m[3],10); total+=s*c*(d+1)/2; }
    else if(m[4]){ total+=parseInt(m[4],10); }
  }
  return (window.__ddhpRounding==='floor'?Math.floor:Math.round)(total);
}

/* ---------------- current statblock snapshot ---------------- */
function snapshot(){
  const hd = (val('hdExpression','') || '').trim();
  const hp = (val('sbHP','') || '').trim() || (hd ? avgHD(hd) + ' (' + hd + ')' : '1');
  return {
    name: val('sbName','Custom Monster'), sizeType: val('sbSizeType','Medium humanoid'),
    align: val('sbAlign','neutral'), ac: iv('sbAC',15), speed: val('sbSpeed','30 ft.'),
    hd, hp, hpAvg: hd ? avgHD(hd) : (parseInt(hp,10) || 1),
    str: iv('sbSTR',10), dex: iv('sbDEX',10), con: iv('sbCON',10),
    int: iv('sbINT',10), wis: iv('sbWIS',10), cha: iv('sbCHA',10),
    cr: val('v6ExpCR','1')
  };
}

/* ---------------- Foundry VTT (dnd5e) actor JSON ---------------- */
function foundryJSON(s){
  const size = (s.sizeType.split(/\s+/)[0]||'Medium').toLowerCase();
  const sizeKey = {tiny:'tiny',small:'sm',medium:'med',large:'lg',huge:'huge',gargantuan:'grg'}[size]||'med';
  const type = (s.sizeType.split(/\s+/).slice(1).join(' ')||'humanoid').toLowerCase();
  const m = /(\d+)d(\d+)/.exec(s.hd||'');
  const abil = k => ({ value: s[k], proficient: 0, bonuses:{check:'',save:''} });
  return {
    name: s.name, type: 'npc', img: 'icons/svg/mystery-man.svg',
    system: {
      abilities: { str: abil('str'), dex: abil('dex'), con: abil('con'), int: abil('int'), wis: abil('wis'), cha: abil('cha') },
      attributes: {
        ac: { flat: s.ac, calc: 'flat', formula: '' },
        hp: { value: s.hpAvg, max: s.hpAvg, temp: 0, tempmax: 0, formula: s.hd || '' },
        init: { ability: 'dex', bonus: '' },
        movement: { walk: parseInt(s.speed,10)||30, units: 'ft' },
        prof: Math.max(2, Math.floor((crNum(s.cr)-1)/4)+2)
      },
      details: {
        cr: crNum(s.cr), xp: { value: crToXP(s.cr) },
        alignment: s.align, type: { value: type, subtype: '', custom: '' },
        source: 'D&D HP Forge', biography: { value: '', public: '' }
      },
      traits: { size: sizeKey, di:{value:[]}, dr:{value:[]}, dv:{value:[]}, ci:{value:[]} },
      currency: { pp:0, gp:0, ep:0, sp:0, cp:0 }
    },
    items: [], effects: [], flags: { 'ddhp-forge': { hitDice: s.hd, generated: new Date().toISOString() } }
  };
}

/* ---------------- Roll20 export ---------------- */
function roll20JSON(s){
  const pb = Math.max(2, Math.floor((crNum(s.cr)-1)/4)+2);
  return {
    name: s.name,
    npc: 1, npc_type: s.sizeType + ', ' + s.align,
    ac: s.ac, ac_note: '', hp: s.hpAvg, hpformula: s.hd,
    speed: s.speed, npc_challenge: s.cr, npc_xp: crToXP(s.cr),
    strength: s.str, dexterity: s.dex, constitution: s.con,
    intelligence: s.int, wisdom: s.wis, charisma: s.cha,
    strength_mod: mod(s.str), dexterity_mod: mod(s.dex), constitution_mod: mod(s.con),
    intelligence_mod: mod(s.int), wisdom_mod: mod(s.wis), charisma_mod: mod(s.cha),
    pb: pb, passive_wisdom: 10 + mod(s.wis), initiative_bonus: mod(s.dex)
  };
}
function roll20Text(s){
  return [
    s.name, s.sizeType + ', ' + s.align,
    'Armor Class ' + s.ac,
    'Hit Points ' + s.hpAvg + ' (' + s.hd + ')',
    'Speed ' + s.speed,
    'STR ' + s.str + ' (' + sgn(mod(s.str)) + ') DEX ' + s.dex + ' (' + sgn(mod(s.dex)) + ') CON ' + s.con + ' (' + sgn(mod(s.con)) + ') INT ' + s.int + ' (' + sgn(mod(s.int)) + ') WIS ' + s.wis + ' (' + sgn(mod(s.wis)) + ') CHA ' + s.cha + ' (' + sgn(mod(s.cha)) + ')',
    'Challenge ' + s.cr + ' (' + crToXP(s.cr).toLocaleString() + ' XP)'
  ].join('\n');
}

function download(filename, text, mime){
  const blob = new Blob([text], { type: mime || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}
function copy(text, btn){
  try { navigator.clipboard.writeText(text); } catch (e) {}
  if (btn) { const o = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = o; }, 1200); }
}

/* ---------------- Print sheet ---------------- */
function printSheet(s){
  const row = (l, v) => '<div class="l"><b>' + E(l) + '</b> ' + E(v) + '</div>';
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + E(s.name) + '</title><style>'
  + 'body{font-family:Georgia,"Times New Roman",serif;background:#fff;color:#1a1a1a;margin:24px;}'
  + '.sb{border:1px solid #b8a480;border-top:6px solid #7a200d;padding:16px 20px;max-width:420px;background:#fdf6e3;box-shadow:0 1px 4px rgba(0,0,0,.2);}'
  + 'h1{font-variant:small-caps;color:#7a200d;font-size:26px;margin:0;}'
  + '.meta{font-style:italic;margin:2px 0 8px;}'
  + 'hr{border:none;border-bottom:2px solid #7a200d;margin:8px 0;}'
  + '.l{margin:2px 0;}.l b{color:#7a200d;}'
  + 'table{width:100%;text-align:center;border-collapse:collapse;margin:8px 0;}th{color:#7a200d;}'
  + '.foot{margin-top:10px;font-size:12px;color:#555;}'
  + '@media print{body{margin:0}.sb{box-shadow:none}}'
  + '</style></head><body><div class="sb"><h1>' + E(s.name) + '</h1>'
  + '<div class="meta">' + E(s.sizeType) + ', ' + E(s.align) + '</div><hr>'
  + row('Armor Class', s.ac) + row('Hit Points', s.hpAvg + (s.hd ? ' (' + s.hd + ')' : '')) + row('Speed', s.speed)
  + '<hr><table><tr><th>STR</th><th>DEX</th><th>CON</th><th>INT</th><th>WIS</th><th>CHA</th></tr><tr>'
  + ['str','dex','con','int','wis','cha'].map(k => '<td>' + s[k] + ' (' + sgn(mod(s[k])) + ')</td>').join('')
  + '</tr></table><hr>' + row('Challenge', s.cr + ' (' + crToXP(s.cr).toLocaleString() + ' XP)')
  + row('Proficiency Bonus', sgn(Math.max(2, Math.floor((crNum(s.cr)-1)/4)+2)))
  + '<div class="foot">Generated with D&amp;D HP Forge</div></div>'
  + '<script>window.onload=function(){window.print();}<\/script></body></html>';
  const w = window.open('', '_blank');
  if (!w) { alert('Pop-up blocked \u2014 allow pop-ups to print the statblock.'); return; }
  w.document.write(html); w.document.close();
}

/* ---------------- Tabs ---------------- */
const TABS6 = [
  { id: 'v6-bestiary', label: '\uD83D\uDCDA Bestiary' },
  { id: 'v6-export',   label: '\uD83D\uDDA8\uFE0F Export & Print' },
  { id: 'v6-settings', label: '\u2699\uFE0F Settings' }
];
function activate6(tabId){
  document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); b.setAttribute('tabindex','-1'); });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector('[data-tab="' + tabId + '"]');
  const panel = el(tabId);
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected','true'); btn.setAttribute('tabindex','0'); btn.focus(); }
  if (panel) panel.classList.add('active');
}

function build6(){
  const nav = document.querySelector('.tab-nav[role="tablist"]');
  const first = document.querySelector('.tab-panel');
  if (!nav || !first) return;
  const wrap = first.parentNode;

  TABS6.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tab-btn'; b.setAttribute('role','tab'); b.id = 'btn-' + t.id;
    b.setAttribute('aria-controls', t.id); b.setAttribute('aria-selected','false'); b.setAttribute('tabindex','-1');
    b.dataset.tab = t.id; b.textContent = t.label;
    b.addEventListener('click', () => activate6(t.id));
    nav.appendChild(b);
  });

  const panels = document.createElement('div');
  panels.innerHTML = `
<section class="tab-panel" id="v6-bestiary" role="tabpanel" aria-labelledby="btn-v6-bestiary" tabindex="0">
  <div class="card">
    <h3>\uD83D\uDCDA SRD Bestiary Browser</h3>
    <p class="muted">Search ${BEAST.length} SRD creatures. Send hit dice straight to the calculator, or load full stats into the statblock generator.</p>
    <div class="input-row">
      <div class="input-group"><label for="v6BstSearch">Search name or type</label><input type="text" id="v6BstSearch" placeholder="dragon, undead, goblin\u2026"></div>
      <div class="input-group"><label for="v6BstMin">Min CR</label><input type="number" id="v6BstMin" value="0" min="0" max="30" step="0.25"></div>
      <div class="input-group"><label for="v6BstMax">Max CR</label><input type="number" id="v6BstMax" value="30" min="0" max="30" step="0.25"></div>
      <div class="input-group"><label for="v6BstSort">Sort by</label><select id="v6BstSort"><option value="name">Name</option><option value="cr">CR</option><option value="hp">Average HP</option></select></div>
    </div>
    <div id="v6BstOut" aria-live="polite" style="margin-top:12px;max-height:520px;overflow:auto;"></div>
  </div>
</section>

<section class="tab-panel" id="v6-export" role="tabpanel" aria-labelledby="btn-v6-export" tabindex="0">
  <div class="card">
    <h3>\uD83D\uDDA8\uFE0F VTT Export &amp; Print Sheet</h3>
    <p class="muted">Uses the current Statblock tab fields plus the calculator's hit-dice expression.</p>
    <div class="input-row">
      <div class="input-group"><label for="v6ExpCR">Challenge Rating</label>
        <select id="v6ExpCR"><option>0</option><option>1/8</option><option>1/4</option><option>1/2</option><option selected>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option><option>7</option><option>8</option><option>9</option><option>10</option><option>11</option><option>12</option><option>13</option><option>14</option><option>15</option><option>16</option><option>17</option><option>18</option><option>19</option><option>20</option><option>21</option><option>22</option><option>23</option><option>24</option><option>25</option><option>30</option></select>
      </div>
    </div>
    <div class="btn-row">
      <button class="primary" id="v6BtnFoundry">\uD83C\uDFB2 Foundry VTT JSON</button>
      <button id="v6BtnRoll20">\uD83D\uDCDC Roll20 JSON</button>
      <button id="v6BtnRoll20Txt">\uD83D\uDCCB Roll20 Paste Text</button>
      <button id="v6BtnPrint">\uD83D\uDDA8\uFE0F Print Statblock</button>
    </div>
    <div class="btn-row" style="margin-top:8px;">
      <button id="v6BtnDownload">\u2B07\uFE0F Download shown file</button>
      <button id="v6BtnCopyExp">\uD83D\uDCCB Copy shown output</button>
    </div>
    <div id="v6ExpOut" aria-live="polite" style="margin-top:12px;"></div>
    <pre id="v6ExpCode" style="max-height:340px;overflow:auto;white-space:pre-wrap;background:var(--panel,rgba(0,0,0,.06));padding:10px;border-radius:6px;display:none;"></pre>
  </div>
</section>

<section class="tab-panel" id="v6-settings" role="tabpanel" aria-labelledby="btn-v6-settings" tabindex="0">
  <div class="card">
    <h3>\u2699\uFE0F Calculation Settings</h3>
    <div class="input-row">
      <div class="input-group"><label for="v6Rounding">Average HP rounding</label>
        <select id="v6Rounding">
          <option value="round">Round to nearest (5d8 \u2192 23)</option>
          <option value="floor">Floor / Monster Manual style (5d8 \u2192 22)</option>
        </select>
      </div>
    </div>
    <p class="muted">Official statblocks usually drop the fraction. Changing this affects every average-HP calculation immediately.</p>
  </div>
  <div class="card">
    <h3>\uD83D\uDCBE Backup &amp; Restore</h3>
    <p class="muted">Export every saved state, combat tracker session and XP history to one JSON file \u2014 or restore from a backup.</p>
    <div class="btn-row">
      <button class="primary" id="v6BtnBackup">\u2B07\uFE0F Export Backup</button>
      <button id="v6BtnRestore">\u2B06\uFE0F Import Backup</button>
      <input type="file" id="v6File" accept="application/json,.json" style="display:none;">
    </div>
    <div class="input-group" style="margin-top:8px;">
      <label><input type="checkbox" id="v6Merge" checked> Merge with existing saves (uncheck to overwrite)</label>
    </div>
    <div id="v6SetOut" aria-live="polite" style="margin-top:12px;"></div>
  </div>
  <div class="card">
    <h3>\uD83D\uDD01 Auto-save Status</h3>
    <div id="v6AutoOut" class="muted">Checking\u2026</div>
  </div>
</section>`;
  while (panels.firstChild) wrap.appendChild(panels.firstChild);

  /* ----- Bestiary ----- */
  const bstOut = el('v6BstOut');
  function renderBst(){
    const q = (el('v6BstSearch').value || '').toLowerCase().trim();
    const min = parseFloat(el('v6BstMin').value) || 0;
    const max = parseFloat(el('v6BstMax').value); const hi = isNaN(max) ? 30 : max;
    const sort = el('v6BstSort').value;
    let rows = BEAST.map((m,i) => ({ i, name:m[0], type:m[1], cr:m[2], ac:m[3], hd:m[4], speed:m[5],
      str:m[6], dex:m[7], con:m[8], int:m[9], wis:m[10], cha:m[11], hp: avgHD(m[4]) }))
      .filter(r => (!q || r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q)) && crNum(r.cr) >= min && crNum(r.cr) <= hi);
    rows.sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'cr' ? crNum(a.cr) - crNum(b.cr) || a.name.localeCompare(b.name) : b.hp - a.hp);
    if (!rows.length) { bstOut.innerHTML = '<p class="muted">No creatures match that filter.</p>'; return; }
    bstOut.innerHTML = '<table style="width:100%;border-collapse:collapse;">'
      + '<thead><tr><th style="text-align:left;">Name</th><th>CR</th><th>AC</th><th>Hit Dice</th><th>Avg HP</th><th></th></tr></thead><tbody>'
      + rows.map(r => '<tr style="border-bottom:1px solid var(--border);">'
        + '<td style="text-align:left;padding:4px 6px;"><strong>' + E(r.name) + '</strong><br><small class="muted">' + E(r.type) + ' \u2014 ' + E(r.speed) + '</small></td>'
        + '<td>' + E(r.cr) + '</td><td>' + r.ac + '</td><td><code>' + E(r.hd) + '</code></td><td><strong>' + r.hp + '</strong></td>'
        + '<td style="white-space:nowrap;"><button class="small" data-v6use="' + r.i + '">Calculate</button> <button class="small" data-v6load="' + r.i + '">Load</button></td></tr>').join('')
      + '</tbody></table>';
  }
  ['v6BstSearch','v6BstMin','v6BstMax'].forEach(id => el(id).addEventListener('input', renderBst));
  el('v6BstSort').addEventListener('change', renderBst);
  bstOut.addEventListener('click', e => {
    const useBtn = e.target.closest('[data-v6use]');
    const loadBtn = e.target.closest('[data-v6load]');
    const idx = useBtn ? +useBtn.dataset.v6use : loadBtn ? +loadBtn.dataset.v6load : -1;
    if (idx < 0) return;
    const m = BEAST[idx];
    const hdIn = el('hdExpression');
    if (hdIn) { hdIn.value = m[4]; }
    if (loadBtn) {
      const set = (id, v) => { const e2 = el(id); if (e2) e2.value = v; };
      set('sbName', m[0]); set('sbSizeType', m[1]); set('sbAC', m[3]); set('sbSpeed', m[5]);
      set('sbSTR', m[6]); set('sbDEX', m[7]); set('sbCON', m[8]); set('sbINT', m[9]); set('sbWIS', m[10]); set('sbCHA', m[11]);
      set('sbHP', avgHD(m[4]) + ' (' + m[4] + ')');
      const crSel = el('v6ExpCR'); if (crSel) crSel.value = m[2];
      const gen = el('btnGenerateStatblock'); if (gen) gen.click();
      activate6('v6-export');
    } else {
      const calc = el('btnCalculate');
      activate6(__getInitialTab());
      if (calc) calc.click();
    }
  });
  renderBst();

  /* ----- Export ----- */
  let lastText = '', lastFile = 'statblock.json', lastMime = 'application/json';
  const expOut = el('v6ExpOut'), expCode = el('v6ExpCode');
  function show(kind, text, file, mime, note){
    lastText = text; lastFile = file; lastMime = mime || 'application/json';
    expOut.innerHTML = '<div class="result-card"><strong>' + E(kind) + ' ready</strong><br><span class="muted">' + E(note) + '</span></div>';
    expCode.style.display = 'block';
    expCode.textContent = text;
  }
  el('v6BtnFoundry').addEventListener('click', () => {
    const s = snapshot();
    show('Foundry VTT actor', JSON.stringify(foundryJSON(s), null, 2),
      s.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase() + '-foundry.json', 'application/json',
      'In Foundry: Actors sidebar \u2192 right-click folder \u2192 Import Data \u2192 choose this file (dnd5e system).');
  });
  el('v6BtnRoll20').addEventListener('click', () => {
    const s = snapshot();
    show('Roll20 NPC data', JSON.stringify(roll20JSON(s), null, 2),
      s.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase() + '-roll20.json', 'application/json',
      'Use with a Roll20 JSON importer script (VTT Enhancement Suite / Beyond20-style importers).');
  });
  el('v6BtnRoll20Txt').addEventListener('click', () => {
    const s = snapshot();
    show('Roll20 paste text', roll20Text(s),
      s.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase() + '-roll20.txt', 'text/plain',
      'Paste into the Roll20 NPC sheet\u2019s statblock importer field.');
  });
  el('v6BtnPrint').addEventListener('click', () => printSheet(snapshot()));
  el('v6BtnDownload').addEventListener('click', () => { if (!lastText) { alert('Generate an export first.'); return; } download(lastFile, lastText, lastMime); });
  el('v6BtnCopyExp').addEventListener('click', e => { if (!lastText) { alert('Generate an export first.'); return; } copy(lastText, e.target); });

  /* ----- Settings ----- */
  const rSel = el('v6Rounding');
  rSel.value = window.__ddhpRounding;
  rSel.addEventListener('change', () => {
    window.__ddhpRounding = rSel.value;
    try { localStorage.setItem('ddhp_rounding', rSel.value); } catch (e) {}
    const calc = el('btnCalculate'); if (calc) calc.click();
    renderBst();
    el('v6SetOut').innerHTML = '<div class="result-card">Rounding set to <strong>' + E(rSel.value) + '</strong>. Recalculated.</div>';
  });

  const BACKUP_KEYS = ['ddhp_saves','ddhp_lastSession','ddhp_xpHistory','ddhp_combat_v2','ddhp_dark','ddhp_rounding'];
  el('v6BtnBackup').addEventListener('click', () => {
    const data = { app: 'dnd-hp-forge', version: 6, exportedAt: new Date().toISOString(), data: {} };
    BACKUP_KEYS.forEach(k => { try { const v = localStorage.getItem(k); if (v !== null) data.data[k] = v; } catch (e) {} });
    download('dnd-hp-forge-backup-' + new Date().toISOString().slice(0,10) + '.json', JSON.stringify(data, null, 2));
    el('v6SetOut').innerHTML = '<div class="result-card">Backup downloaded (' + Object.keys(data.data).length + ' data sets).</div>';
  });
  el('v6BtnRestore').addEventListener('click', () => el('v6File').click());
  el('v6File').addEventListener('change', ev => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      let parsed;
      try { parsed = JSON.parse(String(rd.result)); } catch (e) { el('v6SetOut').innerHTML = '<div class="result-card">\u274C Not a valid JSON backup file.</div>'; return; }
      const blob = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : null;
      if (!blob) { el('v6SetOut').innerHTML = '<div class="result-card">\u274C This file is not a HP Forge backup.</div>'; return; }
      const merge = el('v6Merge').checked;
      let restored = 0;
      Object.keys(blob).forEach(k => {
        if (BACKUP_KEYS.indexOf(k) === -1) return;
        try {
          if (merge && k === 'ddhp_saves') {
            let cur = []; try { cur = JSON.parse(localStorage.getItem('ddhp_saves') || '[]'); } catch (e) { cur = []; }
            let inc = []; try { inc = JSON.parse(blob[k]); } catch (e) { inc = []; }
            if (!Array.isArray(cur)) cur = [];
            if (!Array.isArray(inc)) inc = [];
            const seen = new Set(cur.map(s => (s && s.name) + '|' + (s && s.timestamp)));
            inc.forEach(s => { const key = (s && s.name) + '|' + (s && s.timestamp); if (!seen.has(key)) { cur.push(s); seen.add(key); } });
            localStorage.setItem('ddhp_saves', JSON.stringify(cur.slice(-40)));
          } else {
            localStorage.setItem(k, blob[k]);
          }
          restored++;
        } catch (e) {}
      });
      el('v6SetOut').innerHTML = '<div class="result-card">\u2705 Restored ' + restored + ' data set(s). Reload the page to see everything applied.</div>';
      ev.target.value = '';
    };
    rd.readAsText(f);
  });

  /* auto-save status */
  const auto = el('v6AutoOut');
  function refreshAuto(){
    let s = null;
    try { s = JSON.parse(localStorage.getItem('ddhp_lastSession') || 'null'); } catch (e) {}
    let saves = 0;
    try { const a = JSON.parse(localStorage.getItem('ddhp_saves') || '[]'); saves = Array.isArray(a) ? a.length : 0; } catch (e) {}
    auto.innerHTML = 'Auto-save: <strong>on</strong> (inputs persist automatically). Named saves stored: <strong>' + saves + '</strong> / 20.'
      + (s ? '<br>Last session snapshot holds ' + Object.keys(s).length + ' field(s).' : '<br>No session snapshot yet.');
  }
  refreshAuto();
  setInterval(refreshAuto, 5000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build6);
else build6();
})();

// ==================== CSP-SAFE URL TAB ROUTER ====================
(function () {
  function openTabFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var raw = params.get('tool') || params.get('tab') || window.location.hash.replace(/^#/, '');
    if (!raw || raw.startsWith('s=')) return;
    var tabId = raw.startsWith('tab-') ? raw : 'tab-' + raw;

    var btn = document.querySelector('.tab-nav .tab-btn[data-tab="' + tabId + '"]');
    var panel = document.getElementById(tabId);
    if (!btn || !panel) return;

    document.querySelectorAll('.tab-nav .tab-btn').forEach(function (b) {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
      b.setAttribute('tabindex', '-1');
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.classList.remove('active');
    });

    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    btn.setAttribute('tabindex', '0');
    panel.classList.add('active');
    btn.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', openTabFromUrl);
  } else {
    openTabFromUrl();
  }
  setTimeout(openTabFromUrl, 100);
  setTimeout(openTabFromUrl, 400);
  window.addEventListener('load', openTabFromUrl);
  window.addEventListener('hashchange', openTabFromUrl);

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.tab-nav .tab-btn[data-tab]');
    if (b && b.dataset.tab) {
      history.replaceState(null, '', '#' + b.dataset.tab);
    }
  });
})();