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
    maxHp: 100, hp: 100, armorRating: 0, damageReduction: 0, hpRegen: 0,
    maxShields: 50, shields: 50, shieldRegen: 5, shieldRegenPersistent: 0,
    maxEnergy: 100, energy: 100, energyRegen: 10,
    maxFuel: 100, fuel: 100, fuelEfficiency: 1.0,
    maxSpeed: 200, acceleration: 600, friction: 0.95,
    damage: { min: 9, max: 13 }, fireRate: 100, critChance: 5, critRating: 0
};

const AUGMENT_POOL = [
    {
        id: 'thrusterTuning', name: 'Thruster Tuning', color: '#00d2ff',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 22l10-5 10 5L12 2z"/></svg>',
        roll: () => MathUtils.randInt(1, 4), desc: (v) => `+${v} Max Speed`,
        effect: (v) => { BASE_STATS.maxSpeed += v; }
    },
    {
        id: 'overclockedCapacitors', name: 'Overclocked Capacitors', color: '#9933ff',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
        roll: () => MathUtils.rand(0.1, 0.5), desc: (v) => `+${v.toFixed(2)} Energy Regen/sec`,
        effect: (v) => { BASE_STATS.energyRegen += v; }
    },
    {
        id: 'reinforcedCalibrations', name: 'Reinforced Calibrations', color: '#ff3366',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>',
        roll: () => MathUtils.randInt(1, 4), desc: (v) => `+${v} Min & Max Damage`,
        effect: (v) => { 
            if(typeof BASE_STATS.damage === 'object') { BASE_STATS.damage.min += v; BASE_STATS.damage.max += v; }
            else { BASE_STATS.damage += v; }
        }
    },
    {
        id: 'rapidFireRelay', name: 'Rapid-Fire Relay', color: '#ffcc00',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
        roll: () => Math.max(1, Math.floor(10 * (1 + (player.level - 6) * 0.15))), desc: (v) => `+${v} Fire Rate Rating`,
        effect: (v) => { BASE_STATS.fireRateRating = (BASE_STATS.fireRateRating || 0) + v; }
    },
    {
        id: 'nanoRepairSwarm', name: 'Nano-Repair Swarm', color: '#00ff66',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
        roll: () => MathUtils.rand(0.2, 3.2), desc: (v) => `+${v.toFixed(1)} HP Regen/sec`,
        effect: (v) => { BASE_STATS.hpRegen += v; }
    },
    {
        id: 'fuelAtomizer', name: 'Fuel Atomizer', color: '#ffcc00',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 4.2c1.88 1.4 3.34 3.73 3.34 6.11 0 4.97-4.03 9-9 9s-9-4.03-9-9c0-2.38 1.46-4.71 3.34-6.11L12 2.69z"/></svg>',
        roll: () => MathUtils.rand(0.1, 0.4), desc: (v) => `-${v.toFixed(2)} Fuel Consumption`,
        effect: (v) => { BASE_STATS.fuelEfficiency -= v; }
    },
    {
        id: 'persistentShieldLink', name: 'Persistent Shield Link', color: '#33ccff',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        roll: () => MathUtils.rand(0.1, 3.1), desc: (v) => `+${v.toFixed(1)} Shield Regen/sec (Always Active)`,
        effect: (v) => { BASE_STATS.shieldRegenPersistent += v; }
    },
    {
        id: 'kineticDampeners', name: 'Kinetic Dampeners', color: '#aaaaaa',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
        roll: () => Math.max(1, Math.floor(10 * (1 + (player.level - 6) * 0.15))), desc: (v) => `+${v} Armor Rating`,
        effect: (v) => { BASE_STATS.armorRating += v; } 
    },
    {
        id: 'targetingComputer', name: 'Targeting Computer', color: '#ff3366',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        roll: () => Math.max(1, Math.floor(10 * (1 + (player.level - 6) * 0.15))), desc: (v) => `+${v} Crit Rating`,
        effect: (v) => { BASE_STATS.critRating += v; }
    },
    {
        id: 'auxiliaryBattery', name: 'Auxiliary Battery', color: '#9933ff',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="2" ry="2"/><line x1="22" y1="11" x2="22" y2="13"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/></svg>',
        roll: () => MathUtils.randInt(5, 8), desc: (v) => `+${v} Max Energy`,
        effect: (v) => { BASE_STATS.maxEnergy += v; }
    },
    {
        id: 'emergencySiphon', name: 'Emergency Siphon', color: '#33ccff',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
        roll: () => MathUtils.randInt(5, 8), desc: (v) => `+${v} Max Shields`,
        effect: (v) => { BASE_STATS.maxShields += v; }
    },
    {
        id: 'structuralIntegrity', name: 'Structural Integrity', color: '#ff3366',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
        roll: () => MathUtils.randInt(5, 8), desc: (v) => `+${v} Max HP`,
        effect: (v) => { BASE_STATS.maxHp += v; }
    }
];

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
    totalKills: 0,
    killsThisLevel: 0,
    killsLastLevel: 0,
    stats: { ...BASE_STATS },
    statBreakdown: {},
    augments: {},
    timers: { dodge: 0, shieldRegen: 0, repairis: 0, immunity: 0, mycelialDebuff: 0, dashActive: 0, inMycelialCloud: 0 },
    skills: [
        { id: 1, name: 'Pulse Blaster', cost: 2, cd: 0, maxCd: 0.25, type: 'projectile' },
        { id: 2, name: 'EMP Blast', cost: 20, cd: 0, maxCd: 5.0, type: 'aoe' },
        { id: 3, name: 'Warp Dash', cost: 15, cd: 0, maxCd: 3.0, type: 'dash', isFuel: true },
        { id: 4, name: 'Black Hole', cost: 40, cd: 0, maxCd: 10.0, type: 'special' }
    ],
    
    gainXp(amount) {
        let xpMult = (equipment['Reactor'] && equipment['Reactor'].perk === 'XP Boost') ? 1.05 : 1.0;
        this.xp += amount * xpMult;
        while (this.xp >= this.xpNext) {
            this.xp -= this.xpNext;
            this.level++;
            this.killsLastLevel = this.killsThisLevel;
            this.killsThisLevel = 0;
            this.xpNext = (48 * Math.pow(this.level, 2.30)); /* this.xpNext = (100 * Math.pow(this.level, 1.2)); // Requires more total XP polynomialy */
            
            // Level Up Rewards
            // Level Up Rewards (Base Stats Scaling)
            BASE_STATS.maxHp += 5;
            BASE_STATS.damage.min += 1;
            BASE_STATS.damage.max += 2;
            
            // Heal 25% on level up and reset CD
            this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + this.stats.maxHp * 0.1);
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
                playSound('https://media.githubusercontent.com/media/diploidian/void_drifter/refs/heads/main/sounds/spaceEngine_000.ogg');
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