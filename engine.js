import * as PIXI from 'pixi.js';
window.PIXI = PIXI;

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

window.getScale = getScale;
window.project = project;

function drawGrid() {
    let g = GAME.graphics.grid;
    g.clear();
    g.lineStyle(1, 0x1a2b4c, 0.3);
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

    for(let x = startX; x < right; x += gridSize) {
        let px = (x - cx) * scale + hw;
        g.moveTo(px, (top - cy) * scale + hh);
        g.lineTo(px, (bottom - cy) * scale + hh);
    }
    for(let y = startY; y < bottom; y += gridSize) {
        let py = (y - cy) * scale + hh;
        g.moveTo((left - cx) * scale + hw, py);
        g.lineTo((right - cx) * scale + hw, py);
    }
}

/** ==========================================
 * MAIN GAME LOOP & LOGIC
 * ========================================== */
function initPixi() {
    miniCanvas = document.getElementById('minimap');
    if (miniCanvas) {
        GAME.minimapApp = new PIXI.Application({
            view: miniCanvas,
            width: 200,
            height: 200,
            backgroundColor: 0x050508,
            antialias: false
        });
        GAME.minimapGraphics = new PIXI.Graphics();
        GAME.minimapApp.stage.addChild(GAME.minimapGraphics);
    }
    GAME.pixiApp = new PIXI.Application({
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0x050508, 
        resizeTo: window,
        antialias: true,
        preference: 'webgl'
    });
    document.getElementById('pixi-container').appendChild(GAME.pixiApp.view);

    GAME.layers.background = new PIXI.Container();
    GAME.layers.game = new PIXI.Container();
    GAME.layers.ui = new PIXI.Container();
    
    // Automate z-sorting natively within PixiJS for future phases!
    GAME.layers.game.sortableChildren = true;

    GAME.pixiApp.stage.addChild(GAME.layers.background);
    GAME.pixiApp.stage.addChild(GAME.layers.game);
    GAME.pixiApp.stage.addChild(GAME.layers.ui);

    // Generate base Star Texture
    const starGraphics = new PIXI.Graphics();
    starGraphics.beginFill(0xFFFFFF);
    starGraphics.drawCircle(0, 0, 10);
    starGraphics.endFill();
    GAME.textures.star = GAME.pixiApp.renderer.generateTexture(starGraphics);

    // Generate soft Cloud Texture via 2D Canvas Fallback
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 256; cloudCanvas.height = 256;
    const cCtx = cloudCanvas.getContext('2d');
    const grad = cCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    cCtx.fillStyle = grad; cCtx.fillRect(0,0,256,256);
    GAME.textures.cloud = PIXI.Texture.from(cloudCanvas);

    // Generate XpOrb
    const xpG = new PIXI.Graphics();
    xpG.beginFill(0x00ff66); xpG.drawCircle(0, 0, 4); xpG.endFill();
    GAME.textures.xpOrb = GAME.pixiApp.renderer.generateTexture(xpG);

    const xpBG = new PIXI.Graphics();
    xpBG.lineStyle(1, 0xffffff); xpBG.beginFill(0xaaffcc); xpBG.drawCircle(0, 0, 5); xpBG.endFill();
    GAME.textures.xpOrbBonus = GAME.pixiApp.renderer.generateTexture(xpBG);

    const hpG = new PIXI.Graphics();
    hpG.beginFill(0xff3366); hpG.drawCircle(0, 0, 6); hpG.endFill();
    hpG.beginFill(0xffffff); hpG.drawRect(-1, -3, 2, 6); hpG.drawRect(-3, -1, 6, 2); hpG.endFill();
    GAME.textures.hpOrb = GAME.pixiApp.renderer.generateTexture(hpG);

    const specialFuelG = new PIXI.Graphics();
    specialFuelG.beginFill(0xffff00); specialFuelG.drawCircle(0, 0, 10); specialFuelG.endFill();
    specialFuelG.beginFill(0x000000); specialFuelG.drawRect(-2, -4, 4, 8); specialFuelG.endFill();
    GAME.textures.specialFuel = GAME.pixiApp.renderer.generateTexture(specialFuelG);

    // Setup Shared Dynamic & UI Graphics
    GAME.graphics = { mycelial: new PIXI.Graphics(), grid: new PIXI.Graphics() };
    GAME.layers.background.addChild(GAME.graphics.grid);
    GAME.graphics.mycelial.zIndex = 0;

    GAME.graphics.damageGlow = new PIXI.Graphics();
    GAME.layers.ui.addChild(GAME.graphics.damageGlow);
    
    let icon = getIcon('BossSkull', '#ff0000');
    GAME.graphics.bossIndicator = new PIXI.Sprite(PIXI.Texture.from(icon.img));
    GAME.graphics.bossIndicator.anchor.set(0.5);
    GAME.layers.ui.addChild(GAME.graphics.bossIndicator);
    GAME.layers.game.addChild(GAME.graphics.mycelial);

    // Setup Player Ship Pixi Object
    player.pixiObj = new PIXI.Container();
    player.rangeOverlays = new PIXI.Graphics();
    player.body = new PIXI.Graphics();
    player.shieldGraphics = new PIXI.Graphics();
    
    player.body.beginFill(0x111111);
    player.body.lineStyle(2, 0xffffff); // White line to tint perfectly
    player.body.moveTo(20, 0); player.body.lineTo(-15, 15); player.body.lineTo(-10, 0); player.body.lineTo(-15, -15); player.body.closePath();
    player.body.endFill();
    
    player.pixiObj.addChild(player.rangeOverlays, player.body, player.shieldGraphics);
    GAME.layers.game.addChild(player.pixiObj);
}

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
            projectiles.push(new Projectile(player.x, player.y, angle - Math.PI/25, 600, getDamage(player), true, varColor('--accent'), player));
            projectiles.push(new Projectile(player.x, player.y, angle + Math.PI/25, 600, getDamage(player), true, varColor('--accent'), player));
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

    let isThrustingInput = (ax !== 0 || ay !== 0);

    if (GAME.keys[' '] && isThrustingInput) {
        player.timers.boostCharge = Math.min(2.0, (player.timers.boostCharge || 0) + dt);
    } else {
        player.timers.boostCharge = Math.max(0, (player.timers.boostCharge || 0) - dt * 4.0); // fast decay
    }
    
    let boostMult = 1.0 + 0.5 * ((player.timers.boostCharge || 0) / 2.0);
    let currentMaxSpeed = player.stats.maxSpeed * boostMult;

    if(player.timers.mycelialDebuff > 0) {
        player.timers.mycelialDebuff -= dt;
        currentMaxSpeed *= 0.7; // 30% Slow
        
        // Drain shields 5% per second
        player.stats.shields -= (player.stats.maxShields * 0.05) * dt;
        if(player.stats.shields < 0) player.stats.maxShields = 0;
        
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
        let accelMult = GAME.keys[' '] ? 1.5 : 1.0;
        player.vx += ax * player.stats.acceleration * accelMult * dt;
        player.vy += ay * player.stats.acceleration * accelMult * dt;
    } else {
        player.vx *= player.stats.friction;
        player.vy *= player.stats.friction;
    }

    let speed = Math.hypot(player.vx, player.vy);
    if(speed > currentMaxSpeed) {
        let ratio = currentMaxSpeed / speed;
        player.vx *= ratio; player.vy *= ratio;
    }

    // Engine Boost Effects
    if(GAME.keys[' '] && isThrustingInput) {
        if(Math.random() < dt * 20) {
            let moveAngle = Math.atan2(ay, ax);
            createParticles(player.x - Math.cos(moveAngle) * 15 + MathUtils.rand(-5,5), player.y - Math.sin(moveAngle) * 15 + MathUtils.rand(-5,5), 0, 1, varColor('--accent'), 0.5);
        }
    }
    if(player.timers.immunity > 0) player.timers.immunity -= dt;

    // Apply movement
    if(player.stats.fuel > 0 || speed < 50) {
        player.x += player.vx * dt;
        player.y += player.vy * dt;
        // World Bounds
        player.x = MathUtils.clamp(player.x, -WORLD_SIZE, WORLD_SIZE);
        player.y = MathUtils.clamp(player.y, -WORLD_SIZE, WORLD_SIZE);
    } else {
        // Out of fuel, severely crippled movement
        player.x += (player.vx * 0.2) * dt;
        player.y += (player.vy * 0.2) * dt;
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
        if(player.activeWhipBeam.graphics) {
            player.activeWhipBeam.graphics.destroy();
            player.activeWhipBeam.graphics = null;
        }
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
    if(player.timers.flash > 0) player.timers.flash -= dt;

    // --- Resource Regen & Drain ---
    if(speed > 10) {
        let eff = 1.0;
        if (equipment['Engine'] && equipment['Engine'].perk === 'Fuel Efficiency') {
            eff = equipment['Engine'].upgradedPerk ? 0.70 : 0.75;
        }
        
        // 1. Calculate the base drain
        let baseDrain = (speed / player.stats.maxSpeed) * 9 * eff * dt;        
        // 2. Calculate the flat reduction for this specific frame
        let flatReduction = (player.stats.flatFuelReduction || 0) * dt;
        // 3. Apply the reduction, preventing negative drain (healing)
        let finalDrain = Math.max(0, baseDrain - flatReduction);
        
        player.stats.fuel -= finalDrain;
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

    // --- Thruster Audio Loop ---
    if (!GAME.thrusterAudio) {
        GAME.thrusterAudio = new Audio('sounds/thruster.ogg');
        GAME.thrusterAudio.loop = true;
        GAME.thrusterAudio.volume = 0;
        GAME.thrusterAudio.preservesPitch = false;
        GAME.thrusterAudio.mozPreservesPitch = false;
        GAME.thrusterAudio.webkitPreservesPitch = false;
        // Attempt to start playing (will succeed once player has interacted with the page)
        GAME.thrusterAudio.play().catch(() => {});
    }

    if (GAME.thrusterAudio && !GAME.thrusterAudio.paused) {
        let baseMax = player.stats.maxSpeed;
        
        // 1. Volume Calculation
        let targetVol = 0;
        if (speed >= 10) {
            // Scales from 30% at 10 speed to 100% at maxSpeed
            targetVol = 0.3 + 0.7 * Math.min(1.0, (speed - 10) / Math.max(1, baseMax - 10));
        } else if (speed > 0.5) {
            // Fades out below 10 speed
            targetVol = 0.3 * (speed / 10);
        }
        GAME.thrusterAudio.volume = targetVol;

        // 2. Pitch Calculation (Semitones)
        let baseSemi = -2;
        if (speed >= 10) {
            // Scales from -2 to 0 between 10 speed and 50% maxSpeed
            baseSemi = -2 + 2 * Math.min(1.0, (speed - 10) / Math.max(1, (baseMax * 0.5) - 10));
        }
        
        // 3. Boost Pitch Calculation
        let boostProgress = (player.timers.boostCharge || 0) / 2.0;
        let finalSemi = baseSemi + (7 * boostProgress);
        
        GAME.thrusterAudio.playbackRate = Math.pow(2, finalSemi / 12);
    }

    for(let i=0; i<4; i++) {
        if(player.skills[i].cd > 0) player.skills[i].cd -= dt;
    }

    // --- Entity Updates ---
    for(let i=entities.length-1; i>=0; i--) {
        let e = entities[i];
        if(e.dead) {
            entities.splice(i, 1);
            continue;
        }
        
        if (e instanceof Enemy || e instanceof BrutalistMonolith || e instanceof FungalNode) {
            if (e.ramCooldown === undefined) e.ramCooldown = 0;
            if (e.ramCooldown > 0) e.ramCooldown -= dt;
            
            if (e.z <= 0) {
                let distToPlayer = MathUtils.distance(e.x, e.y, player.x, player.y);
                if (distToPlayer < (player.radius + e.radius)) {
                    if (e.ramCooldown <= 0) {
                        e.ramCooldown = 0.4;
                        
                        let currentSpeed = Math.hypot(player.vx, player.vy);
                        let speedDelta = Math.max(0, currentSpeed - player.stats.maxSpeed);
                        
                        // 1% extra damage per unit of speed over base maxSpeed
                        let momentumMult = 1.0 + (speedDelta * 0.01);
                        // Progress towards the theoretical 1.5x max boost (0.0 to 1.0)
                        let boostProgress = Math.min(1.0, speedDelta / (player.stats.maxSpeed * 0.5));

                        let totalDamagePool = (player.stats.damage.min + player.stats.damage.max) / 2;
                        let rating = player.stats.collisionRating || player.stats.collisionDamage || 0;
                        let multiplier = getCollisionMultiplier(rating, player.level);
                        let finalDamage = totalDamagePool * multiplier * momentumMult;

                        // Take recoil. Reduces recoil by up to 80% at maximum boost speed
                        // Cap the damage used for recoil to the enemy's current HP to prevent overkill suicide!
                        let effectiveDamage = Math.min(finalDamage, e.hp);
                        let baseRecoil = effectiveDamage * 0.25; // Dropped from 50% to 25% for better survivability
                        let recoil = baseRecoil * (1.0 - (boostProgress * 0.8));
                        if (recoil > 0) player.takeDamage(recoil, e);

                        // Using a proxy source with 0 critChance bypasses crit rules
                        let dummySource = { stats: { critChance: 0 } };
                        e.takeDamage(finalDamage, dummySource, '#ff8800');

                        // Player forces their way through, transferring knockback to the enemy
                        let bounceAngle = Math.atan2(e.y - player.y, e.x - player.x);
                        e.vx = Math.cos(bounceAngle) * (400 * momentumMult);
                        e.vy = Math.sin(bounceAngle) * (400 * momentumMult);
                        
                        createParticles(e.x, e.y, e.z, 15 + (15 * boostProgress), '#ff8800');
                        shockwaves.push(new Shockwave(e.x, e.y, e.z, '#ff8800', 40 + (20 * boostProgress)));
                    }
                }
            }
        }

        if (e.dead) {
            entities.splice(i, 1);
        } else if(e.update(dt)) {
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
        let spreaderCount = entities.filter(ent => ent instanceof MycelialSpreader).length;
        if (r < 0.5 && spreaderCount < 4) {
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
    
    // Draw Stars
    let time = Date.now() / 1000;
    for(let s of GAME.stars) {
        if (!s.sprite) {
            s.sprite = new PIXI.Sprite(GAME.textures.star);
            s.sprite.anchor.set(0.5);
            GAME.layers.background.addChild(s.sprite);
        }
        let p = project(s.x, s.y, s.z);
        if(p) {
            s.sprite.visible = true;
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

            let scale = getScale(s.z);
            s.sprite.x = p.x;
            s.sprite.y = p.y;
            s.sprite.rotation = drawAngle;
            s.sprite.scale.set((s.size / 10) * scale * stretch, (s.size / 10) * scale * (1 / stretch));
            s.sprite.alpha = alpha;
        } else {
            s.sprite.visible = false;
        }
    }

    // Draw Clouds
    for(let c of GAME.clouds) {
        if(!c.sprite) {
            c.sprite = new PIXI.Sprite(GAME.textures.cloud);
            c.sprite.anchor.set(0.5);
            c.sprite.tint = (c.r << 16) + (c.g << 8) + c.b; 
            GAME.layers.background.addChild(c.sprite);
        }
        let p = project(c.x, c.y, c.z);
        if(p) {
            c.sprite.visible = true;
            let scale = getScale(c.z);
            let rad = c.radius * scale;
            c.sprite.x = p.x;
            c.sprite.y = p.y;
            c.sprite.scale.set(rad / 128); // Original rad / 128px canvas radius
            c.sprite.alpha = c.alpha;
        } else {
            c.sprite.visible = false;
        }
    }

    drawGrid();

    // Draw Mycelial Clouds
    GAME.graphics.mycelial.clear();
    for (const loop of mycelialLoops) {
        if (loop.length < 3) continue;
        
        let p0 = project(loop[0].x, loop[0].y, 0);
        if (!p0) continue;

        GAME.graphics.mycelial.beginFill(0x99ff33, 0.1);
        GAME.graphics.mycelial.lineStyle(1, 0x99ff33, 0.2);
        GAME.graphics.mycelial.moveTo(p0.x, p0.y);
        for (let i = 1; i < loop.length; i++) {
            let p = project(loop[i].x, loop[i].y, 0);
            if (p) GAME.graphics.mycelial.lineTo(p.x, p.y);
        }
        GAME.graphics.mycelial.closePath();
        GAME.graphics.mycelial.endFill();

        // Gaseous particles
        if (Math.random() < 0.1) {
            let node = loop[MathUtils.randInt(0, loop.length - 1)];
            createParticles(node.x + MathUtils.rand(-200, 200), node.y + MathUtils.rand(-200, 200), 0, 1, 'rgba(153, 255, 51, 0.4)', 3.0);
        }
    }

    // Loop through everything and call .draw() to update their Pixi properties natively
    for(let i=0; i<entities.length; i++) entities[i].draw();
    for(let i=0; i<drops.length; i++) drops[i].draw();
    for(let i=0; i<xpOrbs.length; i++) xpOrbs[i].draw();
    for(let i=0; i<hpOrbs.length; i++) hpOrbs[i].draw();
    for(let i=0; i<particles.length; i++) particles[i].draw();
    for(let i=0; i<projectiles.length; i++) projectiles[i].draw();
    for(let i=0; i<shockwaves.length; i++) shockwaves[i].draw();
    for(let i=0; i<warpTrails.length; i++) warpTrails[i].draw();
    if (player.activeWhipBeam) player.activeWhipBeam.draw();

    // Player PIXI Sync
    let p = project(player.x, player.y, 0);
    if(p) {
        player.pixiObj.visible = true;
        let s = getScale(0);
        player.pixiObj.position.set(p.x, p.y);
        player.pixiObj.scale.set(s);
        player.pixiObj.zIndex = 0;
        
        player.body.rotation = player.angle;

        let accentHex = parseColor(varColor('--accent'));
        if (player.timers.immunity > 0 || player.timers.flash > 0) {
            player.body.tint = 0xffffff;
        } else {
            player.body.tint = accentHex;
        }
        
        player.rangeOverlays.clear();
        player.rangeOverlays.lineStyle(1, 0x00d2ff, 0.05); player.rangeOverlays.drawCircle(0, 0, 1200);
        player.rangeOverlays.lineStyle(1, 0x33ccff, 0.1); player.rangeOverlays.drawCircle(0, 0, 270);
        player.rangeOverlays.lineStyle(1, 0x9933ff, 0.08); player.rangeOverlays.drawCircle(0, 0, 300);
        player.rangeOverlays.lineStyle(1, 0xff0055, 0.05); player.rangeOverlays.drawCircle(0, 0, 360);

        if(player.timers.boostCharge > 0) {
            let boostProgress = player.timers.boostCharge / 2.0;
            player.rangeOverlays.lineStyle(2, 0xffffff, 0.5);
            player.rangeOverlays.arc(0, 0, 32, -Math.PI/2, -Math.PI/2 + Math.PI * 2 * boostProgress);
        }

        player.shieldGraphics.clear();
        if(player.stats.shields > 0) {
            let shieldAlpha = 0.2 + (player.stats.shields/player.stats.maxShields)*0.5;
            player.shieldGraphics.lineStyle(2, 0x33ccff, shieldAlpha);
            player.shieldGraphics.drawCircle(0,0,25);
        }
    } else {
        player.pixiObj.visible = false;
    }

    for(let i=0; i<floatingTexts.length; i++) floatingTexts[i].draw();

    // Danger UI Overlay
    GAME.graphics.damageGlow.clear();
    if (player.damageIntensity > 0.1) {
        let alpha = Math.min(0.6, player.damageIntensity * 0.5);
        GAME.graphics.damageGlow.beginFill(0xff0000, alpha);
        GAME.graphics.damageGlow.drawRect(0, 0, cw, ch);
        GAME.graphics.damageGlow.endFill();
    }

    GAME.graphics.bossIndicator.visible = false;
    if (GAME.activeBoss && !project(GAME.activeBoss.x, GAME.activeBoss.y, GAME.activeBoss.z)) {
        let angleToBoss = MathUtils.angle(player.x, player.y, GAME.activeBoss.x, GAME.activeBoss.y);
        let screenX = cw/2 + Math.cos(angleToBoss) * (cw/2 - 40);
        let screenY = ch/2 + Math.sin(angleToBoss) * (ch/2 - 40);
        screenX = MathUtils.clamp(screenX, 40, cw - 40);
        screenY = MathUtils.clamp(screenY, 40, ch - 40);

        GAME.graphics.bossIndicator.visible = true;
        GAME.graphics.bossIndicator.position.set(screenX, screenY);
        GAME.graphics.bossIndicator.rotation = angleToBoss + Math.PI/2;
    }

    drawMinimap();
}

function drawMinimap() {
    if (!GAME.minimapGraphics) return;

    let g = GAME.minimapGraphics;
    g.clear();

    let w = 200;
    let h = 200;
    
    let mapScale = w / (WORLD_SIZE * 2);
    
    // Draw FOW & Radar
    g.beginFill(0xffffff, 0.1);
    for(let [key, val] of GAME.fowMap) {
        let parts = key.split(',');
        let cx = (parseInt(parts[0]) * 200 + WORLD_SIZE) * mapScale;
        let cy = (parseInt(parts[1]) * 200 + WORLD_SIZE) * mapScale;
        g.drawRect(cx, cy, 200*mapScale, 200*mapScale);
    }
    g.endFill();
    
    // Entities on minimap
    for(let e of entities) {
        let mx = (e.x + WORLD_SIZE) * mapScale;
        let my = (e.y + WORLD_SIZE) * mapScale;
        if(mx<0 || mx>w || my<0 || my>h) continue;
        
        if(e instanceof Asteroid) { g.beginFill(0x555555); g.drawRect(mx-1, my-1, 2, 2); g.endFill(); }
        if(e instanceof Enemy) { g.beginFill(0xff0000); g.drawRect(mx-1, my-1, 3, 3); g.endFill(); }
    }
    
    // Player
    let px = (player.x + WORLD_SIZE) * mapScale;
    let py = (player.y + WORLD_SIZE) * mapScale;
    let accentHex = parseColor(varColor('--accent'));
    g.beginFill(accentHex);
    g.drawCircle(px, py, 3);
    g.endFill();
    
    // Radar circle
    g.lineStyle(1, 0x00d2ff, 0.3);
    g.drawCircle(px, py, 800 * mapScale);
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
    cw = window.innerWidth;
    ch = window.innerHeight;
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
initPixi();
initMap();
player.stats.fuel = player.stats.maxFuel; // Start full
inventory[0] = {
    id: 'start-fuel',
    name: 'Fuel Cell',
    type: 'Fuel',
    tier: 0,
    itemLevel: 1,
    stackable: true,
    count: 5,
    desc: 'Restores 20 Fuel on use.'
};
renderInventory();
renderEquipment();
updateUI();
requestAnimationFrame(t => { GAME.lastTime = t; loop(t); });