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
    maxSpeed: 200, acceleration: 600, friction: 0.95,
    damage: { min: 9, max: 13 }, fireRate: 100, critChance: 5, critRating: 0
};

const player = {
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0,
    radius: 15,
    angle: 0,
    damageIntensity: 0, // Used for screen red glow
    activeSingularity: null,
    activeWhipBeam: null,
    level: 1,
    xp: 0,
    xpNext: 100,
    stats: { ...BASE_STATS },
    statBreakdown: {},
    augments: {},
    timers: { dodge: 0, shieldRegen: 0, repairis: 0, immunity: 0, mycelialDebuff: 0, dashActive: 0 },
    skills: [
        { id: 1, name: 'Pulse Blaster', cost: 2, cd: 0, maxCd: 0.25, type: 'projectile' },
        { id: 2, name: 'EMP Blast', cost: 20, cd: 0, maxCd: 5.0, type: 'aoe' },
        { id: 3, name: 'Warp Dash', cost: 15, cd: 0, maxCd: 3.0, type: 'dash', isFuel: true },
        { id: 4, name: 'Singularity Torpedo', cost: 40, cd: 0, maxCd: 10.0, type: 'special' }
    ],
    
    gainXp(amount) {
        let xpMult = (equipment['Reactor'] && equipment['Reactor'].perk === 'XP Boost') ? 1.15 : 1.0;
        this.xp += amount * xpMult;
        while (this.xp >= this.xpNext) {
            this.xp -= this.xpNext;
            this.level++;
            this.xpNext = 100 * this.level; // Requires more total XP linearly
            
            // Level Up Rewards
            // Level Up Rewards (Base Stats Scaling)
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
            triggerLevelUp();
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
        let totalCritRating = 0;

        // Add equip modifiers
        for (let key in equipment) {
            let item = equipment[key];
            if (item && item.stats) {
                for (let stat in item.stats) {
                    if (stat === 'fireRateRating') {
                        totalFireRateRating += item.stats[stat];
                        this.statBreakdown['fireRate'].items.push({ name: item.name, val: item.stats[stat] + ' Rating' });
                    } else if (stat === 'critRating') {
                        totalCritRating += item.stats[stat];
                        this.statBreakdown['critChance'].items.push({ name: item.name, val: item.stats[stat] + ' Rating' });
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

        let critBonus = totalCritRating > 0 ? getCritBonus(totalCritRating, this.level) : 0;
        this.stats.critChance = BASE_STATS.critChance + critBonus;

        this.stats.damageReduction = this.stats.armorRating > 0 ? getArmorReduction(this.stats.armorRating, this.level) : 0;

        // Maintain ratios
        this.stats.hp = Math.min(this.stats.maxHp, this.stats.maxHp * oldHpRatio);
        this.stats.shields = Math.min(this.stats.maxShields, this.stats.maxShields * oldShieldRatio);
        this.stats.energy = Math.min(this.stats.maxEnergy, this.stats.maxEnergy * oldEnRatio);
        
        this.skills[0].cost = Math.floor(this.stats.maxEnergy * 0.025); //pulse blaster base cost.
        this.skills[1].cost = Math.floor(this.stats.maxEnergy * 0.20);
        this.skills[3].cost = Math.floor(this.stats.maxEnergy * 0.40);
        // Base 0.3s cooldown, reduced by the fire rate bonus percentage
        this.skills[0].maxCd = 0.3 * (1 - fireRateBonus);
        
        updateUI();
    },
    
    takeDamage(amount, source) {
        if (this.timers.immunity > 0) {
            createFloatingText("IMMUNE", this.x, this.y, '#fff', 1.0, false, true);
            return;
        }
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
            let reflectPct = equipment['Shields'].upgradedPerk ? 50 : equipment['Shields'].perkReflect;
            source.takeDamage(amount * (reflectPct / 100), this);
        }
        
        let oldHp = this.stats.hp;
        if (actualDamage > 0) {
            this.stats.hp -= actualDamage;
            createParticles(this.x, this.y, 0, 10, '#ff3366');
            
            // Damage text over character
            createFloatingText("-" + Math.floor(actualDamage), this.x, this.y, '#ff3366', 1.5, false, true);
            
            // Low HP sound trigger (triggers upon dropping to 25% or less)
            if (this.stats.hp > 0 && this.stats.hp <= this.stats.maxHp * 0.25 && oldHp > this.stats.maxHp * 0.25) {
                playSound('https://cdn.jsdelivr.net/gh/diploidian/void_drifter@main/sounds/spaceEngine_000.ogg');
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

AUGMENT_POOL.forEach(a => {
    player.augments[a.id] = { count: 0, totalValue: 0, ref: a };
});

function triggerLevelUp() {
    GAME.state = 'PAUSED';
    let options = [];
    let pool = [...AUGMENT_POOL];
    for (let i = 0; i < 3; i++) {
        let idx = MathUtils.randInt(0, pool.length - 1);
        let aug = pool.splice(idx, 1)[0];
        let val = aug.roll();
        options.push({ aug, val });
    }
    if (typeof renderAugmentUI === 'function') renderAugmentUI(options);
}