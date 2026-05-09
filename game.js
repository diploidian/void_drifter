/** ==========================================
 * CORE MATH & UTILITIES
 * ========================================== */
const MathUtils = {
    rand: (min, max) => Math.random() * (max - min) + min,
    randInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    distance: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    angle: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1),
    lerp: (a, b, t) => a + (b - a) * t,
    clamp: (val, min, max) => Math.max(min, Math.min(max, val))
};

function getDamage(source) {
    let dmg = source.stats ? source.stats.damage : source.damage;
    if (typeof dmg === 'object') {
        return MathUtils.rand(dmg.min, dmg.max);
    }
    return dmg;
}

/** ==========================================
 * GAME CONSTANTS & GLOBALS
 * ========================================== */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const miniCtx = miniCanvas.getContext('2d');

let cw = canvas.width = window.innerWidth;
let ch = canvas.height = window.innerHeight;

const WORLD_SIZE = 4000; // -2000 to +2000
const FOCAL_LENGTH = 800; // For Z-axis perspective

const GAME = {
    state: 'PLAYING', // PLAYING, INVENTORY, DEAD
    lastTime: 0,
    camera: { x: 0, y: 0, zoom: 1.0 },
    bossSpawned: false,
    activeBoss: null,
    keys: { w: false, a: false, s: false, d: false, ' ': false, '1': false, '2': false, '3': false, '4': false, 'f': false },
    mouse: { x: cw/2, y: ch/2, worldX: 0, worldY: 0, left: false },
    fowMap: new Map(), // Fog of War visited chunks
    stars: [],
    clouds: []
};

window.addEventListener('resize', () => {
    cw = canvas.width = window.innerWidth;
    ch = canvas.height = window.innerHeight;
});

const AUDIO_CACHE = {};
function playSound(file, volume = 0.5) {
    if(!AUDIO_CACHE[file]) {
        AUDIO_CACHE[file] = new Audio(file);
    }
    let audio = AUDIO_CACHE[file].cloneNode();
    audio.volume = volume;
    audio.play().catch(e => {}); // Catch play-prevention to avoid error spam
}

/** ==========================================
 * ICONS & SVG GENERATION
 * ========================================== */
const SVG_CACHE = {};

function getIcon(type, color) {
    let key = type + color;
    if(SVG_CACHE[key]) return SVG_CACHE[key];
    
    let path = '';
    if(type === 'Primary Weapon') path = '<path d="M5 12h14M12 5l7 7-7 7"/>';
    else if(type === 'Secondary Weapon') path = '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>';
    else if(type === 'Hull') path = '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>';
    else if(type === 'Shields') path = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>';
    else if(type === 'Engine') path = '<path d="M12 2c0 0-6 8-6 14a6 6 0 0 0 12 0c0-6-6-14-6-14z"/><path d="M12 12c0 0-2 3-2 6a2 2 0 0 0 4 0c0-3-2-6-2-6z"/>';
    else if(type === 'Reactor') path = '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="3" transform="rotate(45 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="3" transform="rotate(-45 12 12)"/>';
    else if(type === 'Fuel') path = '<rect x="7" y="6" width="10" height="15" rx="2"/><path d="M10 2h4v4h-4z"/><line x1="12" y1="10" x2="12" y2="17"/>';
    else if(type === 'BossSkull') path = '<path d="M12 2C6.477 2 2 6.477 2 12v4c0 2.21 1.79 4 4 4h2v2h8v-2h2c2.21 0 4-1.79 4-4v-4c0-5.523-4.477-10-10-10zM9 12c-.552 0-1 .448-1 1s.448 1 1 1 1-.448 1-1-.448-1-1-1zm6 0c-.552 0-1 .448-1 1s.448 1 1 1 1-.448 1-1-.448-1-1-1z"/>';
    else path = '<polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>'; // Resource
    
    let rawSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${path}</svg>`;
    
    // Properly encode for Canvas Image src
    let encodedSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rawSvg);
    let img = new Image();
    img.src = encodedSvg;
    
    SVG_CACHE[key] = { img: img, raw: rawSvg };
    return SVG_CACHE[key];
}

/** ==========================================
 * EQUIPMENT & LOOT SYSTEM
 * ========================================== */
const SLOT_TYPES = ['Primary Weapon', 'Secondary Weapon', 'Hull', 'Shields', 'Engine', 'Reactor'];
const TIERS = [
    { name: 'Junk', level: 0, color: '#aaa', mult: 0, mods: 0 },
    { name: 'Common', level: 1, color: '#fff', mult: 1, mods: 2 },
    { name: 'Uncommon', level: 2, color: '#33ff33', mult: 1.25, mods: 2 },
    { name: 'Rare', level: 3, color: '#4bf', mult: 1.5, mods: 3 },
    { name: 'Epic', level: 4, color: '#aa33ff', mult: 2.0, mods: 4 },
    { name: 'Legendary', level: 5, color: '#f82', mult: 2.5, mods: 5 }
];

const ITEM_TEMPLATES = {
    'Primary Weapon': { names: ['Pulse Laser', 'Plasma Repeater', 'Ion Cannon'], stats: ['damage'] },
    'Secondary Weapon': { names: ['Missile Pod', 'Flak Burst', 'Railgun'], stats: ['damage'] },
    'Hull': { names: ['Titanium Plating', 'Ablative Armor', 'Nanite Shell'], stats: ['maxHp', 'armorRating'] },
    'Shields': { names: ['Deflector Array', 'Plasma Bubble', 'Phase Shield'], stats: ['maxShields', 'shieldRegen'] },
    'Engine': { names: ['Ion Thruster', 'Plasma Drive', 'Warp Core'], stats: ['maxSpeed', 'acceleration'] },
    'Reactor': { names: ['Fusion Core', 'Antimatter Cell', 'Zero-Point Module'], stats: ['maxEnergy', 'energyRegen'] }
};

function getFireRateBonus(rating, level) {
    return Math.max(0, rating / (rating + 130 + level * 50));
}

function getArmorReduction(rating, level) {
    return Math.max(0, rating / (rating + 250 + level * 50));
}

function generateLoot(type = null, tierLevel = -1) {
    // 20% chance for junk/resources
    if (Math.random() < 0.25 && type === null) {
        const isFuel = Math.random() < 0.5;
        return {
            id: Math.random().toString(36).substr(2, 9),
            name: isFuel ? 'Fuel Cell' : 'Raw Minerals',
            type: isFuel ? 'Fuel' : 'Resource',
            tier: 0,
            stackable: true,
            count: MathUtils.randInt(1, 5),
            desc: isFuel ? 'Restores 5 Fuel on use.' : 'Can be traded or scrapped.'
        };
    }

    if (!type) type = SLOT_TYPES[MathUtils.randInt(0, SLOT_TYPES.length - 1)];
    if (tierLevel === -1) {
        const r = Math.random();
        if (r > 0.99) tierLevel = 5; 
        else if (r > 0.95) tierLevel = 4; 
        else if (r > 0.85) tierLevel = 3; 
        else if (r > 0.50) tierLevel = 2; 
        else tierLevel = 1; 
    }
    
    if (player.level < 3 && tierLevel > 2) {
        tierLevel = 2;
    }
    
    const tier = TIERS[tierLevel];
    const template = ITEM_TEMPLATES[type];
    const name = `${tier.name} ${template.names[MathUtils.randInt(0, template.names.length - 1)]}`;
    
    let stats = {};
    let statLines = [];
    let lvlMult = 1 + (player.level - 1) * 0.15; // +15% item value per level
    
    let availableStats = [...template.stats, 'fireRateRating'];
    if (type === 'Primary Weapon' || type === 'Secondary Weapon') availableStats.push('damage', 'critChance');
    else if (type === 'Hull') availableStats.push('maxHp', 'armorRating');
    else if (type === 'Shields') availableStats.push('maxShields', 'shieldRegen');
    else if (type === 'Engine') availableStats.push('maxSpeed', 'acceleration');
    else if (type === 'Reactor') availableStats.push('maxEnergy', 'energyRegen');
    
    availableStats = [...new Set(availableStats)];
    
    let pickedStats = [];
    for (let i = 0; i < tier.mods; i++) {
        if (availableStats.length === 0) break;
        let idx = MathUtils.randInt(0, availableStats.length - 1);
        pickedStats.push(availableStats.splice(idx, 1)[0]);
    }

    for (let stat of pickedStats) {
        let val = 0; let str = ''; let isObj = false;
        if (stat === 'fireRateRating') { val = Math.floor(MathUtils.rand(10, 25) * tier.mult); str = `+${val} Fire Rate Rating`; }
        else if (stat === 'damage') { 
            let avgDmg = MathUtils.rand(10, 20) * tier.mult * lvlMult;
            let spread = Math.max(1, 6 - tierLevel) * 2; // Tighter spread for better tiers
            let min = Math.max(1, Math.floor(avgDmg - spread/2));
            let max = Math.floor(avgDmg + spread/2);
            val = { min, max }; str = `+${min}-${max} Damage`; isObj = true;
        }
        else if (stat === 'critChance') { val = Math.floor(MathUtils.rand(2, 5) * tier.mult); str = `+${val}% Crit Chance`; }
        else if (stat === 'maxHp') { val = Math.floor(MathUtils.rand(20, 50) * tier.mult * lvlMult); str = `+${val} Max HP`; }
        else if (stat === 'armorRating') { val = Math.floor(MathUtils.rand(20, 30) * Math.pow(tier.mult, 2) * lvlMult); str = `+${val} Armor Rating`; }
        else if (stat === 'maxShields') { val = Math.floor(MathUtils.rand(20, 40) * tier.mult * lvlMult); str = `+${val} Max Shields`; }
        else if (stat === 'shieldRegen') { val = Math.floor(MathUtils.rand(2, 8) * tier.mult * lvlMult); str = `+${val} Shield/sec`; }
        else if (stat === 'maxSpeed') { val = Math.floor(MathUtils.rand(50, 150) * tier.mult * lvlMult); str = `+${val} Max Speed`; }
        else if (stat === 'acceleration') { val = Math.floor(MathUtils.rand(10, 30) * tier.mult * lvlMult); str = `+${val} Thrust`; }
        else if (stat === 'maxEnergy') { val = Math.floor(MathUtils.rand(20, 60) * tier.mult * lvlMult); str = `+${val} Max Energy`; }
        else if (stat === 'energyRegen') { val = Math.floor(MathUtils.rand(5, 15) * tier.mult * lvlMult); str = `+${val} Energy/sec`; }
        
        if (isObj || val > 0) { stats[stat] = val; statLines.push(str); }
    }

    let item = {
        id: Math.random().toString(36).substr(2, 9),
        name: name,
        type: type,
        tier: tierLevel,
        itemLevel: player.level,
        stackable: false,
        count: 1,
        stats: stats,
        statLines: statLines,
        desc: `Equippable ${type} component.`
    };
    
    if (tierLevel === 5) {
        if (type === 'Primary Weapon') { item.perk = 'Triple Shot'; item.statLines.push(`[PERK] Shoots 3 bullets in a cone`); }
        if (type === 'Secondary Weapon') { item.perk = 'Explosive Enemies'; item.statLines.push(`[PERK] Enemies explode on death`); }
        if (type === 'Hull') { item.perk = 'Repairis'; item.statLines.push(`[PERK] Regenerates 1% Max HP every 2s`); }
        if (type === 'Hull') { item.perk = 'Repairis'; item.statLines.push(`[PERK] Regenerates 1% Max HP every 2s`); }
        if (type === 'Shields') { item.perkReflect = MathUtils.randInt(10, 20); item.perk = 'Reflect'; item.statLines.push(`[PERK] Reflects ${item.perkReflect}% damage`); }
        if (type === 'Engine') { item.perk = 'Fuel Efficiency'; item.statLines.push(`[PERK] 25% better fuel efficiency`); }
        if (type === 'Reactor') { item.perk = 'XP Boost'; item.statLines.push(`[PERK] +15% XP & Orb pull range`); }
    }
    
    return item;
}

/** ==========================================
 * PLAYER & INVENTORY STATE
 * ========================================== */
const INVENTORY_SIZE = 50;
let inventory = new Array(INVENTORY_SIZE).fill(null);
let equipment = {
    'Primary Weapon': null,
    'Secondary Weapon': null,
    'Hull': null,
    'Shields': null,
    'Engine': null,
    'Reactor': null
};

// Base stats
const BASE_STATS = {
    maxHp: 100, hp: 100, armorRating: 0, damageReduction: 0,
    maxShields: 50, shields: 50, shieldRegen: 5,
    maxEnergy: 100, energy: 100, energyRegen: 10,
    maxFuel: 100, fuel: 100,
    maxSpeed: 300, acceleration: 400, friction: 0.95,
    damage: { min: 9, max: 13 }, fireRate: 100
};

const player = {
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0,
    radius: 15,
    angle: 0,
    damageIntensity: 0, // Used for screen red glow
    activeSingularity: null,
    level: 1,
    xp: 0,
    xpNext: 100,
    stats: { ...BASE_STATS },
    statBreakdown: {},
    timers: { dodge: 0, shieldRegen: 0 },
    skills: [
        { id: 1, name: 'Pulse Blaster', cost: 2, cd: 0, maxCd: 0.2, type: 'projectile' },
        { id: 2, name: 'EMP Blast', cost: 30, cd: 0, maxCd: 5.0, type: 'aoe' },
        { id: 3, name: 'Warp Dash', cost: 15, cd: 0, maxCd: 3.0, type: 'dash', isFuel: true },
        { id: 4, name: 'Singularity Torpedo', cost: 50, cd: 0, maxCd: 10.0, type: 'special' }
    ],
    
    gainXp(amount) {
        let xpMult = (equipment['Reactor'] && equipment['Reactor'].perk === 'XP Boost') ? 1.15 : 1.0;
        this.xp += amount * xpMult;
        while (this.xp >= this.xpNext) {
            this.xp -= this.xpNext;
            this.level++;
            this.xpNext = 100 * this.level; // Requires more total XP linearly
            
            // Level Up Rewards
            BASE_STATS.maxHp += 20;
            BASE_STATS.damage.min += 1;
            BASE_STATS.damage.max += 2;
            
            // Heal 25% on level up and reset CD
            this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + this.stats.maxHp * 0.25);
            for(let s of this.skills) s.cd = 0;
            
            createFloatingText("LEVEL UP!", this.x, this.y - 30, '#00ff66', 2.5, false, false);
            if (this.level >= 5 && !GAME.bossSpawned) {
                spawnBoss();
                GAME.bossSpawned = true;
            }
            this.updateStats();
        }
        updateUI();
    },

    updateStats() {
        // Reset to base
        let oldHpRatio = this.stats.hp / this.stats.maxHp;
        let oldShieldRatio = this.stats.shields / (this.stats.maxShields || 1);
        let oldEnRatio = this.stats.energy / this.stats.maxEnergy;

        this.stats = { ...BASE_STATS, damage: { min: BASE_STATS.damage.min, max: BASE_STATS.damage.max } };
        this.statBreakdown = {};
        for(let key in BASE_STATS) {
            this.statBreakdown[key] = { base: BASE_STATS[key], items: [] };
        }
        
        let totalFireRateRating = 0;

        // Add equip modifiers
        for (let key in equipment) {
            let item = equipment[key];
            if (item && item.stats) {
                for (let stat in item.stats) {
                    if (stat === 'fireRateRating') {
                        totalFireRateRating += item.stats[stat];
                        this.statBreakdown['fireRate'].items.push({ name: item.name, val: item.stats[stat] + ' Rating' });
                    } else if (stat === 'damage') {
                        this.stats.damage.min += item.stats[stat].min;
                        this.stats.damage.max += item.stats[stat].max;
                        this.statBreakdown[stat].items.push({ name: item.name, val: `${item.stats[stat].min}-${item.stats[stat].max}` });
                    } else if(this.stats[stat] !== undefined) {
                        this.stats[stat] += item.stats[stat];
                        this.statBreakdown[stat].items.push({ name: item.name, val: item.stats[stat] });
                    }
                }
            }
        }
        
        let fireRateBonus = totalFireRateRating > 0 ? getFireRateBonus(totalFireRateRating, this.level) : 0;
        this.stats.fireRate = BASE_STATS.fireRate * (1 + fireRateBonus);

        this.stats.damageReduction = this.stats.armorRating > 0 ? getArmorReduction(this.stats.armorRating, this.level) : 0;

        // Maintain ratios
        this.stats.hp = Math.min(this.stats.maxHp, this.stats.maxHp * oldHpRatio);
        this.stats.shields = Math.min(this.stats.maxShields, this.stats.maxShields * oldShieldRatio);
        this.stats.energy = Math.min(this.stats.maxEnergy, this.stats.maxEnergy * oldEnRatio);
        
        this.skills[0].cost = 2 + Math.floor(0.01 * this.stats.maxEnergy * (this.level - 1));
        // 100 fire rate = 0.25s.
        this.skills[0].maxCd = 0.25 / (this.stats.fireRate / 100);
        
        updateUI();
    },
    
    takeDamage(amount, source) {
        let actualDamage = amount * (1 - this.stats.damageReduction);
        actualDamage = Math.max(1, actualDamage);
        if (this.stats.shields > 0) {
            if (this.stats.shields >= actualDamage) {
                this.stats.shields -= actualDamage;
                actualDamage = 0;
            } else {
                actualDamage -= this.stats.shields;
                this.stats.shields = 0;
            }
        }
        
        if (equipment['Shields'] && equipment['Shields'].perk === 'Reflect' && source && typeof source.takeDamage === 'function') {
            source.takeDamage(amount * (equipment['Shields'].perkReflect / 100), this);
        }
        
        let oldHp = this.stats.hp;
        if (actualDamage > 0) {
            this.stats.hp -= actualDamage;
            createParticles(this.x, this.y, 0, 10, '#ff3366');
            
            // Damage text over character
            createFloatingText("-" + Math.floor(actualDamage), this.x, this.y, '#ff3366', 1.5, false, true);
            
            // Low HP sound trigger (triggers upon dropping to 25% or less)
            if (this.stats.hp > 0 && this.stats.hp <= this.stats.maxHp * 0.25 && oldHp > this.stats.maxHp * 0.25) {
                playSound('sounds/spaceEngine_000.ogg');
            }

            // Screen Glow intensity increase
            let dmgRatio = actualDamage / this.stats.maxHp;
            this.damageIntensity = Math.min(1.0, this.damageIntensity + dmgRatio * 2.5);

            if (this.stats.hp <= 0) {
                this.stats.hp = 0;
                die();
            }
        }
        this.timers.shieldRegen = 3.0; // delay regen on hit
        updateUI();
    }
};

/** ==========================================
 * ENTITIES & MANAGERS
 * ========================================== */
let entities = [];
let particles = [];
let projectiles = [];
let drops = [];
let floatingTexts = [];
let xpOrbs = [];
let shockwaves = [];
let warpTrails = [];

class Asteroid {
    constructor(x, y, radius) {
        this.x = x; this.y = y; this.z = 0;
        this.vx = MathUtils.rand(-20, 20); this.vy = MathUtils.rand(-20, 20);
        this.radius = radius;
        this.hp = radius * 2;
        this.maxHp = this.hp;
        this.dead = false;
        this.points = [];
        let numPoints = MathUtils.randInt(7, 12);
        for(let i=0; i<numPoints; i++) {
            let angle = (i / numPoints) * Math.PI * 2;
            let r = this.radius * MathUtils.rand(0.7, 1.1);
            this.points.push({x: Math.cos(angle)*r, y: Math.sin(angle)*r});
        }
        this.rotation = 0;
        this.rotSpeed = MathUtils.rand(-1, 1) * 0.02;
    }
    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.rotation += this.rotSpeed;
        
        // Collision with player
        let dist = MathUtils.distance(this.x, this.y, player.x, player.y);
        if(dist < this.radius + player.radius) {
            // Bounce
            let angle = MathUtils.angle(this.x, this.y, player.x, player.y);
            let speed = Math.hypot(player.vx, player.vy);
            
            // Push player out
            let overlap = (this.radius + player.radius) - dist;
            player.x += Math.cos(angle) * overlap;
            player.y += Math.sin(angle) * overlap;
            
            // Transfer momentum (bounce)
            player.vx = Math.cos(angle) * (speed * 0.5 + 100);
            player.vy = Math.sin(angle) * (speed * 0.5 + 100);
            
            if(speed > 50) {
                let dmg = Math.floor(speed * 0.05); // damage based on speed
                player.takeDamage(dmg);
            }
        }
    }
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        
        let scale = getScale(this.z);
        
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(scale, scale);
        ctx.rotate(this.rotation);
        
        // Draw bottom layer (depth)
        ctx.fillStyle = '#111';
        ctx.beginPath();
        for(let i=0; i<this.points.length; i++) {
            let pt = this.points[i];
            if(i===0) ctx.moveTo(pt.x, pt.y + 15);
            else ctx.lineTo(pt.x, pt.y + 15);
        }
        ctx.closePath();
        ctx.fill();

        // Draw top layer
        ctx.fillStyle = '#222';
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for(let i=0; i<this.points.length; i++) {
            let pt = this.points[i];
            if(i===0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // HP bar if damaged
        if(this.hp < this.maxHp) {
            ctx.rotate(-this.rotation); // unrotate for HP bar
            ctx.fillStyle = 'red';
            ctx.fillRect(-this.radius, -this.radius - 10, this.radius*2, 4);
            ctx.fillStyle = 'green';
            ctx.fillRect(-this.radius, -this.radius - 10, (this.radius*2) * (this.hp/this.maxHp), 4);
        }
        
        ctx.restore();
    }
    takeDamage(amount, source, color = '#fff') {
        if (this.dead) return false;
        this.hp -= amount;
        if (amount >= 1) createFloatingText(`-${Math.floor(amount)}`, this.x, this.y, color, 1.0, false, true);
        if(this.hp <= 0) {
            this.dead = true;

            createParticles(this.x, this.y, this.z, 20, '#555');
            // Drop loot
            for(let i=0; i<MathUtils.randInt(1, 3); i++) {
                spawnDrop(this.x, this.y, true); // force resource
            }
            if(Math.random() < 0.1) spawnDrop(this.x, this.y); // small chance for gear
            // Small chance for fragments
            if(Math.random() < 0.3) {
                let totalXp = player.level * 1;
                let numOrbs = MathUtils.randInt(1, 3);
                for(let i=0; i<numOrbs; i++) xpOrbs.push(new XpOrb(this.x, this.y, totalXp / numOrbs));
            }
            return true; // remove
        }
        return false;
    }
}

class Enemy {
    constructor(x, y) {
        this.x = x; this.y = y; this.z = 500; // Spawn from deep space
        this.vx = 0; this.vy = 0; this.vz = -500; // Move up to z=0
        this.radius = 12;
        this.level = player.level;
        
        // Scale HP and Damage with Level
        this.maxHp = 50 * (1 + (this.level - 1) * 0.3);
        this.hp = this.maxHp;
        this.damage = 5 * (1 + (this.level - 1) * 0.2);
        this.dead = false;
        
        this.speed = 150 + (this.level * 2); // get slightly faster
        this.attackTimer = 0;
        this.stunTimer = 0;
        this.type = Math.random() < 0.7 ? 'chaser' : 'shooter';
        if (this.type === 'chaser') {
            this.speed *= 0.8;
            this.attackCombo = 0;
            this.chaserKnockbackTimer = 0;
            this.chaserSlowTimer = 0;
        } else {
            this.orbitDir = Math.random() < 0.5 ? 1 : -1;
            this.rapidShotTimer = 5.0 + MathUtils.rand(0, 2.5);
            this.rapidShotsToFire = 0;
            this.rapidShotInterval = 0;
            this.knockbackVx = 0;
            this.knockbackVy = 0;
        }
        this.color = this.type === 'chaser' ? '#ff0055' : '#00ffcc';
    }
    update(dt) {
        // Z-axis entrance
        if(this.z > 0) {
            this.z += this.vz * dt;
            if(this.z <= 0) { this.z = 0; this.vz = 0; }
            return; // don't act while spawning
        }
        
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            return;
        }

        let dist = MathUtils.distance(this.x, this.y, player.x, player.y);
        let angle = MathUtils.angle(this.x, this.y, player.x, player.y);
        
        if (this.type === 'chaser') {
            if (this.chaserKnockbackTimer > 0) {
                this.chaserKnockbackTimer -= dt;
                let progress = 1.0 - (this.chaserKnockbackTimer / 0.2);
                let spiralAngle = progress * Math.PI * 6;
                let wobble = Math.sin(spiralAngle) * 800;
                this.vx = this.knockbackVx + (-this.knockbackVy / 500) * wobble;
                this.vy = this.knockbackVy + (this.knockbackVx / 500) * wobble;
            } else {
                let speedMult = 1.0;
                if (this.chaserSlowTimer > 0) {
                    this.chaserSlowTimer -= dt;
                    speedMult = 0.05 + 0.95 * (1.0 - (this.chaserSlowTimer / 1.2));
                }
                this.vx = Math.cos(angle) * this.speed * speedMult;
                this.vy = Math.sin(angle) * this.speed * speedMult;
            }
            
            // Melee attack
            if (dist < 20 + player.radius) {
                if (this.attackTimer <= 0) {
                    player.takeDamage(getDamage(this) * 1.15, this);
                    this.attackTimer = 1.0;
                    this.chaserKnockbackTimer = 0.2;
                    this.chaserSlowTimer = 1.2;
                    this.knockbackVx = -Math.cos(angle) * 500;
                    this.knockbackVy = -Math.sin(angle) * 500;
                    this.vx = this.knockbackVx;
                    this.vy = this.knockbackVy;
                    this.attackCombo++;
                    if (this.attackCombo >= 4) {
                        let aoeDmg = (getDamage(this) * 3) / 2;
                        player.takeDamage(aoeDmg, this);
                        
                        for (let e of entities) {
                            if (e instanceof Enemy && !e.dead && e !== this) {
                                if (MathUtils.distance(this.x, this.y, e.x, e.y) <= 35 + e.radius) {
                                    e.takeDamage(aoeDmg / 2, this);
                                }
                            }
                        }
                        createParticles(this.x, this.y, this.z, 50, '#ff8800');
                        this.dead = true;
                        return true; // Despawn without dropping loot/xp
                    } else {
                        player.takeDamage(getDamage(this), this);
                    }
                }
            }
        } else {
        
            // Shooter keeps distance
            if(dist > 300) {
                this.vx = Math.cos(angle) * this.speed;
                this.vy = Math.sin(angle) * this.speed;
            } else if (dist < 200) {
                this.vx = -Math.cos(angle) * this.speed;
                this.vy = -Math.sin(angle) * this.speed;
            } else {
                this.vx = Math.cos(angle + Math.PI / 2 * this.orbitDir) * this.speed * 0.5;
                this.vy = Math.sin(angle + Math.PI / 2 * this.orbitDir) * this.speed * 0.5;
            }
            
            if (this.type === 'shooter' && this.rapidShotsToFire === 0) {
                this.rapidShotTimer -= dt;
            }

            if (this.attackTimer <= 0 && dist < 400) {
                // 2. Check if it is time for a Rapid Fire sequence
                if (this.rapidShotTimer <= 0 && this.rapidShotsToFire === 0) {
                    this.rapidShotsToFire = 3;
                    this.rapidShotInterval = 0;
                    this.rapidShotTimer = 5.0 + MathUtils.rand(0, 2.5);
                }

                // 3. Handle the Rapid Fire sequence
                if (this.rapidShotsToFire > 0) {
                    if (this.rapidShotInterval <= 0) {
                        projectiles.push(new Projectile(this.x, this.y, angle, 300, getDamage(this), false, this.color, this));
                        this.rapidShotsToFire--;
                        this.rapidShotInterval = 0.2; 
                        
                        // If we just finished the burst, set the main attack cooldown
                        if (this.rapidShotsToFire === 0) this.attackTimer = 2.0;
                    } else {
                        this.rapidShotInterval -= dt;
                    }
                } 
                // 4. Otherwise, fire a normal shot
                else {
                    projectiles.push(new Projectile(this.x, this.y, angle, 300, getDamage(this), false, this.color, this));
                    this.attackTimer = 2.0;
                }
            }
        }
        
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if(this.attackTimer > 0) this.attackTimer -= dt;
    }
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        let scale = getScale(this.z);
        
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(scale, scale);
        
        if (this.type === 'chaser') {
            ctx.strokeStyle = 'rgba(255,0,85,0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(0,0,20,0,Math.PI*2); ctx.stroke();
        }

        let angle = Math.atan2(this.vy, this.vx);
        ctx.rotate(angle);
        
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeStyle = this.stunTimer > 0 ? '#ffff00' : this.color;
        ctx.lineWidth = 2;

        if (this.type === 'chaser' && this.attackCombo > 0) {
            let comboColor = 'transparent';
            if (this.attackCombo === 1) comboColor = 'rgba(255,0,0,0.5)';
            else if (this.attackCombo === 2) comboColor = 'rgba(255,128,0,0.5)';
            else if (this.attackCombo === 3) {
                let t = (Math.sin(Date.now() / 100) + 1) / 2;
                let g = Math.floor(128 + 127 * t);
                comboColor = `rgba(255,${g},0,0.7)`;
            }
            ctx.fillStyle = comboColor;
        }
        
        ctx.beginPath();
        if(this.type === 'chaser') {
            ctx.moveTo(15, 0); ctx.lineTo(-10, 10); ctx.lineTo(-5, 0); ctx.lineTo(-10, -10);
        } else {
            ctx.arc(0, 0, this.radius, 0, Math.PI*2);
            ctx.moveTo(0,0); ctx.lineTo(15, 0); // barrel
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        
        ctx.restore();
    }
    takeDamage(amount, source, color = '#fff') {
        if (this.dead) return false;
        this.hp -= amount;
        if (amount >= 1) createFloatingText(`-${Math.floor(amount)}`, this.x, this.y, color, 1.0, false, true);
        if(this.hp <= 0) {
            this.dead = true;
            if (source === player && equipment['Secondary Weapon'] && equipment['Secondary Weapon'].perk === 'Explosive Enemies') {
                createParticles(this.x, this.y, this.z, 50, '#ffaa00');
                for(let other of entities) {
                    if (other instanceof Enemy && !other.dead && other !== this && MathUtils.distance(this.x, this.y, other.x, other.y) < 200) {
                        other.takeDamage(getDamage(player), player, '#ffaa00'); 
                        other.takeDamage(getDamage(player) * 0.5, player, '#ffaa00'); 
                    }
                }
            }

            createParticles(this.x, this.y, this.z, 30, this.color);
            if(Math.random() < 0.5) spawnDrop(this.x, this.y);
            
            // Drop XP Orbs
            let totalXp = 5 * this.level;
            let numOrbs = MathUtils.randInt(3, 5);
            let xpPerOrb = totalXp / numOrbs;
            for(let i=0; i<numOrbs; i++) xpOrbs.push(new XpOrb(this.x, this.y, xpPerOrb));
            
            return true;
        }
        return false;
    }
}

class Projectile {
    constructor(x, y, angle, speed, damage, isPlayer, color, source, type = 'bullet') {
        this.x = x; this.y = y; this.z = 0;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.damage = damage;
        this.isPlayer = isPlayer;
        this.color = color;
        this.source = source;
        this.type = type;
        this.life = 2.0;
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        
        // Particles trail
        if(this.type !== 'bullet' && Math.random() < 0.3) createParticles(this.x, this.y, 0, 1, this.color, 0.5);

        // Collisions
        if(this.isPlayer) {
            for(let i=entities.length-1; i>=0; i--) {
                let e = entities[i];
                if(e.z > 0) continue; // ignore spawning entities
                if(MathUtils.distance(this.x, this.y, e.x, e.y) < e.radius && !e.dead) {
                    if (typeof e.takeDamage === 'function' && !e.dead) {
                        e.takeDamage(this.damage, this.source, this.color);
                        if (this.type === 'bullet') shockwaves.push(new Shockwave(this.x, this.y, this.z, this.color));
                        else createParticles(this.x, this.y, 0, 5, this.color);
                        return true; // destroy projectile
                    }
                }
            }
        } else {
            if(MathUtils.distance(this.x, this.y, player.x, player.y) < player.radius) {
                player.takeDamage(this.damage, this.source);
                if (this.type === 'bullet') shockwaves.push(new Shockwave(this.x, this.y, this.z, this.color));
                else createParticles(this.x, this.y, 0, 5, this.color);
                return true;
            }
        }
        return this.life <= 0;
    }
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        
        if (this.type === 'bullet' && (this.vx !== 0 || this.vy !== 0)) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.atan2(this.vy, this.vx));
            let s = getScale(this.z);
            ctx.beginPath();
            ctx.ellipse(0, 0, 8 * s, 2 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else {
            ctx.beginPath(); ctx.arc(p.x, p.y, 3 * getScale(this.z), 0, Math.PI*2); ctx.fill();
        }
        ctx.shadowBlur = 0;
    }
}

class Boss extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.radius = 40;
        this.level = player.level;
        this.maxHp = 800 * (1 + (this.level - 1) * 0.5);
        this.hp = this.maxHp;
        this.damage = 50 * (1 + (this.level - 1) * 0.3);
        this.speed = 100;
        this.color = '#ff4400';
        this.type = 'boss';
        this.abilities = [
            { name: 'charge', cd: 0, maxCd: 8.0, active: false, duration: 0 },
            { name: 'barrage', cd: 3, maxCd: 10.0 },
            { name: 'pull', cd: 6, maxCd: 15.0, active: false, duration: 0 }
        ];
    }

    update(dt) {
        if(this.z > 0) {
            this.z += this.vz * dt;
            if(this.z <= 0) { this.z = 0; this.vz = 0; }
            return;
        }

        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            return;
        }

        for(let ab of this.abilities) if(ab.cd > 0) ab.cd -= dt;

        let dist = MathUtils.distance(this.x, this.y, player.x, player.y);
        let angle = MathUtils.angle(this.x, this.y, player.x, player.y);

        // Ability logic
        let charge = this.abilities[0];
        if (charge.active) {
            charge.duration -= dt;
            if (charge.duration <= 0) charge.active = false;
            if (dist < this.radius + player.radius) player.takeDamage(getDamage(this) * 3, this);
        } else if (charge.cd <= 0 && dist > 200 && dist < 800) {
            charge.active = true;
            charge.duration = 1.5;
            this.vx = Math.cos(angle) * 300;
            this.vy = Math.sin(angle) * 300;
            charge.cd = charge.maxCd;
        }

        let barrage = this.abilities[1];
        if (barrage.cd <= 0) {
            for(let i=-3; i<=3; i++) {
                projectiles.push(new Projectile(this.x, this.y, angle + i * (Math.PI/16), 400, getDamage(this) * 0.8, false, '#ff8800', this));
            }
            barrage.cd = barrage.maxCd;
        }

        let pull = this.abilities[2];
        if (pull.active) {
            pull.duration -= dt;
            if (pull.duration <= 0) pull.active = false;
            let pullAngle = MathUtils.angle(player.x, player.y, this.x, this.y);
            player.vx += Math.cos(pullAngle) * 400 * dt;
            player.vy += Math.sin(pullAngle) * 400 * dt;
        } else if (pull.cd <= 0 && dist < 600) {
            pull.active = true;
            pull.duration = 3.0;
            pull.cd = pull.maxCd;
        }

        if (!charge.active) {
            this.vx = Math.cos(angle) * this.speed;
            this.vy = Math.sin(angle) * this.speed;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;
    }

    draw(ctx) {
        super.draw(ctx); // basic shape
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        if (this.abilities[2].active) { // pull
            ctx.strokeStyle = 'rgba(255,0,0,0.5)';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(p.x, p.y, 600 * getScale(this.z), 0, Math.PI*2); ctx.stroke();
        }
    }

    takeDamage(amount, source, color = '#fff') {
        if (super.takeDamage(amount, source, color)) {
            GAME.activeBoss = null;
            // Big loot explosion
            let totalXp = 500 * this.level;
            let numOrbs = 50;
            let xpPerOrb = totalXp / numOrbs;
            for(let i=0; i<numOrbs; i++) xpOrbs.push(new XpOrb(this.x, this.y, xpPerOrb));
            for(let i=0; i<10; i++) spawnDrop(this.x, this.y, true);

            let slots = [...SLOT_TYPES];
            for(let i=0; i<3; i++) {
                let slotType = slots.splice(MathUtils.randInt(0, slots.length-1), 1)[0];
                spawnDrop(this.x, this.y, false, generateLoot(slotType, 5));
            }
            for(let i=0; i<5; i++) spawnDrop(this.x, this.y);
            return true;
        }
        return false;
    }
}

class Singularity {
    constructor(x, y, targetX, targetY) {
        this.x = x; this.y = y; this.z = 0;
        let angle = MathUtils.angle(x, y, targetX, targetY);
        this.vx = Math.cos(angle) * 400;
        this.vy = Math.sin(angle) * 400;
        this.targetX = targetX; this.targetY = targetY;
        this.state = 'moving'; // moving, blackhole
        this.timer = 3.0; // blackhole duration
        this.radius = 0;
        this.tickTimer = 0;
    }
    update(dt) {
        if (this.state === 'moving') {
            this.x += this.vx * dt; this.y += this.vy * dt;
            createParticles(this.x, this.y, 0, 2, '#9933ff');
            if (MathUtils.distance(this.x, this.y, this.targetX, this.targetY) < 10) {
                this.state = 'blackhole';
                this.vx = 0; this.vy = 0;
            }
        } else {
            this.timer -= dt;
            this.radius = Math.min(150, this.radius + 200*dt); // expand pull radius
            
            // Suck entities
            for(let e of entities) {
                if (e === this) continue;
                let d = MathUtils.distance(this.x, this.y, e.x, e.y);
                if (d < this.radius && e.z <= 0) {
                    let ang = MathUtils.angle(e.x, e.y, this.x, this.y);
                    let pull = (this.radius - d) * 2;
                    e.x += Math.cos(ang) * pull * dt;
                    e.y += Math.sin(ang) * pull * dt;
                }
            }
            
            // Tick Damage
            this.tickTimer -= dt;
            if (this.tickTimer <= 0) {
                this.tickTimer = 0.25;
                for(let e of entities) {
                    if (e instanceof Enemy && !e.dead && e.z <= 0 && MathUtils.distance(this.x, this.y, e.x, e.y) < this.radius) {
                        e.takeDamage(getDamage(player) * 0.25, player, '#9933ff');
                    }
                }
            }

            // Sucks drops too
            for(let d of drops) {
                let dist = MathUtils.distance(this.x, this.y, d.x, d.y);
                if (dist < this.radius) {
                    let ang = MathUtils.angle(d.x, d.y, this.x, this.y);
                    d.x += Math.cos(ang) * 200 * dt;
                    d.y += Math.sin(ang) * 200 * dt;
                }
            }
            
            if(Math.random() < 0.2) createParticles(this.x + MathUtils.rand(-50,50), this.y + MathUtils.rand(-50,50), 0, 1, '#000', 1.0);

            if (this.timer <= 0) {
                // Explode
                createParticles(this.x, this.y, 0, 100, '#9933ff');
                for(let e of entities) {
                    if (!e.dead && (e instanceof Enemy || e instanceof Asteroid) && MathUtils.distance(this.x, this.y, e.x, e.y) < this.radius) {
                        e.takeDamage(getDamage(player) * 20, player, '#9933ff');
                    }
                }
                if (player.activeSingularity === this) {
                    player.activeSingularity = null;
                    player.skills[3].cd = player.skills[3].maxCd; // start cd normally if detonate organically
                }
                return true;
            }
        }
        return false;
    }
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        let s = getScale(this.z);
        
        if (this.state === 'moving') {
            ctx.fillStyle = '#9933ff';
            ctx.beginPath(); ctx.arc(p.x, p.y, 5*s, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.strokeStyle = '#9933ff';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(p.x, p.y, (this.radius/3)*s, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            
            // Event horizon
            ctx.strokeStyle = `rgba(153, 51, 255, ${Math.random()})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, this.radius*s, 0, Math.PI*2); ctx.stroke();
        }
    }
}

class WarpTrail {
    constructor(x1, y1, x2, y2, width, dps, color) {
        this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
        this.z = 0;
        this.width = width;
        this.dps = dps;
        this.color = color;
        this.life = 1.5;
        this.maxLife = 1.5;
        this.dx = x2 - x1;
        this.dy = y2 - y1;
        this.len2 = this.dx * this.dx + this.dy * this.dy;
        this.tickTimer = 0;
    }
    update(dt) {
        this.life -= dt;
        
        // Spawn lightning particles
        if (this.len2 > 0) {
            let spawnCount = Math.floor(Math.sqrt(this.len2) / 50); 
            for (let i = 0; i < spawnCount; i++) {
                if (Math.random() < dt * 15) {
                    let t = Math.random();
                    let px = this.x1 + this.dx * t;
                    let py = this.y1 + this.dy * t;
                    let colors = ['#ff00ff', '#ff66ff', '#cc00ff'];
                    let offsetX = MathUtils.rand(-this.width/2.5, this.width/2.5);
                    let offsetY = MathUtils.rand(-this.width/2.5, this.width/2.5);
                    particles.push(new Particle(px + offsetX, py + offsetY, 0, colors[MathUtils.randInt(0, 2)], MathUtils.rand(0.1, 0.3), 'lightning'));
                }
            }
        }

        this.tickTimer -= dt;
        if (this.len2 > 0 && this.tickTimer <= 0) {
            this.tickTimer = 0.25; // apply 25% of DPS every 0.25s
            for (let i = entities.length - 1; i >= 0; i--) {
                let e = entities[i];
                if (e instanceof Enemy && !e.dead && e.z <= 0) {
                    let t = Math.max(0, Math.min(1, ((e.x - this.x1)*this.dx + (e.y - this.y1)*this.dy) / this.len2));
                    let projX = this.x1 + t * this.dx;
                    let projY = this.y1 + t * this.dy;
                    let dist = MathUtils.distance(e.x, e.y, projX, projY);
                    if (dist < (this.width / 2) + e.radius) {
                        e.takeDamage(this.dps * 0.25, player, this.color);
                    }
                }
            }
        }
        return this.life <= 0;
    }
    draw(ctx) {
        // The trail visual is driven by spawned particles, so the base entity doesn't need to draw
    }
}

class Drop {
    constructor(x, y, forceResource = false, item = null) {
        this.x = x; this.y = y; this.z = 0;
        this.item = generateLoot(forceResource ? null : undefined);
        this.item = item || generateLoot(forceResource ? null : undefined);
        this.color = TIERS[this.item.tier].color;
        this.iconInfo = getIcon(this.item.type, this.color);
        this.hoverOffset = Math.random() * Math.PI * 2;
        
        // Physics logic: slight burst to separate
        let ang = MathUtils.rand(0, Math.PI * 2);
        let spd = MathUtils.rand(10, 40);
        this.vx = Math.cos(ang) * spd;
        this.vy = Math.sin(ang) * spd;
    }
    update(dt) {
        this.hoverOffset += dt * 3;
        
        // Repel other drops to prevent overlap
        for(let other of drops) {
            if(other !== this) {
                let d = MathUtils.distance(this.x, this.y, other.x, other.y);
                if(d < 25) { 
                    let ang = MathUtils.angle(this.x, this.y, other.x, other.y);
                    this.vx -= Math.cos(ang) * 50 * dt;
                    this.vy -= Math.sin(ang) * 50 * dt;
                }
            }
        }
        
        // Apply velocity & friction
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Auto pickup
        if(MathUtils.distance(this.x, this.y, player.x, player.y) < player.radius + 30) {
            if(pickupItem(this.item)) {
                let text = `+ ${this.item.type}`; // Truncated to Slot Type for floating text animation
                if(this.item.statLines && this.item.statLines.length > 0) {
                    text += '\n' + this.item.statLines.join('\n');
                }
                createFloatingText(text, this.x, this.y, this.color, 3.0, true);
                return true;
            }
        }
        return false;
    }
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        let s = getScale(this.z);
        let yOffset = Math.sin(this.hoverOffset) * 5;
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        
        let size = 12 * s;
        if(this.iconInfo.img.complete) {
            ctx.drawImage(this.iconInfo.img, p.x - size, p.y - size + yOffset*s, size*2, size*2);
        }
        ctx.shadowBlur = 0;
    }
}

class XpOrb {
    constructor(x, y, xpValue) {
        this.x = x; this.y = y; this.z = 0;
        this.xpValue = xpValue;
        this.radius = 4;
        let ang = MathUtils.rand(0, Math.PI * 2);
        let spd = MathUtils.rand(50, 100);
        this.vx = Math.cos(ang) * spd;
        this.vy = Math.sin(ang) * spd;
        this.life = 0;
    }
    update(dt) {
        this.life += dt;
        let dist = MathUtils.distance(this.x, this.y, player.x, player.y);
        
        // Magnetize to player
        let xpMult = (equipment['Reactor'] && equipment['Reactor'].perk === 'XP Boost') ? 1.15 : 1.0;
        if (dist < 250 * xpMult) { 
            let angle = MathUtils.angle(this.x, this.y, player.x, player.y);
            let pullSpeed = 500 - dist; 
            this.vx = Math.cos(angle) * pullSpeed;
            this.vy = Math.sin(angle) * pullSpeed;
        } else {
            this.vx *= 0.95; 
            this.vy *= 0.95;
        }
        
        this.x += this.vx * dt; 
        this.y += this.vy * dt;

        if (dist < player.radius + this.radius + 15) {
            player.gainXp(this.xpValue);
            return true; // remove orb
        }
        return false;
    }
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        let s = getScale(this.z);
        let pulse = 1 + 0.4 * Math.sin(this.life * 8);
        ctx.fillStyle = '#00ff66';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ff66';
        ctx.beginPath(); ctx.arc(p.x, p.y, this.radius * s * pulse, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class Particle {
    constructor(x, y, z, color, life = 1.0, type = 'normal') {
        this.x = x; this.y = y; this.z = z;
        this.vx = MathUtils.rand(-100, 100);
        this.vy = MathUtils.rand(-100, 100);
        this.vz = MathUtils.rand(-50, 50);
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.type = type;

        if (this.type === 'lightning') {
            this.vx = 0; this.vy = 0; this.vz = 0;
            this.points = [{x: 0, y: 0}];
            let curX = 0, curY = 0;
            let segments = MathUtils.randInt(2, 5);
            for(let i=0; i<segments; i++) {
                curX += MathUtils.rand(-15, 15);
                curY += MathUtils.rand(-15, 15);
                this.points.push({x: curX, y: curY});
            }
        }
    }
    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
        this.life -= dt;
        return this.life <= 0;
    }
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        let s = getScale(this.z);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        
        if (this.type === 'lightning') {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2 * s;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            for(let i=1; i<this.points.length; i++) {
                ctx.lineTo(p.x + this.points[i].x * s, p.y + this.points[i].y * s);
            }
            ctx.stroke();
        } else {
            ctx.beginPath(); ctx.arc(p.x, p.y, 2*s, 0, Math.PI*2); ctx.fill();
        }
        
        ctx.globalAlpha = 1.0;
    }
}

class FloatingText {
    constructor(text, x, y, color, life = 1.0, isLoot = false, isDamage = false) {
        this.text = text; this.x = x; this.y = y; this.z = 0;
        this.life = life; this.maxLife = life;
        this.color = color;
        this.isLoot = isLoot;
        this.isDamage = isDamage;
        
        if (isLoot) {
            let ang = MathUtils.rand(0, Math.PI * 2);
            let spd = MathUtils.rand(400, 700); // More aggressive outward burst
            this.vx = Math.cos(ang) * spd;
            this.vy = Math.sin(ang) * spd;
        } else if (isDamage) {
            this.vx = MathUtils.rand(-50, 50);
            this.vy = MathUtils.rand(-150, -50);
        } else {
            this.vx = 0; this.vy = -20;
        }
    }
    update(dt) {
        this.life -= dt;
        if (this.isLoot) {
            let speedSq = this.vx*this.vx + this.vy*this.vy;
            if (speedSq > 20) { // Lower threshold to allow it to glide further
                // Phase 1: Ease out (Less drag than before for further jut out)
                this.vx *= 0.88;
                this.vy *= 0.88;
                this.x += this.vx * dt;
                this.y += this.vy * dt;
            } else {
                // Phase 2: Sticky with slight shake & drift
                this.x += MathUtils.rand(-1.5, 1.5);
                this.y += MathUtils.rand(-1.5, 1.5);
                this.y -= 5 * dt; // faint upward drift
            }
        } else {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
        }
    }
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        
        let lines = this.text.split('\n');
        ctx.fillStyle = this.color;
        ctx.textAlign = 'center';
        
        // Smooth fade out in the last half-second
        let alpha = 1.0;
        if(this.life < 0.5) alpha = this.life / 0.5;
        ctx.globalAlpha = Math.max(0, alpha);
        
        for(let j=0; j<lines.length; j++) {
            // Smaller size for Loot Title, slightly bigger for damage
            let size = (this.isLoot && j > 0) ? 14 : (this.isLoot && j === 0 ? 18 : (this.isDamage ? 26 : 22));
            ctx.font = `bold ${size}px Orbitron`;
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 4;
            ctx.fillText(lines[j], p.x, p.y + j * (size + 4));
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1.0;
    }
}

class Shockwave {
    constructor(x, y, z, color, maxRadius=30) {
        this.x = x; this.y = y; this.z = z;
        this.color = color;
        this.life = 0.3;
        this.maxLife = 0.3;
        this.maxRadius = maxRadius;
    }
    update(dt) {
        this.life -= dt;
        return this.life <= 0;
    }
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        let s = getScale(this.z);
        let progress = 1 - (this.life / this.maxLife);
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = 1 - progress;
        ctx.lineWidth = 3 * s * (this.life / this.maxLife);
        ctx.beginPath(); ctx.arc(p.x, p.y, progress * this.maxRadius * s, 0, Math.PI*2); ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
}

function createParticles(x, y, z, count, color, life=1.0) {
    for(let i=0; i<count; i++) particles.push(new Particle(x, y, z, color, life));
}

function createFloatingText(text, x, y, color, life = 1.0, isLoot = false, isDamage = false) {
    floatingTexts.push(new FloatingText(text, x, y, color, life, isLoot, isDamage));
}

function spawnDrop(x, y, forceResource = false, item = null) {
    drops.push(new Drop(x, y, forceResource, item));
}

function spawnBoss() {
    entities = entities.filter(e => !(e instanceof Enemy));
    let angle = Math.random() * Math.PI * 2;
    let dist = 10 * 200; // 10 grid squares
    let boss = new Boss(player.x + Math.cos(angle) * dist, player.y + Math.sin(angle) * dist);
    entities.push(boss);
    GAME.activeBoss = boss;
}

function initMap() {
    for(let i=0; i<150; i++) {
        entities.push(new Asteroid(MathUtils.rand(-WORLD_SIZE, WORLD_SIZE), MathUtils.rand(-WORLD_SIZE, WORLD_SIZE), MathUtils.rand(20, 80)));
    }
    
    for(let i=0; i<400; i++) {
        GAME.stars.push({
            x: MathUtils.rand(-WORLD_SIZE*2, WORLD_SIZE*2),
            y: MathUtils.rand(-WORLD_SIZE*2, WORLD_SIZE*2),
            z: MathUtils.rand(1500, 4000),
            size: MathUtils.rand(1, 3.5),
            pulseSpeed: MathUtils.rand(1.0, 3.0),
            offset: MathUtils.rand(0, Math.PI*2)
        });
    }
    for(let i=0; i<30; i++) {
        GAME.clouds.push({
            x: MathUtils.rand(-WORLD_SIZE*1.5, WORLD_SIZE*1.5),
            y: MathUtils.rand(-WORLD_SIZE*1.5, WORLD_SIZE*1.5),
            z: MathUtils.rand(800, 2000),
            radius: MathUtils.rand(400, 1200),
            r: MathUtils.randInt(50, 100),
            g: MathUtils.randInt(0, 50),
            b: MathUtils.randInt(100, 200),
            alpha: MathUtils.rand(0.02, 0.08)
        });
    }
}

/** ==========================================
 * PROJECTION & RENDERING
 * ========================================== */
function getScale(z) {
    return Math.max(0.05, (FOCAL_LENGTH / (FOCAL_LENGTH + z)) * GAME.camera.zoom);
}

function project(x, y, z) {
    if (z <= -FOCAL_LENGTH) return null; // Behind camera
    let scale = getScale(z);
    let px = (x - GAME.camera.x) * scale + cw/2;
    let py = (y - GAME.camera.y) * scale + ch/2;
    // Culling
    if(px < -100 || px > cw+100 || py < -100 || py > ch+100) return null;
    return { x: px, y: py };
}

function drawGrid(ctx) {
    ctx.strokeStyle = 'rgba(26, 43, 76, 0.3)';
    ctx.lineWidth = 1;
    let gridSize = 200;
    
    // Determine visible world bounds
    let scale = getScale(0);
    let left = GAME.camera.x - (cw/2)/scale;
    let right = GAME.camera.x + (cw/2)/scale;
    let top = GAME.camera.y - (ch/2)/scale;
    let bottom = GAME.camera.y + (ch/2)/scale;

    let startX = Math.floor(left / gridSize) * gridSize;
    let startY = Math.floor(top / gridSize) * gridSize;

    ctx.beginPath();
    for(let x = startX; x < right; x += gridSize) {
        let p1 = project(x, top, 0); let p2 = project(x, bottom, 0);
        if(p1 && p2) { ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); }
    }
    for(let y = startY; y < bottom; y += gridSize) {
        let p1 = project(left, y, 0); let p2 = project(right, y, 0);
        if(p1 && p2) { ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); }
    }
    ctx.stroke();
}

/** ==========================================
 * UI & INVENTORY LOGIC
 * ========================================== */
function updateUI() {
    document.getElementById('xp-fill').style.width = `${(player.xp / player.xpNext)*100}%`;
    document.getElementById('lvl-text').innerText = `LEVEL ${player.level}`;

    document.getElementById('hp-fill').style.width = `${(player.stats.hp / player.stats.maxHp)*100}%`;
    document.getElementById('hp-text').innerText = `HP: ${Math.floor(player.stats.hp)}/${player.stats.maxHp}`;
    
    let sMax = player.stats.maxShields || 1;
    document.getElementById('shield-fill').style.width = `${(player.stats.shields / sMax)*100}%`;
    document.getElementById('shield-text').innerText = `SH: ${Math.floor(player.stats.shields)}/${player.stats.maxShields}`;
    
    document.getElementById('energy-fill').style.width = `${(player.stats.energy / player.stats.maxEnergy)*100}%`;
    document.getElementById('energy-text').innerText = `EN: ${Math.floor(player.stats.energy)}/${player.stats.maxEnergy}`;
    
    document.getElementById('fuel-fill').style.width = `${(player.stats.fuel / player.stats.maxFuel)*100}%`;
    document.getElementById('fuel-text').innerText = `FUEL: ${Math.floor(player.stats.fuel)}`;

    // Skills CD & Energy check
    for(let i=0; i<4; i++) {
        let skill = player.skills[i];
        let p = skill.cd > 0 ? (skill.cd / skill.maxCd)*100 : 0;
        document.getElementById(`cd-${i+1}`).style.height = `${p}%`;
        
        let btn = document.getElementById(`skill-${i+1}`);
        if ((skill.isFuel && player.stats.fuel < skill.cost) || (!skill.isFuel && player.stats.energy < skill.cost)) {
            btn.classList.add('no-energy');
        } else btn.classList.remove('no-energy');
    }

    let fuelCells = inventory.find(i => i && i.type === 'Fuel');
    let btnF = document.getElementById('skill-5');
    let fuelCountEl = document.getElementById('fuel-cell-count');
    if (!fuelCells) {
        btnF.classList.add('no-energy');
        if (fuelCountEl) fuelCountEl.innerText = '0';
    } else {
        btnF.classList.remove('no-energy');
        if (fuelCountEl) fuelCountEl.innerText = fuelCells.count;
    }

    renderInventory();
    renderEquipment();
    renderStats();
}

function renderInventory() {
    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';
    for (let i = 0; i < INVENTORY_SIZE; i++) {
        let item = inventory[i];
        let div = document.createElement('div');
        div.className = 'inv-slot';
        if (item) {
            let color = TIERS[item.tier].color;
            let iconInfo = getIcon(item.type, color);
            // Safely inject raw SVG instead of an image tag to prevent attribute breakout
            div.innerHTML = `
                <div class="inv-item" style="border: 2px solid ${color}; color: ${color};">
                    ${iconInfo.raw}
                </div>`;
            if(item.stackable && item.count > 1) {
                div.innerHTML += `<div class="stack-count">${item.count}</div>`;
            }
            div.onmouseover = (e) => showItemTooltip(item, e);
            div.onmouseout = hideTooltip;
            div.onclick = () => useItem(i);
            div.oncontextmenu = (e) => { e.preventDefault(); dropItem(i); };
        }
        grid.appendChild(div);
    }
}

function renderEquipment() {
    for (let key in equipment) {
        let el = document.getElementById(`eq-${key}`);
        let hudEl = document.getElementById(`hud-eq-${key}`);
        let item = equipment[key];
        if (item) {
            el.innerHTML = `<div class="slot-name">${key}</div><div class="slot-content tier-${item.tier}">${item.name}</div>`;
            
            let color = TIERS[item.tier].color;
            let iconInfo = getIcon(item.type, color);
            hudEl.innerHTML = `<div style="color: ${color}; width:100%; height:100%; display:flex; align-items:center; justify-content:center;">${iconInfo.raw}</div>`;
            hudEl.onmouseover = (e) => showEquipTooltip(key, e);
            hudEl.onmouseout = hideTooltip;
        } else {
            el.innerHTML = `<div class="slot-name">${key}</div><div class="slot-content">Empty</div>`;
            hudEl.innerHTML = `<div style="font-size:8px; color:#555; text-align:center;">${key}</div>`;
            hudEl.onmouseover = null;
        }
    }
}

function renderStats() {
    const container = document.getElementById('stats-list-container');
    
    function getStatHtml(key, name, desc, formatFn = val => val) {
        let bd = player.statBreakdown[key];
        let val = player.stats[key];
        // Use double quotes for style attributes inside the tooltip
        let tooltip = `<b>${name}</b><br><span style="color:#ccc; font-size:12px;">${desc}</span><br><br>Total: <span style="color:var(--accent)">${formatFn(val)}</span><br>Base: ${formatFn(bd.base)}<br>`;
        for(let i of bd.items) {
            let displayVal = typeof i.val === 'object' ? i.val : (typeof i.val === 'string' ? i.val : formatFn(i.val));
            let cleanDisplayVal = typeof displayVal === 'object' ? `${displayVal.min}-${displayVal.max}` : displayVal;
            tooltip += `<span style="color:#0f0">+${cleanDisplayVal} from ${i.name}</span><br>`;
        }
        // Properly escape double quotes for HTML attribute, and single quotes for JS evaluation
        tooltip = tooltip.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        return `<div class="stat-row" onmouseover="showTooltip('Stat Details', '', '${tooltip}', event)" onmouseout="hideTooltip()">
                    <span>${name}</span><span class="stat-val">${formatFn(val)}</span>
                </div>`;
    }

    container.innerHTML = `
        ${getStatHtml('damage', 'Damage', 'Base damage for your weapons and abilities.', v => v.min + '-' + v.max)}
        ${getStatHtml('fireRate', 'Fire Rate', 'Increases the attack speed of your Primary Weapon.', v => Math.round(v) + '%')}
        ${getStatHtml('maxHp', 'Max HP', 'Maximum Hull Integrity. If it reaches 0, you explode.')}
        ${getStatHtml('armorRating', 'Armor Rating', 'Increases Damage Reduction against incoming attacks.')}
        <div class="stat-row" onmouseover="showTooltip('Damage Reduction', 'Percentage of incoming hull damage mitigated.', '', event)" onmouseout="hideTooltip()">
            <span>Damage Reduction</span><span class="stat-val">${(player.stats.damageReduction * 100).toFixed(1)}%</span>
        </div>
        ${getStatHtml('maxShields', 'Shields', 'Energy barrier that absorbs damage before Hull.')}
        ${getStatHtml('shieldRegen', 'Shield Regen', 'Amount of Shield recovered per second.', v => v + '/s')}
        ${getStatHtml('maxEnergy', 'Energy', 'Maximum Reactor Energy for using skills.')}
        ${getStatHtml('energyRegen', 'Energy Regen', 'Amount of Energy recovered per second.', v => v + '/s')}
        ${getStatHtml('maxSpeed', 'Max Speed', 'Top speed of your spacecraft.')}
        ${getStatHtml('acceleration', 'Acceleration', 'How fast your ship reaches top speed (Thrust).')}
    `;
}

function pickupItem(newItem) {
    // Stackable check
    if (newItem.stackable) {
        let existing = inventory.find(i => i && i.name === newItem.name);
        if (existing) { existing.count += newItem.count; updateUI(); return true; }
    }
    
    // Auto-Equip if slot empty
    if (!newItem.stackable && SLOT_TYPES.includes(newItem.type) && !equipment[newItem.type]) {
        equipment[newItem.type] = newItem;
        player.updateStats();
        return true;
    }

    // Otherwise place in empty slot
    let emptyIdx = inventory.findIndex(i => i === null);
    if (emptyIdx !== -1) {
        inventory[emptyIdx] = newItem;
        updateUI();
        return true;
    }
    return false; // inv full
}

function useItem(index) {
    let item = inventory[index];
    if(!item) return;

    if (item.type === 'Fuel') {
        playSound('sounds/impactMetal_004.ogg');
        player.stats.fuel = Math.min(player.stats.maxFuel, player.stats.fuel + 5);
        item.count--;
        if(item.count <= 0) inventory[index] = null;
        updateUI();
        if(inventory[index] === null) hideTooltip();
        return;
    }

    if (SLOT_TYPES.includes(item.type)) {
        // Equip
        let currentEq = equipment[item.type];
        equipment[item.type] = item;
        inventory[index] = currentEq; // swap
        player.updateStats();
        hideTooltip();
    }
}

function unequipItem(slotType) {
    let item = equipment[slotType];
    if(!item) return;
    let emptyIdx = inventory.findIndex(i => i === null);
    if (emptyIdx !== -1) {
        inventory[emptyIdx] = item;
        equipment[slotType] = null;
        player.updateStats();
        hideTooltip();
    }
}

function dropItem(index) {
    let item = inventory[index];
    if(item) {
        inventory[index] = null;
        pickupItem({
            id: Math.random().toString(36).substr(2, 9),
            name: 'Raw Minerals',
            type: 'Resource',
            tier: 0,
            stackable: true,
            count: item.tier + 1,
            desc: 'Can be traded or scrapped.'
        });
        updateUI();
        hideTooltip();
    }
}

// Tooltips
const ttContainer = document.getElementById('tooltip-container');
const ttEq = document.getElementById('tooltip-equipped');

function showTooltip(title, desc, statsHtml, e) {
    document.getElementById('tt-title').innerText = title;
    document.getElementById('tt-type').innerText = '';
    document.getElementById('tt-desc').innerHTML = desc;
    document.getElementById('tt-stats').innerHTML = statsHtml;
    ttEq.style.display = 'none';
    positionTooltip(e);
}
function showItemTooltip(item, e) {
    document.getElementById('tt-title').innerText = item.name;
    document.getElementById('tt-title').className = `tt-title tier-${item.tier}`;
    document.getElementById('tt-type').innerText = `iLvl ${item.itemLevel || 1} • ${item.type}`;
    document.getElementById('tt-desc').innerHTML = item.desc;
    
    let eqItem = SLOT_TYPES.includes(item.type) ? equipment[item.type] : null;
    let statsHtml = [];
    if (item.stats) {
        for (let stat in item.stats) {
            let val = item.stats[stat];
            let isObj = typeof val === 'object';
            
            let deltaStr = '';
            if (isObj) {
                let deltaMin = eqItem && eqItem.stats && eqItem.stats[stat] ? val.min - eqItem.stats[stat].min : val.min;
                let deltaMax = eqItem && eqItem.stats && eqItem.stats[stat] ? val.max - eqItem.stats[stat].max : val.max;
                if (deltaMin > 0 || deltaMax > 0) deltaStr = ` <span style="color:#0f0">(+${deltaMin > 0 ? deltaMin : 0}-${deltaMax > 0 ? deltaMax : 0})</span>`;
                else if (deltaMin < 0 || deltaMax < 0) deltaStr = ` <span style="color:#f00">(${deltaMin}-${deltaMax})</span>`;
            } else {
                let delta = eqItem && eqItem.stats && eqItem.stats[stat] ? val - eqItem.stats[stat] : val;
                if (delta > 0) deltaStr = ` <span style="color:#0f0">(+${delta})</span>`;
                else if (delta < 0) deltaStr = ` <span style="color:#f00">(${delta})</span>`;
            }

            let str = item.statLines.find(l => l.includes(isObj ? `${val.min}-${val.max}` : val) && !l.startsWith('[PERK]'));
            if (!str) str = isObj ? `+${val.min}-${val.max} ${stat}` : `+${val} ${stat}`;
            str += deltaStr;
            statsHtml.push(str);
        }
    }

    if (eqItem && eqItem.stats) {
        for (let stat in eqItem.stats) {
            if (!item.stats || item.stats[stat] === undefined) {
                let eqVal = eqItem.stats[stat];
                let isObj = typeof eqVal === 'object';
                let eqStr = eqItem.statLines?.find(l => l.includes(isObj ? `${eqVal.min}-${eqVal.max}` : eqVal) && !l.startsWith('[PERK]'));
                if (!eqStr) eqStr = isObj ? `+${eqVal.min}-${eqVal.max} ${stat}` : `+${eqVal} ${stat}`;
                
                let lostStr = eqStr.replace(/^\+/, '-');
                statsHtml.push(`<span style="color:rgba(255, 0, 0, 0.5); font-style:italic;">${lostStr}</span>`);
            }
        }
    }

    if (item.perk) {
        let perkLine = item.statLines.find(l => l.startsWith('[PERK]'));
        if(perkLine) statsHtml.push(`<span style="color:#f82">${perkLine}</span>`);
    } else if (item.statLines && !item.stats) {
        statsHtml.push(...item.statLines);
    }
    document.getElementById('tt-stats').innerHTML = statsHtml.join('<br>');
    
    if (eqItem && item !== eqItem) {
        ttEq.style.display = 'block';
        document.getElementById('tt-eq-title').innerText = eqItem.name + ' (EQUIPPED)';
        document.getElementById('tt-eq-title').className = `tt-title tier-${eqItem.tier}`;
        document.getElementById('tt-eq-type').innerText = `iLvl ${eqItem.itemLevel || 1} • ${eqItem.type}`;
        document.getElementById('tt-eq-desc').innerHTML = eqItem.desc;
        let eqStatsHtml = eqItem.statLines ? [...eqItem.statLines] : [];
        if(eqItem.perk) {
            let pIdx = eqStatsHtml.findIndex(l => l.startsWith('[PERK]'));
            if(pIdx !== -1) eqStatsHtml[pIdx] = `<span style="color:#f82">${eqStatsHtml[pIdx]}</span>`;
        }
        document.getElementById('tt-eq-stats').innerHTML = eqStatsHtml.join('<br>');
    } else {
        ttEq.style.display = 'none';
    }
    
    positionTooltip(e);
}
function showEquipTooltip(slot, e) {
    let item = equipment[slot];
    if(item) showItemTooltip(item, e);
}
function showSkillTooltip(id, e) {
    let skill = player.skills[id-1];
    let dmgStr = `${player.stats.damage.min}-${player.stats.damage.max}`;
    let dmg2Str = `${player.stats.damage.min * 2}-${player.stats.damage.max * 2}`;
    let dmg20Str = `${player.stats.damage.min * 20}-${player.stats.damage.max * 20}`;

    let descs = [
        `Fires a projectile dealing <span style="color:#0f0">${dmgStr}</span> damage.`,
        `Releases an electromagnetic pulse, dealing <span style="color:#0f0">${dmg2Str}</span> damage and stunning nearby enemies.<br>Radius: 270 units`,
        `Engages warp thrusters to dash toward the cursor, leaving a plasma trail dealing <span style="color:#0f0">${dmgStr}</span> damage per second.<br>Width: 170 units`,
        `Launches a singularity core that collapses into a black hole, sucking in enemies before exploding for <span style="color:#0f0">${dmg20Str}</span> damage.`
    ];
    showTooltip(skill.name, descs[id-1], `Cost: ${skill.cost} ${skill.isFuel ? 'Fuel' : 'Energy'}<br>Cooldown: ${skill.maxCd.toFixed(2)}s`, e);
}
function hideTooltip() { ttContainer.style.opacity = 0; }
function positionTooltip(e) {
    ttContainer.style.opacity = 1;
    let x = e.clientX + 15; let y = e.clientY + 15;
    if(x + ttContainer.offsetWidth > window.innerWidth) x = e.clientX - ttContainer.offsetWidth - 15;
    if(y + ttContainer.offsetHeight > window.innerHeight) y = e.clientY - ttContainer.offsetHeight - 15;
    ttContainer.style.left = x + 'px'; ttContainer.style.top = y + 'px';
}

function toggleInventory() {
    let el = document.getElementById('char-sheet');
    if(GAME.state === 'PLAYING') {
        GAME.state = 'INVENTORY';
        el.style.display = 'flex';
        updateUI();
    } else if (GAME.state === 'INVENTORY') {
        GAME.state = 'PLAYING';
        el.style.display = 'none';
        hideTooltip();
    }
}

function die() {
    playSound('sounds/explosionCrunch_003.ogg');
    GAME.state = 'DEAD';
    document.getElementById('game-over').style.display = 'flex';
}

/** ==========================================
 * MAIN GAME LOOP & LOGIC
 * ========================================== */
function useSkill(index) {
    let skill = player.skills[index];
    
    if (index === 3 && player.activeSingularity) {
        player.activeSingularity.timer = 0; // detonate early
        skill.cd = skill.maxCd; // start cd early
        player.activeSingularity = null;
        updateUI();
        return;
    }

    if(skill.cd > 0) return;
    if (index === 3 && player.activeSingularity) return; // safety against double cast logic mismatch
    
    if(skill.isFuel) {
        if(player.stats.fuel < skill.cost) return;
        player.stats.fuel -= skill.cost;
    } else {
        if(player.stats.energy < skill.cost) return;
        player.stats.energy -= skill.cost;
    }
    
    if (index !== 3) skill.cd = skill.maxCd; // Singularity sets CD on detonate
    
    let angle = MathUtils.angle(player.x, player.y, GAME.mouse.worldX, GAME.mouse.worldY);
    
    if(index === 0) { // Pulse Blaster
        let hasTriple = (equipment['Primary Weapon'] && equipment['Primary Weapon'].perk === 'Triple Shot');
        if (hasTriple) {
            playSound('sounds/laserLarge_001.ogg');
            projectiles.push(new Projectile(player.x, player.y, angle, 600, getDamage(player), true, varColor('--accent'), player));
            projectiles.push(new Projectile(player.x, player.y, angle - Math.PI/8, 600, getDamage(player), true, varColor('--accent'), player));
            projectiles.push(new Projectile(player.x, player.y, angle + Math.PI/8, 600, getDamage(player), true, varColor('--accent'), player));
        } else {
            playSound('laserSmall_004.ogg');
            projectiles.push(new Projectile(player.x, player.y, angle, 600, getDamage(player), true, varColor('--accent'), player));
        }
    } 
    else if(index === 1) { // EMP05
        playSound('sounds/spaceEngine_002.ogg');
        createParticles(player.x, player.y, 0, 70, varColor('--shield'));
        shockwaves.push(new Shockwave(player.x, player.y, 0, varColor('--shield'), 270));
        for(let e of entities) {
            // Reduced 40% (450 -> 270)
            if(e instanceof Enemy && !e.dead && MathUtils.distance(player.x, player.y, e.x, e.y) < 270) {
                e.takeDamage(getDamage(player) * 2, player, varColor('--shield'));
                e.stunTimer = 3.0;
            }
        }
    }
    else if(index === 2) { // Warp Dash
        playSound('sounds/doorOpen_002.ogg');
        // Reduced 40% (500 -> 300)
        let dist = Math.min(300, MathUtils.distance(player.x, player.y, GAME.mouse.worldX, GAME.mouse.worldY));
        let oldX = player.x, oldY = player.y;
        player.x += Math.cos(angle) * dist;
        player.y += Math.sin(angle) * dist;
        
        warpTrails.push(new WarpTrail(oldX, oldY, player.x, player.y, 170, getDamage(player), varColor('--energy')));
    }
    else if(index === 3) { // Singularity
        playSound('sounds/engineCircular_000.ogg');
        player.activeSingularity = new Singularity(player.x, player.y, GAME.mouse.worldX, GAME.mouse.worldY);
        entities.push(player.activeSingularity);
    }
    updateUI();
}

function update(dt) {
    if(GAME.state !== 'PLAYING') return;

    if (equipment['Hull'] && equipment['Hull'].perk === 'Repairis') {
        player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + (player.stats.maxHp * 0.01) * dt);
        player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + (player.stats.maxHp * 0.005) * dt);
    }

    // --- Player Movement & Physics ---
    let ax = 0, ay = 0;
    if(GAME.keys.w) ay -= player.stats.acceleration;
    if(GAME.keys.s) ay += player.stats.acceleration;
    if(GAME.keys.a) ax -= player.stats.acceleration;
    if(GAME.keys.d) ax += player.stats.acceleration;

    player.vx += ax * dt;
    player.vy += ay * dt;
    player.vx *= player.stats.friction;
    player.vy *= player.stats.friction;
    
    let speed = Math.hypot(player.vx, player.vy);
    if(speed > player.stats.maxSpeed) {
        let ratio = player.stats.maxSpeed / speed;
        player.vx *= ratio; player.vy *= ratio;
    }

    // Dodge
    if(GAME.keys[' '] && player.timers.dodge <= 0) {
        if(ax !== 0 || ay !== 0) {
            let moveAngle = Math.atan2(ay, ax);
            player.vx += Math.cos(moveAngle) * 800;
            player.vy += Math.sin(moveAngle) * 800;
            player.timers.dodge = 2.0; // cooldown
            createParticles(player.x, player.y, 0, 20, varColor('--accent'));
        }
    }
    if(player.timers.dodge > 0) player.timers.dodge -= dt;

    // Apply movement
    if(player.stats.fuel > 0 || speed < 50) {
        player.x += player.vx * dt;
        player.y += player.vy * dt;
        // World Bounds
        player.x = MathUtils.clamp(player.x, -WORLD_SIZE, WORLD_SIZE);
        player.y = MathUtils.clamp(player.y, -WORLD_SIZE, WORLD_SIZE);
    } else {
        // Out of fuel, severely crippled movement
        player.x += (player.vx * 0.1) * dt;
        player.y += (player.vy * 0.1) * dt;
    }

    // Facing angle
    player.angle = MathUtils.angle(player.x, player.y, GAME.mouse.worldX, GAME.mouse.worldY);

    // Camera follow
    GAME.camera.x = MathUtils.lerp(GAME.camera.x, player.x, dt * 5);
    GAME.camera.y = MathUtils.lerp(GAME.camera.y, player.y, dt * 5);

    // Mouse World coords
    let scale = getScale(0);
    GAME.mouse.worldX = (GAME.mouse.x - cw/2) / scale + GAME.camera.x;
    GAME.mouse.worldY = (GAME.mouse.y - ch/2) / scale + GAME.camera.y;

    // Auto attacks (Left Click)
    if(GAME.mouse.left) useSkill(0);
    
    // Active Skills
    if(GAME.keys['1']) useSkill(0);
    if(GAME.keys['2']) useSkill(1);
    if(GAME.keys['3']) useSkill(2);
    if(GAME.keys['4']) useSkill(3);

    // Damage Intensity Decay
    if(player.damageIntensity > 0) {
        player.damageIntensity = Math.max(0, player.damageIntensity - dt);
    }

    // --- Resource Regen & Drain ---
    if(speed > 10) {
        let eff = (equipment['Engine'] && equipment['Engine'].perk === 'Fuel Efficiency') ? 0.75 : 1.0;
        player.stats.fuel -= (speed / player.stats.maxSpeed) * 15 * eff * dt;
        if(player.stats.fuel < 0) player.stats.fuel = 0;
        // Engine particles
        if(Math.random() < 0.5) {
            let backX = player.x - Math.cos(player.angle)*15;
            let backY = player.y - Math.sin(player.angle)*15;
            createParticles(backX, backY, 0, 1, varColor('--fuel'), 0.5);
        }
    }
    
    player.stats.energy = Math.min(player.stats.maxEnergy, player.stats.energy + player.stats.energyRegen * dt);
    
    if(player.timers.shieldRegen <= 0) {
        player.stats.shields = Math.min(player.stats.maxShields, player.stats.shields + player.stats.shieldRegen * dt);
    } else {
        player.timers.shieldRegen -= dt;
        if(player.timers.shieldRegen <= 0 && player.stats.shields < player.stats.maxShields) {
            playSound('sounds/forceField_002.ogg');
        }
    }

    for(let i=0; i<4; i++) {
        if(player.skills[i].cd > 0) player.skills[i].cd -= dt;
    }

    // --- Entity Updates ---
    for(let i=entities.length-1; i>=0; i--) {
        if(entities[i].dead) {
            entities.splice(i, 1);
        } else if(entities[i].update(dt)) {
            entities.splice(i, 1);
        }
    }
    for(let i=projectiles.length-1; i>=0; i--) {
        if(projectiles[i].update(dt)) projectiles.splice(i, 1);
    }
    for(let i=drops.length-1; i>=0; i--) {
        if(drops[i].update(dt)) drops.splice(i, 1);
    }
    for(let i=xpOrbs.length-1; i>=0; i--) {
        if(xpOrbs[i].update(dt)) xpOrbs.splice(i, 1);
    }
    for(let i=particles.length-1; i>=0; i--) {
        if(particles[i].update(dt)) particles.splice(i, 1);
    }
    for(let i=shockwaves.length-1; i>=0; i--) {
        if(shockwaves[i].update(dt)) shockwaves.splice(i, 1);
    }
    for(let i=warpTrails.length-1; i>=0; i--) {
        if(warpTrails[i].update(dt)) warpTrails.splice(i, 1);
    }
    for(let i=floatingTexts.length-1; i>=0; i--) {
        floatingTexts[i].update(dt);
        if(floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
    }

// Enemy Spawning
if (!GAME.activeBoss && Math.random() < dt * 0.5) {
    let angle = Math.random() * Math.PI * 2;
    let dist = MathUtils.rand(800, 1200);
    entities.push(new Enemy(player.x + Math.cos(angle) * dist, player.y + Math.sin(angle) * dist));
}

// Map chunk discovery for minimap
let chunkX = Math.floor(player.x / 200);
let chunkY = Math.floor(player.y / 200);
GAME.fowMap.set(`${chunkX},${chunkY}`, true);

updateUI();
}

function draw() {
    ctx.fillStyle = varColor('--bg');
    ctx.fillRect(0, 0, cw, ch);
    
    // Draw Stars
    let time = Date.now() / 1000;
    for(let s of GAME.stars) {
        let p = project(s.x, s.y, s.z);
        if(p) {
            let alpha = 0.3 + 0.4 * Math.sin(time * s.pulseSpeed + s.offset);
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            let scale = getScale(s.z);
            ctx.beginPath(); ctx.arc(p.x, p.y, s.size * scale, 0, Math.PI*2); ctx.fill();
        }
    }

    // Draw Clouds
    for(let c of GAME.clouds) {
        let p = project(c.x, c.y, c.z);
        if(p) {
            let scale = getScale(c.z);
            let rad = c.radius * scale;
            let grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
            grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${c.alpha})`);
            grad.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI*2); ctx.fill();
        }
    }

    drawGrid(ctx);

    // Draw order: Z-sorting
    let allRenderables = [
        ...entities, ...drops, ...xpOrbs, ...particles, ...projectiles, ...shockwaves, ...warpTrails,
        { isPlayer: true, x: player.x, y: player.y, z: 0 }
    ].sort((a, b) => b.z - a.z); // draw deep space first

    for(let obj of allRenderables) {
        if(obj.isPlayer) {
            let p = project(player.x, player.y, 0);
            if(p) {
                let s = getScale(0);
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.scale(s, s);
                
                // Ability Range Faint Overlays (Under ship, stationary relative to ship orientation)
                ctx.lineWidth = 1;

                // Pulse Blaster Range (Skill 1) - 6 Grid Squares = 1200 units
                ctx.strokeStyle = 'rgba(0, 210, 255, 0.05)';
                ctx.beginPath(); ctx.arc(0,0,1200,0,Math.PI*2); ctx.stroke();

                // EMP (Skill 2) - reduced 40% to 270
                ctx.strokeStyle = 'rgba(51, 204, 255, 0.1)';
                ctx.beginPath(); ctx.arc(0,0,270,0,Math.PI*2); ctx.stroke();
                
                // Warp Dash (Skill 3 limit) - reduced 40% to 300
                ctx.strokeStyle = 'rgba(153, 51, 255, 0.08)';
                ctx.beginPath(); ctx.arc(0,0,300,0,Math.PI*2); ctx.stroke();
                
                // Singularity Placement Indicator - reduced 40% to 360
                ctx.strokeStyle = 'rgba(255, 0, 85, 0.05)';
                ctx.beginPath(); ctx.arc(0,0,360,0,Math.PI*2); ctx.stroke();

                ctx.rotate(player.angle);
                
                // Ship Body
                ctx.fillStyle = '#111';
                ctx.strokeStyle = varColor('--accent');
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(20, 0); ctx.lineTo(-15, 15); ctx.lineTo(-10, 0); ctx.lineTo(-15, -15);
                ctx.closePath();
                ctx.fill(); ctx.stroke();
                
                // Shields
                if(player.stats.shields > 0) {
                    ctx.strokeStyle = `rgba(51, 204, 255, ${0.2 + (player.stats.shields/player.stats.maxShields)*0.5})`;
                    ctx.beginPath(); ctx.arc(0,0,25,0,Math.PI*2); ctx.stroke();
                }
                ctx.restore();
            }
        } else {
            obj.draw(ctx);
        }
    }

    // Floating Text (Always on top)
    for(let ft of floatingTexts) {
        ft.draw(ctx);
    }

    // Danger Screen Glow Overlay
    if (player.damageIntensity > 0.1) {
        let alpha = Math.min(0.6, player.damageIntensity * 0.5);
        let grad = ctx.createRadialGradient(cw/2, ch/2, Math.min(cw,ch)*0.2, cw/2, ch/2, Math.max(cw,ch)*0.8);
        grad.addColorStop(0, 'rgba(255,0,0,0)');
        grad.addColorStop(1, `rgba(255,0,0,${alpha})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0,0,cw,ch);
    }

    if (GAME.activeBoss && !project(GAME.activeBoss.x, GAME.activeBoss.y, GAME.activeBoss.z)) {
        let angleToBoss = MathUtils.angle(player.x, player.y, GAME.activeBoss.x, GAME.activeBoss.y);
        let screenX = cw/2 + Math.cos(angleToBoss) * (cw/2 - 40);
        let screenY = ch/2 + Math.sin(angleToBoss) * (ch/2 - 40);
        screenX = MathUtils.clamp(screenX, 40, cw - 40);
        screenY = MathUtils.clamp(screenY, 40, ch - 40);

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(angleToBoss + Math.PI/2);
        let icon = getIcon('BossSkull', '#ff0000');
        if (icon.img.complete) {
            ctx.drawImage(icon.img, -15, -15, 30, 30);
        }
        ctx.restore();
    }

    drawMinimap();
}

function drawMinimap() {
    let w = miniCanvas.width = 200;
    let h = miniCanvas.height = 200;
    
    miniCtx.fillStyle = '#050508';
    miniCtx.fillRect(0,0,w,h);
    
    let mapScale = w / (WORLD_SIZE * 2);
    
    // Draw FOW & Radar
    miniCtx.fillStyle = 'rgba(255,255,255,0.1)';
    for(let [key, val] of GAME.fowMap) {
        let parts = key.split(',');
        let cx = (parseInt(parts[0]) * 200 + WORLD_SIZE) * mapScale;
        let cy = (parseInt(parts[1]) * 200 + WORLD_SIZE) * mapScale;
        miniCtx.fillRect(cx, cy, 200*mapScale, 200*mapScale);
    }
    
    // Entities on minimap
    for(let e of entities) {
        let mx = (e.x + WORLD_SIZE) * mapScale;
        let my = (e.y + WORLD_SIZE) * mapScale;
        if(mx<0 || mx>w || my<0 || my>h) continue;
        
        if(e instanceof Asteroid) { miniCtx.fillStyle = '#555'; miniCtx.fillRect(mx-1, my-1, 2, 2); }
        if(e instanceof Enemy) { miniCtx.fillStyle = '#f00'; miniCtx.fillRect(mx-1, my-1, 3, 3); }
    }
    
    // Player
    let px = (player.x + WORLD_SIZE) * mapScale;
    let py = (player.y + WORLD_SIZE) * mapScale;
    miniCtx.fillStyle = varColor('--accent');
    miniCtx.beginPath(); miniCtx.arc(px, py, 3, 0, Math.PI*2); miniCtx.fill();
    
    // Radar circle
    miniCtx.strokeStyle = 'rgba(0, 210, 255, 0.3)';
    miniCtx.beginPath(); miniCtx.arc(px, py, 800 * mapScale, 0, Math.PI*2); miniCtx.stroke();
}

function varColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function loop(timestamp) {
    let dt = (timestamp - GAME.lastTime) / 1000;
    if(dt > 0.1) dt = 0.1; // cap delta time
    GAME.lastTime = timestamp;
    
    update(dt);
    draw();
    
    requestAnimationFrame(loop);
}

/** ==========================================
 * INPUT LISTENERS
 * ========================================== */
window.addEventListener('keydown', e => {
    let k = e.key.toLowerCase();
    if(GAME.keys.hasOwnProperty(k)) GAME.keys[k] = true;
    if(k === 'i' || k === 'c') toggleInventory();
    if(k === 'f') useFuelCell();
});
window.addEventListener('keyup', e => {
    let k = e.key.toLowerCase();
    if(GAME.keys.hasOwnProperty(k)) GAME.keys[k] = false;
});
window.addEventListener('mousemove', e => {
    GAME.mouse.x = e.clientX; GAME.mouse.y = e.clientY;
});
window.addEventListener('mousedown', e => {
    if(e.button === 0 && GAME.state === 'PLAYING') GAME.mouse.left = true;
});
window.addEventListener('mouseup', e => {
    if(e.button === 0) GAME.mouse.left = false;
});
window.addEventListener('wheel', e => {
    if(GAME.state === 'PLAYING') {
        GAME.camera.zoom -= Math.sign(e.deltaY) * 0.1;
        GAME.camera.zoom = MathUtils.clamp(GAME.camera.zoom, 0.3, 2.0);
    }
});

function useFuelCell() {
    let idx = inventory.findIndex(i => i && i.type === 'Fuel');
    if (idx !== -1) {
        playSound('sounds/impactMetal_004.ogg');
        let item = inventory[idx];
        player.stats.fuel = Math.min(player.stats.maxFuel, player.stats.fuel + 12);
        item.count--;
        if (item.count <= 0) inventory[idx] = null;
        updateUI();
    }
}

// Setup
player.updateStats();
initMap();
player.stats.fuel = player.stats.maxFuel; // Start full
inventory[0] = {
    id: 'start-fuel',
    name: 'Fuel Cell',
    type: 'Fuel',
    tier: 0,
    itemLevel: 1,
    stackable: true,
    count: 3,
    desc: 'Restores 12 Fuel on use.'
};
updateUI();
requestAnimationFrame(t => { GAME.lastTime = t; loop(t); });