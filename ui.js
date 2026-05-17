/** ==========================================
 * UI & INVENTORY LOGIC
 * ========================================== */
let dragSource = null;
let pendingUpgrade = null;

function handleDrop(e, targetType, targetId) {
    e.preventDefault();
    if (!dragSource) return;

    let srcItem = dragSource.type === 'inv' ? inventory[dragSource.index] : equipment[dragSource.slot];
    let tgtItem = targetType === 'inv' ? inventory[targetId] : equipment[targetId];

    if (!srcItem) return;

    // Upgrade Logic
    if (srcItem.type === 'Upgrade Material' && srcItem.count >= 3 && tgtItem && tgtItem.tier === srcItem.tier && !tgtItem.upgraded && tgtItem.type !== 'Upgrade Material' && tgtItem.type !== 'Resource' && tgtItem.type !== 'Fuel') {
        openUpgradeModal(tgtItem, dragSource, targetType, targetId);
        dragSource = null;
        return;
    }

    // Inventory to Inventory
    if (dragSource.type === 'inv' && targetType === 'inv') {
        let temp = inventory[targetId];
        inventory[targetId] = inventory[dragSource.index];
        inventory[dragSource.index] = temp;
        renderInventory();
        updateUI();
    } 
    // Inventory to Equipment
    else if (dragSource.type === 'inv' && targetType === 'eq') {
        if (srcItem.type === targetId) {
            let temp = equipment[targetId];
            equipment[targetId] = inventory[dragSource.index];
            inventory[dragSource.index] = temp;
            renderInventory();
            renderEquipment();
            player.updateStats();
    updateAugmentIcons();
        }
    } 
    // Equipment to Inventory
    else if (dragSource.type === 'eq' && targetType === 'inv') {
        let temp = inventory[targetId];
        if (!temp || temp.type === dragSource.slot) {
            inventory[targetId] = equipment[dragSource.slot];
            equipment[dragSource.slot] = temp;
            renderInventory();
            renderEquipment();
            player.updateStats();
        }
    }

    dragSource = null;
}

function findStatLineIndex(statLines, statKey) {
    if (!statLines) return -1;
    const mapping = {
        'fireRateRating': 'Fire Rate Rating',
        'damage': 'Damage',
        'critRating': 'Crit Rating',
        'critDamage': 'Crit Damage',
        'collisionDamage': 'Collision Damage',
        'energyOnKill': 'Energy on Kill',
        'maxHp': 'Max HP',
        'armorRating': 'Armor Rating',
        'maxShields': 'Max Shields',
        'shieldRegen': 'Shield/sec',
        'maxSpeed': 'Max Speed',
        'acceleration': 'Thrust',
        'maxEnergy': 'Max Energy',
        'energyRegen': 'Energy/sec'
    };
    let matchText = mapping[statKey] || statKey;
    return statLines.findIndex(l => {
        if (l.startsWith('[PERK]')) return false;
        if (statKey === 'damage') {
            return l.includes('Damage') && !l.includes('Crit') && !l.includes('Collision');
        }
        return l.includes(matchText);
    });
}

function openUpgradeModal(targetItem, srcInfo, tgtType, tgtId) {
    pendingUpgrade = { item: targetItem, srcInfo, tgtType, tgtId };
    let modal = document.getElementById('upgrade-modal');
    let opts = document.getElementById('upg-options');
    opts.innerHTML = '';
    
    for (let stat in targetItem.stats) {
        let btn = document.createElement('button');
        btn.className = 'upg-btn';
        let idx = findStatLineIndex(targetItem.statLines, stat);
        let line = idx !== -1 ? targetItem.statLines[idx] : `Upgrade ${stat}`;
        btn.innerHTML = `Buff: ${line}`;
        btn.onclick = () => confirmUpgrade(stat);
        opts.appendChild(btn);
    }
    if (targetItem.perk) {
        let btn = document.createElement('button');
        btn.className = 'upg-btn';
        let line = targetItem.statLines.find(l => l.startsWith('[PERK]'));
        btn.innerHTML = `Upgrade Perk: ${line.replace('[PERK] ', '')}`;
        btn.onclick = () => confirmUpgrade('PERK');
        opts.appendChild(btn);
    }
    modal.style.display = 'block';
    GAME.state = 'INVENTORY';
    document.body.classList.add('inv-open');
}

function closeUpgradeModal() {
    document.getElementById('upgrade-modal').style.display = 'none';
    pendingUpgrade = null;
}

function confirmUpgrade(choice) {
    if(!pendingUpgrade) return;
    let { item, srcInfo } = pendingUpgrade;
    
    let srcItem = srcInfo.type === 'inv' ? inventory[srcInfo.index] : null;
    if (srcItem && srcItem.count >= 3) {
        srcItem.count -= 3;
        if (srcItem.count <= 0) inventory[srcInfo.index] = null;
    } else {
        closeUpgradeModal();
        return;
    }

    item.upgraded = true;

    if (choice === 'PERK') {
        item.upgradedPerk = true;
        let pIdx = item.statLines.findIndex(l => l.startsWith('[PERK]'));
        if (pIdx !== -1) {
            let newLine = item.statLines[pIdx].replace('[PERK]', '[UPGRADED PERK]');
            if(item.type === 'Primary Weapon') newLine = newLine.replace('Shoots 3 bullets in a cone', 'Whip-like energy beam that snaps to targets');
            if(item.type === 'Secondary Weapon') newLine = newLine.replace('Enemies explode on death', 'Enemy explosions chain on kill');
            if(item.type === 'Hull') newLine = newLine.replace('1% Max HP every 2s', '3% Max HP every 5s');
            if(item.type === 'Shields') newLine = newLine.replace(/Reflects \d+% damage/, 'Always reflects 50% damage');
            if(item.type === 'Engine') newLine = newLine.replace('25%', '30%').replace('efficiency', 'efficiency, Fuel Cells restore 30');
            if(item.type === 'Reactor') newLine = newLine.replace('+15% XP & Orb pull range', '+15% XP & Pull. Drop 3-5 bonus (+20% XP) orbs');
            item.statLines[pIdx] = `<b>${newLine}</b>`;
        }
    } else {
        let oldMult = 1 + (item.itemLevel - 1) * 0.15;
        let newMult = 1 + (player.level + 3) * 0.20;
        let ratio = newMult / oldMult;

        let val = item.stats[choice];
        let isObj = typeof val === 'object';
        let oldStr = '';
        let newStr = '';

        if (isObj) {
            oldStr = `${val.min}-${val.max}`;
            val.min = Math.ceil(val.min * ratio);
            val.max = Math.ceil(val.max * ratio);
            newStr = `${val.min}-${val.max}`;
        } else {
            oldStr = val.toString();
            item.stats[choice] = Math.ceil(val * ratio);
            newStr = item.stats[choice].toString();
        }

        let sIdx = findStatLineIndex(item.statLines, choice);
        if (sIdx !== -1) item.statLines[sIdx] = `<b>${item.statLines[sIdx].replace(oldStr, newStr)}</b>`;
    }

    player.updateStats();
    closeUpgradeModal();
    renderInventory();
    renderEquipment();
    updateUI();
}

function renderAugmentUI(options) {
    let modal = document.getElementById('augment-modal');
    let container = document.getElementById('augment-options');
    container.innerHTML = '';
    
    options.forEach(opt => {
        let btn = document.createElement('div');
        btn.className = 'augment-card';
        btn.innerHTML = `
            <div class="aug-icon" style="color: ${opt.aug.color}">${opt.aug.icon}</div>
            <div class="aug-name" style="color: ${opt.aug.color}">${opt.aug.name}</div>
            <div class="aug-desc">${opt.aug.desc(opt.val)}</div>
        `;
        btn.onclick = () => selectAugment(opt.aug, opt.val);
        container.appendChild(btn);
    });
    
    modal.style.display = 'flex';
}

function selectAugment(aug, val) {
    aug.effect(val);
    player.augments[aug.id].count++;
    player.augments[aug.id].totalValue += val;
    
    player.updateStats();
    document.getElementById('augment-modal').style.display = 'none';
    
    if (player.xp < player.xpNext) GAME.state = 'PLAYING';
    else triggerLevelUp(); // Queued level ups
    
    updateAugmentIcons();
    updateUI();
}

function updateAugmentIcons() {
    let container = document.getElementById('augments-hud');
    if (!container) return;
    container.innerHTML = '';
    
    AUGMENT_POOL.forEach(aug => {
        let augData = player.augments[aug.id];
        let isActive = augData.count > 0;
        let div = document.createElement('div');
        div.style.cssText = `width: 24px; height: 24px; position: relative; color: ${aug.color}; opacity: ${isActive ? '1.0' : '0.2'};`;
        div.innerHTML = aug.icon;
        if (isActive) {
            div.innerHTML += `<div style="position:absolute; bottom:-6px; right:-6px; font-size:10px; font-weight:bold; background:#000; border:1px solid ${aug.color}; color:#fff; border-radius:3px; padding:0 2px;">${augData.count}</div>`;
            let tooltipDesc = `Acquired: ${augData.count}x<br>Total Bonus: <span style="color:#0f0">${aug.desc(augData.totalValue)}</span>`;
            div.onmouseover = (e) => showTooltip(aug.name, tooltipDesc, '', e);
            div.onmouseout = hideTooltip;
        }
        container.appendChild(div);
    });
}

function updateUI() {
    document.getElementById('xp-fill').style.width = `${(player.xp / player.xpNext)*100}%`;
    document.getElementById('xp-text').innerText = `${Math.floor(player.xp)} / ${Math.floor(player.xpNext)}`;
    document.getElementById('lvl-text').innerText = `LEVEL ${player.level}`;

    let killCounter = document.getElementById('kill-counter');
    if (killCounter) {
        killCounter.innerHTML = `kills last level: <span class="kill-value">${player.killsLastLevel}</span><br>kills this level: <span class="kill-value">${player.killsThisLevel}</span><br>total kills: <span class="kill-value">${player.totalKills}</span>`;
    }

    document.getElementById('hp-fill').style.width = `${(player.stats.hp / player.stats.maxHp)*100}%`;
    document.getElementById('hp-text').innerText = `HP: ${Math.floor(player.stats.hp)}/${player.stats.maxHp}`;
    
    let hpWrap = document.getElementById('hp-fill').parentElement;
    let hpRegenTotal = player.stats.hpRegen || 0;
    if (equipment['Hull'] && equipment['Hull'].perk === 'Repairis') {
        hpRegenTotal += player.stats.maxHp * (equipment['Hull'].upgradedPerk ? 0.006 : 0.005);
    }
    hpWrap.onmouseover = (e) => showTooltip('Hull Integrity', `Maximum structure health. If this reaches 0, your ship is destroyed.<br><br>Max HP Regen: <span style="color:#0f0">${hpRegenTotal.toFixed(1)} /sec</span>`, '', e);
    hpWrap.onmouseout = hideTooltip;
    
    let sMax = player.stats.maxShields || 1;
    document.getElementById('shield-fill').style.width = `${(player.stats.shields / sMax)*100}%`;
    document.getElementById('shield-text').innerText = `SH: ${Math.floor(player.stats.shields)}/${player.stats.maxShields}`;
    
    let shieldWrap = document.getElementById('shield-fill').parentElement;
    let sRegen = player.stats.shieldRegen || 0;
    let sPersist = player.stats.shieldRegenPersistent || 0;
    shieldWrap.onmouseover = (e) => showTooltip('Energy Shields', `Absorbs incoming damage before your Hull takes hits. Recharges automatically after avoiding damage for 3 seconds.<br><br>Delayed Regen: <span style="color:#0f0">${sRegen.toFixed(1)} /sec</span><br>Persistent Regen: <span style="color:#0f0">${sPersist.toFixed(1)} /sec</span>`, '', e);
    shieldWrap.onmouseout = hideTooltip;
    
    document.getElementById('energy-fill').style.width = `${(player.stats.energy / player.stats.maxEnergy)*100}%`;
    document.getElementById('energy-text').innerText = `EN: ${Math.floor(player.stats.energy)}/${player.stats.maxEnergy}`;
    
    let energyWrap = document.getElementById('energy-fill').parentElement;
    let enRegen = player.stats.energyRegen || 0;
    energyWrap.onmouseover = (e) => showTooltip('Reactor Energy', `Powers your ship's active skills and weapon systems.<br><br>Energy Regen: <span style="color:#0f0">${enRegen.toFixed(1)} /sec</span>`, '', e);
    energyWrap.onmouseout = hideTooltip;
    
    document.getElementById('fuel-fill').style.width = `${(player.stats.fuel / player.stats.maxFuel)*100}%`;
    document.getElementById('fuel-text').innerText = `FUEL: ${Math.floor(player.stats.fuel)}`;

    let fuelEff = 1.0;
    if (equipment['Engine'] && equipment['Engine'].perk === 'Fuel Efficiency') {
        fuelEff = equipment['Engine'].upgradedPerk ? 0.70 : 0.75;
    }
    fuelEff *= player.stats.fuelEfficiency !== undefined ? player.stats.fuelEfficiency : 1.0;
    
    let baseDrain = 9 * fuelEff;
    let flatReduction = player.stats.flatFuelReduction || 0;
    let finalDrain = Math.max(0, baseDrain - flatReduction).toFixed(2);
    
    let fuelWrap = document.getElementById('fuel-fill').parentElement;
    fuelWrap.onmouseover = (e) => showTooltip('Thruster Fuel', `Drains when moving. Replenish from asteroids and enemies.<br><br>Max Speed Drain: <span style="color:#0f0">${finalDrain} /sec</span>`, '', e);
    fuelWrap.onmouseout = hideTooltip;

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

    let currentSpeed = Math.floor(Math.hypot(player.vx, player.vy));
    let speedEl = document.getElementById('speed-indicator');
    if (speedEl) speedEl.innerText = `SPEED: ${currentSpeed} U/S`;

    renderStats();
}

function renderInventory() {
    const grid = document.getElementById('inventory-grid');
    
    let scrapBar = document.getElementById('scrap-bar');
    if (!scrapBar) {
        scrapBar = document.createElement('div');
        scrapBar.id = 'scrap-bar';
        scrapBar.style.display = 'flex';
        scrapBar.style.justifyContent = 'center';
        scrapBar.style.gap = '10px';
        scrapBar.style.marginBottom = '15px';
        
        for (let i = 1; i <= 5; i++) {
            let btn = document.createElement('button');
            btn.className = 'scrap-btn';
            btn.style.width = '40px';
            btn.style.height = '40px';
            btn.style.background = 'rgba(0, 0, 0, 0.5)';
            btn.style.border = `2px solid ${TIERS[i].color}`;
            btn.style.borderRadius = '5px';
            btn.style.cursor = 'pointer';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="${TIERS[i].color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
            btn.onmouseover = (e) => showTooltip(`Auto-Scrap ${TIERS[i].name}`, `Scraps all unequipped ${TIERS[i].name} gear into Core fragments.`, '', e);
            btn.onmouseout = hideTooltip;
            btn.onclick = () => scrapAllByTier(i);
            
            scrapBar.appendChild(btn);
        }
        grid.parentNode.insertBefore(scrapBar, grid);
    }

    grid.innerHTML = '';
    for (let i = 0; i < INVENTORY_SIZE; i++) {
        let item = inventory[i];
        let div = document.createElement('div');
        div.className = 'inv-slot';
        if (item) {
            if (item.upgraded || item.type === 'Upgrade Material') {
                div.classList.add('holographic');
            }
            let color = item.type === 'Fuel' ? '#ffff00' : TIERS[item.tier].color;
            let iconInfo = getIcon(item.type, color);
            // Safely inject raw SVG instead of an image tag to prevent attribute breakout
            div.innerHTML = `
                <div class="inv-item" style="border: 2px solid ${color}; color: ${color};">
                    ${iconInfo.raw}
                </div>`;
            div.draggable = true;
            div.ondragstart = (e) => {
                dragSource = { type: 'inv', index: i };
                e.dataTransfer.setData('text/plain', '');
            };
            div.ondrop = (e) => handleDrop(e, 'inv', i);
            div.ondragover = (e) => e.preventDefault();
            
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
            
            el.draggable = true;
            el.ondragstart = (e) => { dragSource = { type: 'eq', slot: key }; e.dataTransfer.setData('text/plain', ''); };
            
            if (item.upgraded) el.classList.add('holographic');
            else el.classList.remove('holographic');
        } else {
            el.innerHTML = `<div class="slot-name">${key}</div><div class="slot-content">Empty</div>`;
            hudEl.innerHTML = `<div style="font-size:8px; color:#555; text-align:center;">${key}</div>`;
            hudEl.onmouseover = null;
            el.draggable = false;
            el.classList.remove('holographic');
        }
        el.ondrop = (e) => handleDrop(e, 'eq', key);
        el.ondragover = (e) => e.preventDefault();
    }
}

function renderStats() {
    const container = document.getElementById('stats-list-container');
    
    function getStatHtml(key, name, desc, extraLines = [], formatFn = val => val) {
        let bd = player.statBreakdown[key];
        let val = player.stats[key];
        let baseText = (bd && bd.base !== undefined) ? `Base: ${formatFn(bd.base)}<br>` : '';
        
        let tooltip = `<b>${name}</b><br><span style="color:#ccc; font-size:12px;">${desc}</span><br><br>Total: <span style="color:var(--accent)">${formatFn(val)}</span><br>${baseText}`;
        if (bd && bd.items) {
            for(let i of bd.items) {
                let displayVal = typeof i.val === 'object' ? i.val : (typeof i.val === 'string' ? i.val : formatFn(i.val));
                let cleanDisplayVal = typeof displayVal === 'object' ? `${displayVal.min}-${displayVal.max}` : displayVal;
                tooltip += `<span style="color:#0f0">+${cleanDisplayVal} from ${i.name}</span><br>`;
            }
        }
        for(let line of extraLines) {
            tooltip += `<span style="color:#0f0">${line}</span><br>`;
        }
        tooltip = tooltip.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        return `<div class="stat-row" onmouseover="showTooltip('Stat Details', '', '${tooltip}', event)" onmouseout="hideTooltip()">
                    <span>${name}</span><span class="stat-val">${formatFn(val)}</span>
                </div>`;
    }

    let frExtras = [];
    if (player.augments['rapidFireRelay']?.totalValue > 0) {
        frExtras.push(`+${player.augments['rapidFireRelay'].totalValue} Rating from Augments`);
    }

    let critExtras = [];
    if (player.augments['targetingComputer']?.totalValue > 0) {
        critExtras.push(`+${player.augments['targetingComputer'].totalValue} Rating from Augments`);
    }

    let hpExtras = [];
    if (player.augments['structuralIntegrity']?.totalValue > 0) {
        hpExtras.push(`+${player.augments['structuralIntegrity'].totalValue} Max HP from Augments`);
    }
    let hpRegenTotal = player.stats.hpRegen || 0;
    if (equipment['Hull'] && equipment['Hull'].perk === 'Repairis') {
        hpRegenTotal += player.stats.maxHp * (equipment['Hull'].upgradedPerk ? 0.006 : 0.005);
    }
    if (hpRegenTotal > 0) {
        hpExtras.push(`Regenerating ${hpRegenTotal.toFixed(1)} HP/sec`);
    }

    let drExtras = [];
    let armorItems = player.statBreakdown['armorRating'] ? player.statBreakdown['armorRating'].items : [];
    for (let i of armorItems) {
        drExtras.push(`+${i.val} Armor Rating from ${i.name}`);
    }
    if (player.augments['kineticDampeners']?.totalValue > 0) {
        drExtras.push(`+${player.augments['kineticDampeners'].totalValue} Armor Rating from Augments`);
    }

    let shieldExtras = [];
    if (player.augments['emergencySiphon']?.totalValue > 0) {
        shieldExtras.push(`+${player.augments['emergencySiphon'].totalValue} Max Shields from Augments`);
    }

    let srExtras = [];
    if (player.augments['persistentShieldLink']?.totalValue > 0) {
        srExtras.push(`+${player.augments['persistentShieldLink'].totalValue.toFixed(1)}/s Persistent Regen from Augments`);
    }
    let sPersist = player.stats.shieldRegenPersistent || 0;
    if (sPersist > 0) {
        srExtras.push(`Total Persistent Regen: ${sPersist.toFixed(1)}/s`);
    }

    let enExtras = [];
    if (player.augments['auxiliaryBattery']?.totalValue > 0) {
        enExtras.push(`+${player.augments['auxiliaryBattery'].totalValue} Max Energy from Augments`);
    }

    let enRegenExtras = [];
    if (player.augments['overclockedCapacitors']?.totalValue > 0) {
        enRegenExtras.push(`+${player.augments['overclockedCapacitors'].totalValue.toFixed(2)}/s Regen from Augments`);
    }
    let eokVal = player.stats.energyOnKill || 0;
    if (eokVal > 0) {
        enRegenExtras.push(`Energy on Kill: +${eokVal.toFixed(2)}`);
    }

    let speedExtras = [];
    if (player.augments['thrusterTuning']?.totalValue > 0) {
        speedExtras.push(`+${player.augments['thrusterTuning'].totalValue} Max Speed from Augments`);
    }

    let collExtras = [];
    let collItems = player.statBreakdown['collisionDamage'] ? player.statBreakdown['collisionDamage'].items : [];
    for (let i of collItems) {
        collExtras.push(`+${i.val} Rating from ${i.name}`);
    }
    let collRating = player.stats.collisionDamage || player.stats.collisionRating || 0;
    let collMult = typeof getCollisionMultiplier === 'function' ? getCollisionMultiplier(collRating, player.level) : 0;
    let collMin = Math.floor(player.stats.damage.min * collMult);
    let collMax = Math.floor(player.stats.damage.max * collMult);
    if (collRating > 0) {
        collExtras.push(`Damage Range: ${collMin}-${collMax}`);
    }

    container.innerHTML = `
        ${getStatHtml('damage', 'Damage', 'Base damage for your weapons and abilities.', [], v => v.min + '-' + v.max)}
        ${getStatHtml('fireRate', 'Fire Rate', 'Increases the attack speed of your Primary Weapon.', frExtras, v => Math.round(v) + '%')}
        ${getStatHtml('critChance', 'Crit Chance', 'Chance to deal double damage on hit.', critExtras, v => v.toFixed(1) + '%')}
        ${getStatHtml('critDamage', 'Crit Damage', 'Multiplier applied to damage on a critical hit.', [], v => Math.round(v) + '%')}
        ${getStatHtml('dummyCollision', 'Collision Damage', 'Damage multiplier dealt to enemies when ramming them.', collExtras, () => (collMult * 100).toFixed(1) + '%')}
        ${getStatHtml('maxHp', 'Max HP', 'Maximum Hull Integrity. If it reaches 0, you explode.', hpExtras)}
        ${getStatHtml('damageReduction', 'Damage Reduction', 'Percentage of incoming hull damage mitigated.', drExtras, v => (v * 100).toFixed(1) + '%')}
        ${getStatHtml('maxShields', 'Shields', 'Energy barrier that absorbs damage before Hull.', shieldExtras)}
        ${getStatHtml('shieldRegen', 'Shield Regen', 'Amount of Shield recovered per second.', srExtras, v => v + '/s')}
        ${getStatHtml('maxEnergy', 'Energy', 'Maximum Reactor Energy for using skills.', enExtras)}
        ${getStatHtml('energyRegen', 'Energy Regen', 'Amount of Energy recovered per second.', enRegenExtras, v => Number(v).toFixed(1) + '/s')}
        ${getStatHtml('maxSpeed', 'Max Speed', 'Top speed of your spacecraft.', speedExtras)}
        ${getStatHtml('acceleration', 'Acceleration', 'How fast your ship reaches top speed (Thrust).', [])}
    `;
}

function pickupItem(newItem) {
    // Stackable check
    if (newItem.stackable) {
        let existing = inventory.find(i => i && i.name === newItem.name);
        if (existing) { existing.count += newItem.count; renderInventory(); updateUI(); return true; }
    }
    
    // Auto-Equip if slot empty
    if (!newItem.stackable && SLOT_TYPES.includes(newItem.type) && !equipment[newItem.type]) {
        equipment[newItem.type] = newItem;
        renderEquipment();
        player.updateStats();
        return true;
    }

    // Otherwise place in empty slot
    let emptyIdx = inventory.findIndex(i => i === null);
    if (emptyIdx !== -1) {
        inventory[emptyIdx] = newItem;
        renderInventory();
        updateUI();
        return true;
    }
    return false; // inv full
}

function useItem(index) {
    let item = inventory[index];
    if(!item) return;

    if (item.type === 'Fuel') {
        playSound('https://media.githubusercontent.com/media/diploidian/void_drifter/refs/heads/main/sounds/impactMetal_004.ogg');
        let amount = (equipment['Engine'] && equipment['Engine'].upgradedPerk) ? 30 : 20;
        player.stats.fuel = Math.min(player.stats.maxFuel, player.stats.fuel + amount);
        item.count--;
        if(item.count <= 0) inventory[index] = null;
        renderInventory();
        updateUI();
        if(inventory[index] === null) hideTooltip();
        return;
    }

    if (SLOT_TYPES.includes(item.type)) {
        // Equip
        let currentEq = equipment[item.type];
        equipment[item.type] = item;
        inventory[index] = currentEq; // swap
        renderInventory();
        renderEquipment();
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
        renderInventory();
        renderEquipment();
        player.updateStats();
        hideTooltip();
    }
}

function scrapAllByTier(tier) {
    let scrappedAny = false;
    for (let i = 0; i < INVENTORY_SIZE; i++) {
        let item = inventory[i];
        if (item && SLOT_TYPES.includes(item.type) && item.tier === tier) {
            inventory[i] = null;
            let yieldCount = 1;
            if (item.upgraded && Math.random() < 0.20) {
                yieldCount = 2;
            }
            let yieldItem = {
                id: Math.random().toString(36).substr(2, 9),
                name: `${TIERS[tier].name} Core`,
                type: 'Upgrade Material',
                tier: tier,
                stackable: true,
                count: yieldCount,
                desc: `Combine 3 to upgrade a ${TIERS[tier].name} item.`
            };
            pickupItem(yieldItem);
            scrappedAny = true;
        }
    }
    if (scrappedAny) {
        playSound('https://media.githubusercontent.com/media/diploidian/void_drifter/refs/heads/main/sounds/impactMetal_004.ogg');
        renderInventory();
        updateUI();
        hideTooltip();
    }
}

function dropItem(index) {
    let item = inventory[index];
    if(item) {
        inventory[index] = null;
        let yieldItem;
        if (SLOT_TYPES.includes(item.type)) {
            let yieldCount = 1;
            if (item.upgraded && Math.random() < 0.20) {
                yieldCount = 2;
            }
            yieldItem = {
                id: Math.random().toString(36).substr(2, 9),
                name: `${TIERS[item.tier].name} Core`,
                type: 'Upgrade Material',
                tier: item.tier,
                stackable: true,
                count: yieldCount,
                desc: `Combine 3 to upgrade a ${TIERS[item.tier].name} item.`
            };
        } else {
            let cnt = item.type === 'Upgrade Material' ? 1 : item.tier + 1;
            yieldItem = {
                id: Math.random().toString(36).substr(2, 9),
                name: 'Raw Minerals',
                type: 'Resource',
                tier: 0,
                stackable: true,
                count: cnt,
                desc: 'Can be traded or scrapped.'
            };
        }
        pickupItem(yieldItem);
        renderInventory();
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
    document.getElementById('tt-title').style.color = item.type === 'Fuel' ? '#ffff00' : '';
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

            let idx = findStatLineIndex(item.statLines, stat);
            let str = idx !== -1 ? item.statLines[idx] : (isObj ? `+${val.min}-${val.max} ${stat}` : `+${val} ${stat}`);
            str += deltaStr;
            statsHtml.push(str);
        }
    }

    if (eqItem && eqItem.stats) {
        for (let stat in eqItem.stats) {
            if (!item.stats || item.stats[stat] === undefined) {
                let eqVal = eqItem.stats[stat];
                let isObj = typeof eqVal === 'object';
                let idx = findStatLineIndex(eqItem.statLines, stat);
                let eqStr = idx !== -1 ? eqItem.statLines[idx] : (isObj ? `+${eqVal.min}-${eqVal.max} ${stat}` : `+${eqVal} ${stat}`);
                
                let lostStr = eqStr.replace(/^\+/, '-');
                statsHtml.push(`<span style="color:rgba(255, 0, 0, 0.5); font-style:italic;">${lostStr}</span>`);
            }
        }
    }

    if (item.perk) {
        let perkLine = item.statLines.find(l => l.includes('[PERK]') || l.includes('[UPGRADED PERK]'));
        if(perkLine) statsHtml.push(`<span style="color:${item.upgradedPerk ? '#ff00ff' : '#f82'}">${perkLine}</span>`);
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
            let pIdx = eqStatsHtml.findIndex(l => l.includes('[PERK]') || l.includes('[UPGRADED PERK]'));
            if(pIdx !== -1) eqStatsHtml[pIdx] = `<span style="color:${eqItem.upgradedPerk ? '#ff00ff' : '#f82'}">${eqStatsHtml[pIdx]}</span>`;
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
    if (id === 5) {
        let amount = (equipment['Engine'] && equipment['Engine'].upgradedPerk) ? 30 : 20;
        showTooltip('Consume Fuel Cell', `Instantly restores <span style="color:#0f0">${amount}</span> Fuel.<br>Requires Fuel Cells in your inventory.`, `Cost: 1 Fuel Cell<br>Cooldown: None`, e);
        return;
    }
    let skill = player.skills[id-1];
    let dmgStr = `${player.stats.damage.min}-${player.stats.damage.max}`;
    let dmgEmpStr = `${Math.floor(player.stats.damage.min * 0.75)}-${Math.floor(player.stats.damage.max * 0.75)}`;
    let dmgWarpStr = `${Math.floor(player.stats.damage.min * 0.75)}-${Math.floor(player.stats.damage.max * 0.75)}`;
    let dmgSingExpStr = `${player.stats.damage.min * 2}-${player.stats.damage.max * 2}`;

    let hasTriple = (equipment['Primary Weapon'] && equipment['Primary Weapon'].perk === 'Triple Shot');
    let isTripleUpgraded = hasTriple && equipment['Primary Weapon'].upgradedPerk;
    let primaryName = equipment['Primary Weapon'] ? equipment['Primary Weapon'].name : '';
    let pbDesc = '';

    if (isTripleUpgraded) {
        let tickRate = 0.25 / (player.stats.fireRate / 100);
        pbDesc = `Fires a continuous energy beam dealing <span style="color:#0f0">${dmgStr}</span> damage every ${tickRate.toFixed(2)}s to the main target, and chaining to nearby enemies.<br>Range: 1200 units`;
        pbDesc += `<br><span style="color:#ff00ff">[UPGRADED PERK] ${primaryName} Whip Beam</span>`;
    } else {
        let projCount = hasTriple ? 3 : 1;
        pbDesc = `Fires ${projCount} projectile${projCount > 1 ? 's' : ''} dealing <span style="color:#0f0">${dmgStr}</span> damage.<br>Range: 1200 units`;
        if (hasTriple) pbDesc += `<br><span style="color:#f82">[PERK] ${primaryName} Triple Shot</span>`;
    }

    let descs = [
        pbDesc,
        `Releases an electromagnetic pulse, dealing <span style="color:#0f0">${dmgEmpStr}</span> damage and stunning nearby enemies.<br>Radius: 270 units`,
        `Engages warp thrusters to dash toward the cursor, leaving a plasma trail dealing <span style="color:#0f0">${dmgWarpStr}</span> damage per second.<br>Cone: 30 degrees`,
        `Launches a singularity core that collapses into a black hole, sucking in enemies before exploding for <span style="color:#0f0">${dmgSingExpStr}</span> damage.`
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
        document.body.classList.add('inv-open');
        if (typeof devGUI !== 'undefined') devGUI.show();
        updateUI();
    } else if (GAME.state === 'INVENTORY') {
        GAME.state = 'PLAYING';
        el.style.display = 'none';
        document.body.classList.remove('inv-open');
        if (typeof devGUI !== 'undefined') devGUI.hide();
        hideTooltip();
    }
}

function die() {
    playSound('https://media.githubusercontent.com/media/diploidian/void_drifter/refs/heads/main/sounds/explosionCrunch_003.ogg');
    GAME.state = 'DEAD';
    document.getElementById('char-sheet').style.display = 'none';
    document.body.classList.remove('inv-open');
    document.getElementById('game-over').style.display = 'flex';
}