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

function openUpgradeModal(targetItem, srcInfo, tgtType, tgtId) {
    pendingUpgrade = { item: targetItem, srcInfo, tgtType, tgtId };
    let modal = document.getElementById('upgrade-modal');
    let opts = document.getElementById('upg-options');
    opts.innerHTML = '';
    
    for (let stat in targetItem.stats) {
        let btn = document.createElement('button');
        btn.className = 'upg-btn';
        let line = targetItem.statLines.find(l => !l.startsWith('[PERK]') && l.toLowerCase().includes(stat.replace('Rating', '').toLowerCase()));
        if(!line) line = `Upgrade ${stat}`;
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
        let newMult = 1 + (item.itemLevel + 2) * 0.15;
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

        let sIdx = item.statLines.findIndex(l => !l.startsWith('[PERK]') && l.includes(oldStr));
        if (sIdx !== -1) item.statLines[sIdx] = `<b>${item.statLines[sIdx].replace(oldStr, newStr)}</b>`;
    }

    player.updateStats();
    closeUpgradeModal();
    renderInventory();
    renderEquipment();
    updateUI();
}

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

    let currentSpeed = Math.floor(Math.hypot(player.vx, player.vy));
    let speedEl = document.getElementById('speed-indicator');
    if (speedEl) speedEl.innerText = `SPEED: ${currentSpeed} U/S`;

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
            if (item.upgraded || item.type === 'Upgrade Material') {
                div.classList.add('holographic');
            }
            let color = TIERS[item.tier].color;
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
        ${getStatHtml('critChance', 'Crit Chance', 'Chance to deal double damage on hit.', v => v.toFixed(1) + '%')}
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
        playSound('https://cdn.jsdelivr.net/gh/diploidian/void_drifter@main/sounds/impactMetal_004.ogg');
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
    let skill = player.skills[id-1];
    let dmgStr = `${player.stats.damage.min}-${player.stats.damage.max}`;
    let dmgEmpStr = `${Math.floor(player.stats.damage.min * 0.75)}-${Math.floor(player.stats.damage.max * 0.75)}`;
    let dmgWarpStr = `${Math.floor(player.stats.damage.min * 0.75)}-${Math.floor(player.stats.damage.max * 0.75)}`;
    let dmgSingExpStr = `${player.stats.damage.min * 2}-${player.stats.damage.max * 2}`;

    let hasTriple = (equipment['Primary Weapon'] && equipment['Primary Weapon'].perk === 'Triple Shot');
    let projCount = hasTriple ? 3 : 1;
    let pbDesc = `Fires ${projCount} projectile${projCount > 1 ? 's' : ''} dealing <span style="color:#0f0">${dmgStr}</span> damage.<br>Range: 1200 units`;
    if (hasTriple) pbDesc += `<br><span style="color:#f82">[PERK] Triple Shot Active</span>`;

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
        updateUI();
    } else if (GAME.state === 'INVENTORY') {
        GAME.state = 'PLAYING';
        el.style.display = 'none';
        document.body.classList.remove('inv-open');
        hideTooltip();
    }
}

function die() {
    playSound('https://cdn.jsdelivr.net/gh/diploidian/void_drifter@main/sounds/explosionCrunch_003.ogg');
    GAME.state = 'DEAD';
    document.getElementById('char-sheet').style.display = 'none';
    document.body.classList.remove('inv-open');
    document.getElementById('game-over').style.display = 'flex';
}