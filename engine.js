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

    let cx = GAME.camera.x;
    let cy = GAME.camera.y;
    let hw = cw / 2;
    let hh = ch / 2;

    ctx.beginPath();
    for(let x = startX; x < right; x += gridSize) {
        let px = (x - cx) * scale + hw;
        ctx.moveTo(px, (top - cy) * scale + hh);
        ctx.lineTo(px, (bottom - cy) * scale + hh);
    }
    for(let y = startY; y < bottom; y += gridSize) {
        let py = (y - cy) * scale + hh;
        ctx.moveTo((left - cx) * scale + hw, py);
        ctx.lineTo((right - cx) * scale + hw, py);
    }
    ctx.stroke();
}

/** ==========================================
 * MAIN GAME LOOP & LOGIC
 * ========================================== */
const RENDER_LIST = [];

function updateMycelialNetwork() {
    mycelialLoops = [];
    const nodes = entities.filter(e => e instanceof FungalNode && !e.dead);
    if (nodes.length < 3) return;

    const adj = new Map();
    nodes.forEach(node => adj.set(node, []));
    
    const potentialLinks = [];
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            if (MathUtils.distance(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y) <= 400) {
                if (nodes[i].networkId === null || nodes[j].networkId === null || nodes[i].networkId === nodes[j].networkId) {
                    potentialLinks.push([nodes[i], nodes[j]]);
                }
            }
        }
    }
    
    // Sort by distance to find the smallest loops first
    potentialLinks.sort((a, b) => 
        MathUtils.distance(a[0].x, a[0].y, a[1].x, a[1].y) - 
        MathUtils.distance(b[0].x, b[0].y, b[1].x, b[1].y)
    );

    DSU.init(nodes);
    for (const [nodeA, nodeB] of potentialLinks) {
        if (DSU.find(nodeA) === DSU.find(nodeB)) {
            const path = findPath(nodeA, nodeB, adj);
            if (path) mycelialLoops.push(path);
        } else {
            DSU.union(nodeA, nodeB);
            adj.get(nodeA).push(nodeB);
            adj.get(nodeB).push(nodeA);
        }
    }
}
 
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
        let isTripleUpgraded = hasTriple && equipment['Primary Weapon'].upgradedPerk;
        let pitch = MathUtils.rand(0.85, 1.15);
        
        if (isTripleUpgraded) {
            if (!player.activeWhipBeam) {
                playSound('https://media.githubusercontent.com/media/diploidian/void_drifter/refs/heads/main/sounds/laserLarge_001.ogg', 0.5, pitch);
                player.activeWhipBeam = new WhipBeam(player, getDamage(player), varColor('--accent'));
            }
        } else if (hasTriple) {
            playSound('https://media.githubusercontent.com/media/diploidian/void_drifter/refs/heads/main/sounds/laserLarge_001.ogg', 0.5, pitch);
            projectiles.push(new Projectile(player.x, player.y, angle, 600, getDamage(player), true, varColor('--accent'), player));
            projectiles.push(new Projectile(player.x, player.y, angle - Math.PI/8, 600, getDamage(player), true, varColor('--accent'), player));
            projectiles.push(new Projectile(player.x, player.y, angle + Math.PI/8, 600, getDamage(player), true, varColor('--accent'), player));
        } else {
            playSound('https://media.githubusercontent.com/media/diploidian/void_drifter/refs/heads/main/sounds/laserSmall_004.ogg', 0.5, pitch);
            projectiles.push(new Projectile(player.x, player.y, angle, 600, getDamage(player), true, varColor('--accent'), player));
        }
    } 
    else if(index === 1) { // EMP
        playSound('https://media.githubusercontent.com/media/diploidian/void_drifter/refs/heads/main/sounds/spaceEngine_002.ogg');
        createParticles(player.x, player.y, 0, 70, varColor('--shield'));
        shockwaves.push(new Shockwave(player.x, player.y, 0, varColor('--shield'), 270));
        for(let e of entities) {
            if(e instanceof Enemy && !e.dead && MathUtils.distance(player.x, player.y, e.x, e.y) < 270) {
                e.takeDamage(getDamage(player) * 0.75, player, varColor('--shield'));
                e.stunTimer = 3.0;
            }
        }
    }
    else if(index === 2) { // Warp Dash
        playSound('https://media.githubusercontent.com/media/diploidian/void_drifter/refs/heads/main/sounds/doorOpen_002.ogg');
        // Reduced 40% (500 -> 300)
        let dist = Math.min(300, MathUtils.distance(player.x, player.y, GAME.mouse.worldX, GAME.mouse.worldY));
        let oldX = player.x, oldY = player.y;
        player.x += Math.cos(angle) * dist;
        player.y += Math.sin(angle) * dist;
        player.timers.immunity = 1.0;
        
        let blastStartX = oldX - Math.cos(angle) * 200;
        let blastStartY = oldY - Math.sin(angle) * 200;
        
        warpTrails.push(new WarpTrail(blastStartX, blastStartY, player.x, player.y, 170, 0.75, varColor('--energy')));
    }
    else if(index === 3) { // Singularity
        playSound('https://media.githubusercontent.com/media/diploidian/void_drifter/refs/heads/main/sounds/engineCircular_000.ogg');
        player.activeSingularity = new Singularity(player.x, player.y, GAME.mouse.worldX, GAME.mouse.worldY);
        entities.push(player.activeSingularity);
    }
    updateUI();
}

function update(dt) {
    if(GAME.state !== 'PLAYING') return;

    if (equipment['Hull'] && equipment['Hull'].perk === 'Repairis') {
        if (equipment['Hull'].upgradedPerk) {
            player.timers.repairis = (player.timers.repairis || 0) + dt;
            if (player.timers.repairis >= 5.0) {
                player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + player.stats.maxHp * 0.03);
                player.timers.repairis -= 5.0;
                createFloatingText("+3% HP", player.x, player.y, '#00ff00', 1.5, false, true);
            }
        } else {
            player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + (player.stats.maxHp * 0.005) * dt);
        }
    }

    // --- Player Movement & Physics ---
    let ax = 0, ay = 0;
    if(GAME.keys.w) ay -= 1;
    if(GAME.keys.s) ay += 1;
    if(GAME.keys.a) ax -= 1;
    if(GAME.keys.d) ax += 1;

    if (ax !== 0 && ay !== 0) {
        let len = Math.hypot(ax, ay);
        ax /= len;
        ay /= len;
    }

    let currentMaxSpeed = player.stats.maxSpeed;
    if (player.timers.dashActive > 0) {
        currentMaxSpeed *= 2;
    }

    if(player.timers.mycelialDebuff > 0) {
        player.timers.mycelialDebuff -= dt;
        currentMaxSpeed *= 0.7; // 30% Slow
        
        // Drain 10% energy over 2 seconds => 5% per second
        player.stats.energy -= (player.stats.maxEnergy * 0.05) * dt;
        if(player.stats.energy < 0) player.stats.energy = 0;
        
        if(Math.random() < dt * 10) {
            createParticles(player.x + MathUtils.rand(-15, 15), player.y + MathUtils.rand(-15, 15), 0, 1, '#99ff33', 0.5);
        }
    }
    
    // Mycelial Cloud Slow
    if (player.timers.inMycelialCloud > 0) {
        const slowProgress = player.timers.inMycelialCloud / 2.0; // 0 to 1
        const speedMultiplier = 1.0 - (0.9 * slowProgress); // 1.0 down to 0.1
        currentMaxSpeed *= speedMultiplier;

        if(Math.random() < dt * 20) { // More intense particle effect
            createParticles(player.x + MathUtils.rand(-20, 20), player.y + MathUtils.rand(-20, 20), 0, 1, 'rgba(153, 255, 51, 0.8)', 1.5);
        }
    }

    let isThrusting = (ax !== 0 || ay !== 0);
    if (isThrusting) {
        player.vx += ax * player.stats.acceleration * dt;
        player.vy += ay * player.stats.acceleration * dt;
    } else {
        player.vx *= player.stats.friction;
        player.vy *= player.stats.friction;
    }

    let speed = Math.hypot(player.vx, player.vy);
    if(speed > currentMaxSpeed) {
        let ratio = currentMaxSpeed / speed;
        player.vx *= ratio; player.vy *= ratio;
    }

    // Dodge
    if(GAME.keys[' '] && player.timers.dodge <= 0) {
        if(ax !== 0 || ay !== 0) {
            let moveAngle = Math.atan2(ay, ax);
            player.timers.dashActive = 0.4;
            player.timers.dodge = 2.0; // cooldown
            player.timers.immunity = 1.0;
            
            let dashSpeed = player.stats.maxSpeed * 2;
            if (player.timers.mycelialDebuff > 0) dashSpeed *= 0.7;
            
            player.vx = Math.cos(moveAngle) * dashSpeed;
            player.vy = Math.sin(moveAngle) * dashSpeed;
            createParticles(player.x, player.y, 0, 20, varColor('--accent'));
        }
    }
    if(player.timers.dodge > 0) player.timers.dodge -= dt;
    if(player.timers.immunity > 0) player.timers.immunity -= dt;
    if(player.timers.dashActive > 0) player.timers.dashActive -= dt;

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
    let targetX = player.x;
    let targetY = player.y;
    let dx = targetX - GAME.camera.x;
    let dy = targetY - GAME.camera.y;
    let dist = Math.hypot(dx, dy);
    let maxSpeed = 1500; // max camera speed per second
    let moveDist = dist * (1 - Math.exp(-5 * dt)); // spring damper
    if (moveDist > maxSpeed * dt) moveDist = maxSpeed * dt;
    if (dist > 0) {
        GAME.camera.x += (dx / dist) * moveDist;
        GAME.camera.y += (dy / dist) * moveDist;
    }

    // Mouse World coords
    let scale = getScale(0);
    GAME.mouse.worldX = (GAME.mouse.x - cw/2) / scale + GAME.camera.x;
    GAME.mouse.worldY = (GAME.mouse.y - ch/2) / scale + GAME.camera.y;

    // Auto attacks (Left Click)
    if(GAME.mouse.left) {
        useSkill(0);
        if (player.activeWhipBeam) {
            if (player.activeWhipBeam.update(dt, GAME.mouse.worldX, GAME.mouse.worldY)) {
                player.activeWhipBeam = null;
            }
        }
    } else if (player.activeWhipBeam) {
        player.activeWhipBeam.dead = true;
        player.activeWhipBeam = null;
    }
    
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
        let eff = 1.0;
        if (equipment['Engine'] && equipment['Engine'].perk === 'Fuel Efficiency') {
            eff = equipment['Engine'].upgradedPerk ? 0.70 : 0.75;
        }
        
        player.stats.fuel -= (speed / player.stats.maxSpeed) * 9 * eff * dt;
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
            playSound('https://media.githubusercontent.com/media/diploidian/void_drifter/refs/heads/main/sounds/forceField_002.ogg');
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
    for(let i=hpOrbs.length-1; i>=0; i--) {
        if(hpOrbs[i].update(dt)) hpOrbs.splice(i, 1);
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

    // Background Space Pinch
    let bh = player.activeSingularity;
    for(let s of GAME.stars) {
        if (s.anchorX === undefined) { s.anchorX = s.x; s.anchorY = s.y; }
        if (bh && (bh.state === 'GROWING' || bh.state === 'CHARGING')) {
            let dist = MathUtils.distance(s.x, s.y, bh.x, bh.y);
            if (dist < bh.maxRadius * 3) {
                let normalizedDist = Math.max(0, 1 - (dist / (bh.maxRadius * 3)));
                let pullVelocity = Math.pow(normalizedDist, 3) * 1500 * dt;
                if (pullVelocity >= dist) {
                    s.x = bh.x; s.y = bh.y;
                } else {
                    let angle = MathUtils.angle(s.x, s.y, bh.x, bh.y);
                    s.x += Math.cos(angle) * pullVelocity;
                    s.y += Math.sin(angle) * pullVelocity;
                }
            }
        }
        s.x += (s.anchorX - s.x) * 4 * dt;
        s.y += (s.anchorY - s.y) * 4 * dt;
    }
    for(let c of GAME.clouds) {
        if (c.anchorX === undefined) { c.anchorX = c.x; c.anchorY = c.y; }
        if (bh && (bh.state === 'GROWING' || bh.state === 'CHARGING')) {
            let dist = MathUtils.distance(c.x, c.y, bh.x, bh.y);
            if (dist < bh.maxRadius * 2) {
                let normalizedDist = Math.max(0, 1 - (dist / (bh.maxRadius * 2)));
                let pullVelocity = Math.pow(normalizedDist, 3) * 800 * dt;
                let angle = MathUtils.angle(c.x, c.y, bh.x, bh.y);
                c.x += Math.cos(angle) * pullVelocity;
                c.y += Math.sin(angle) * pullVelocity;
            }
        }
        c.x += (c.anchorX - c.x) * 2 * dt;
        c.y += (c.anchorY - c.y) * 2 * dt;
    }

    updateMycelialNetwork();

    // Enemy Spawning
    // baseXP sum is mathematically 50 * n * (n-1)
    let baseXP = 50 * player.level * (player.level - 1);
    let totalXP = baseXP + player.xp;

    // Cycle 0: Lv 1-4, Cycle 1: Lv 5-9, Cycle 2: Lv 10-14, etc.
    let cycle = Math.floor(player.level / 5);
    
    // Peak at the 50% mark of the 4th level in the current cycle (e.g., 4.5, 9.5, 14.5)
    let peakLevel = cycle * 5 + 4;
    let targetXP = (50 * peakLevel * (peakLevel - 1)) + (100 * peakLevel * 0.5);

    // Reset curve at the start of each new cycle (Level 1, 5, 10)
    let startLevel = cycle === 0 ? 1 : cycle * 5;
    let startXP = 50 * startLevel * (startLevel - 1);

    let progress = MathUtils.clamp((totalXP - startXP) / Math.max(1, targetXP - startXP), 0, 1.5);
    let spawnRate = 0.5 + 0.5 * Math.pow(progress, 2); // Exponential curve

    // Mycelial Cloud Debuff Logic
    let isInsideLoop = false;
    if (mycelialLoops.length > 0) {
        for (const loop of mycelialLoops) {
            if (isPointInPolygon({x: player.x, y: player.y}, loop)) {
                isInsideLoop = true;
                break;
            }
        }
    }
    if (isInsideLoop) {
        player.timers.inMycelialCloud = Math.min(2.0, (player.timers.inMycelialCloud || 0) + dt);
        player.stats.shields -= player.stats.maxShields * 0.01 * dt;
        if (player.stats.shields < 0) player.stats.shields = 0;
    } else {
        player.timers.inMycelialCloud = Math.max(0, (player.timers.inMycelialCloud || 0) - dt);
    }

    if (typeof devSettings !== 'undefined') spawnRate *= devSettings.spawnRateMult;
    if (!GAME.activeBoss && Math.random() < dt * spawnRate) {
    let angle = Math.random() * Math.PI * 2;
    let dist = MathUtils.rand(800, 1200);
    if (GAME.bossDefeated && Math.random() < 0.20) {
        let r = Math.random();
        if (r < 0.5) {
            entities.push(new MycelialSpreader(player.x + Math.cos(angle) * dist, player.y + Math.sin(angle) * dist));
        } else {
            entities.push(new MonolithArchitect(player.x + Math.cos(angle) * dist, player.y + Math.sin(angle) * dist));
        }
    } else {
        entities.push(new Enemy(player.x + Math.cos(angle) * dist, player.y + Math.sin(angle) * dist));
    }
}

// Map chunk discovery for minimap
let chunkX = Math.floor(player.x / 200);
let chunkY = Math.floor(player.y / 200);
    let chunkKey = chunkX + "," + chunkY;
    if (!GAME.fowMap.has(chunkKey)) GAME.fowMap.set(chunkKey, true);

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
            
            let stretch = 1;
            let drawAngle = 0;
            let bh = player.activeSingularity;
            if (bh && (bh.state === 'GROWING' || bh.state === 'CHARGING')) {
                let dist = MathUtils.distance(s.x, s.y, bh.x, bh.y);
                if (dist < bh.maxRadius * 3) {
                    let normalizedDist = Math.max(0, 1 - (dist / (bh.maxRadius * 3)));
                    stretch = 1 + Math.pow(normalizedDist, 3) * 15;
                    alpha = Math.min(1.0, alpha + normalizedDist);
                    drawAngle = MathUtils.angle(s.x, s.y, bh.x, bh.y);
                }
            }

            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            let scale = getScale(s.z);
            if (stretch > 1) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(drawAngle);
                ctx.scale(stretch, 1 / stretch);
                ctx.beginPath(); ctx.arc(0, 0, s.size * scale, 0, Math.PI*2); ctx.fill();
                ctx.restore();
            } else {
                ctx.beginPath(); ctx.arc(p.x, p.y, s.size * scale, 0, Math.PI*2); ctx.fill();
            }
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

    // Draw Mycelial Clouds
    ctx.fillStyle = 'rgba(153, 255, 51, 0.1)';
    ctx.strokeStyle = 'rgba(153, 255, 51, 0.2)';
    ctx.lineWidth = 1;
    for (const loop of mycelialLoops) {
        if (loop.length < 3) continue;
        
        let p0 = project(loop[0].x, loop[0].y, 0);
        if (!p0) continue;

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < loop.length; i++) {
            let p = project(loop[i].x, loop[i].y, 0);
            if (p) ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Gaseous particles
        if (Math.random() < 0.1) {
            let node = loop[MathUtils.randInt(0, loop.length - 1)];
            createParticles(node.x + MathUtils.rand(-200, 200), node.y + MathUtils.rand(-200, 200), 0, 1, 'rgba(153, 255, 51, 0.4)', 3.0);
        }
    }

    // Draw order: Z-sorting
    RENDER_LIST.length = 0;
    for(let i=0; i<entities.length; i++) RENDER_LIST.push(entities[i]);
    for(let i=0; i<drops.length; i++) RENDER_LIST.push(drops[i]);
    for(let i=0; i<xpOrbs.length; i++) RENDER_LIST.push(xpOrbs[i]);
    for(let i=0; i<hpOrbs.length; i++) RENDER_LIST.push(hpOrbs[i]);
    for(let i=0; i<particles.length; i++) RENDER_LIST.push(particles[i]);
    for(let i=0; i<projectiles.length; i++) RENDER_LIST.push(projectiles[i]);
    for(let i=0; i<shockwaves.length; i++) RENDER_LIST.push(shockwaves[i]);
    for(let i=0; i<warpTrails.length; i++) RENDER_LIST.push(warpTrails[i]);
    if (player.activeWhipBeam) RENDER_LIST.push(player.activeWhipBeam);
    RENDER_LIST.push({ isPlayerShip: true, x: player.x, y: player.y, z: 0 });
    
    RENDER_LIST.sort((a, b) => b.z - a.z); // draw deep space first

    for(let i=0; i<RENDER_LIST.length; i++) {
        let obj = RENDER_LIST[i];
        if(obj.isPlayerShip) {
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

                // Dash Cooldown Indicator
                if(player.timers.dodge > 0) {
                    let dodgeProgress = player.timers.dodge / 2.0;
                    ctx.strokeStyle = `rgba(255, 255, 255, 0.5)`;
                    ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(0,0,32, -Math.PI/2, -Math.PI/2 + Math.PI * 2 * dodgeProgress); ctx.stroke();
                }

                ctx.rotate(player.angle);
                
                if (player.timers.immunity > 0) {
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = '#fff';
                }

                // Ship Body
                ctx.fillStyle = '#111';
                ctx.strokeStyle = player.timers.immunity > 0 ? '#fff' : varColor('--accent');
                ctx.lineWidth = player.timers.immunity > 0 ? 3 : 2;
                ctx.beginPath();
                ctx.moveTo(20, 0); ctx.lineTo(-15, 15); ctx.lineTo(-10, 0); ctx.lineTo(-15, -15);
                ctx.closePath();
                ctx.fill(); ctx.stroke();
                
                ctx.shadowBlur = 0;

                // Shields
                if(player.stats.shields > 0) {
                    ctx.strokeStyle = `rgba(51, 204, 255, ${0.2 + (player.stats.shields/player.stats.maxShields)*0.5})`;
                    ctx.lineWidth = 2;
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
window.addEventListener('resize', () => {
    cw = canvas.width = window.innerWidth;
    ch = canvas.height = window.innerHeight;
});
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
window.addEventListener('blur', () => {
    for (let k in GAME.keys) GAME.keys[k] = false;
    GAME.mouse.left = false;
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
        playSound('https://media.githubusercontent.com/media/diploidian/void_drifter/refs/heads/main/sounds/impactMetal_004.ogg');
        let item = inventory[idx];
        let amount = (equipment['Engine'] && equipment['Engine'].upgradedPerk) ? 30 : 20;
        player.stats.fuel = Math.min(player.stats.maxFuel, player.stats.fuel + amount);
        item.count--;
        if (item.count <= 0) inventory[idx] = null;
        renderInventory();
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
    desc: 'Restores 20 Fuel on use.'
};
renderInventory();
renderEquipment();
updateUI();
requestAnimationFrame(t => { GAME.lastTime = t; loop(t); });