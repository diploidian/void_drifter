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
    return Math.max(0, rating / (rating + 250 + level * 25));
}

function getCritBonus(rating, level) {
    return Math.max(0, rating / (rating + 200 + level * 30)) * 100;
}

function generateLoot(type = null, tierLevel = -1) {
    // 25% chance for junk/resources, or if explicitly requested
    if ((Math.random() < 0.25 && type === null) || type === 'force_resource') {
        const isFuel = type === 'force_resource' ? (Math.random() < 0.75) : (Math.random() < 0.5);
        return {
            id: Math.random().toString(36).substr(2, 9),
            name: isFuel ? 'Fuel Cell' : 'Raw Minerals',
            type: isFuel ? 'Fuel' : 'Resource',
            tier: 0,
            stackable: true,
            count: isFuel ? (type === 'force_resource' ? MathUtils.randInt(3, 6) : MathUtils.randInt(1, 5)) : MathUtils.randInt(1, 5),
            desc: isFuel ? 'Restores 20 Fuel on use.' : 'Can be traded or scrapped.'
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
    if (type === 'Primary Weapon' || type === 'Secondary Weapon') availableStats.push('damage', 'critRating');
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
        if (stat === 'fireRateRating') { val = Math.floor(MathUtils.rand(10, 25) * tier.mult * lvlMult); str = `+${val} Fire Rate Rating`; }
        else if (stat === 'damage') { 
            let avgDmg = MathUtils.rand(10, 20) * tier.mult * lvlMult;
            let spread = Math.max(1, 6 - tierLevel) * 2; // Tighter spread for better tiers
            let min = Math.max(1, Math.floor(avgDmg - spread/2));
            let max = Math.floor(avgDmg + spread/2);
            val = { min, max }; str = `+${min}-${max} Damage`; isObj = true;
        }
        else if (stat === 'critRating') { val = Math.floor(MathUtils.rand(10, 25) * tier.mult * lvlMult); str = `+${val} Crit Rating`; }
        else if (stat === 'maxHp') { val = Math.floor(MathUtils.rand(20, 50) * tier.mult * lvlMult); str = `+${val} Max HP`; }
        else if (stat === 'armorRating') { val = Math.floor(MathUtils.rand(20, 30) * Math.pow(tier.mult, 2) * lvlMult); str = `+${val} Armor Rating`; }
        else if (stat === 'maxShields') { val = Math.floor(MathUtils.rand(20, 40) * tier.mult * lvlMult); str = `+${val} Max Shields`; }
        else if (stat === 'shieldRegen') { val = Math.floor(MathUtils.rand(2, 8) * tier.mult * lvlMult); str = `+${val} Shield/sec`; }
        else if (stat === 'maxSpeed') { val = Math.floor(MathUtils.rand(20, 40) * tier.mult); str = `+${val} Max Speed`; }
        else if (stat === 'acceleration') { val = Math.floor(MathUtils.rand(10, 30) * tier.mult * lvlMult); str = `+${val} Thrust`; }
        else if (stat === 'maxEnergy') { val = Math.floor(MathUtils.rand(20, 60) * tier.mult * lvlMult); str = `+${val} Max Energy`; }
        else if (stat === 'energyRegen') { val = Math.floor(MathUtils.rand(1, 4) * tier.mult * lvlMult); str = `+${val} Energy/sec`; }
        
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
        if (type === 'Shields') { item.perkReflect = MathUtils.randInt(10, 20); item.perk = 'Reflect'; item.statLines.push(`[PERK] Reflects ${item.perkReflect}% damage`); }
        if (type === 'Engine') { item.perk = 'Fuel Efficiency'; item.statLines.push(`[PERK] 25% better fuel efficiency`); }
        if (type === 'Reactor') { item.perk = 'XP Boost'; item.statLines.push(`[PERK] +15% XP & Orb pull range`); }
    }
    
    return item;
}