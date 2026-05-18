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
        this.collisionDamageMult = 0.05;
        this.flashTimer = 0;
        
        // Setup WebGL Container
        this.pixiObj = new PIXI.Container();
        this.body = new PIXI.Graphics();
        
        this.body.beginFill(0x111111);
        this.body.drawPolygon(this.points.flatMap(p => [p.x, p.y + 15]));
        this.body.endFill();
        this.body.beginFill(0x222222);
        this.body.lineStyle(2, 0x555555);
        this.body.drawPolygon(this.points.flatMap(p => [p.x, p.y]));
        this.body.endFill();
        
        this.hpBar = new PIXI.Graphics();
        this.pixiObj.addChild(this.body, this.hpBar);
        GAME.layers.game.addChild(this.pixiObj);
    }
    update(dt) {
        if (this.flashTimer > 0) this.flashTimer -= dt;
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
                let dmg = Math.floor(speed * this.collisionDamageMult); // damage based on speed
                player.takeDamage(dmg);
            }
        }
    }
    draw() {
        let p = project(this.x, this.y, this.z);
        if(!p) {
            if (this.pixiObj) this.pixiObj.visible = false;
            return;
        }
        if (this.pixiObj) {
            this.pixiObj.visible = true;
            let scale = getScale(this.z);
            this.pixiObj.position.set(p.x, p.y);
            this.pixiObj.scale.set(scale);
            this.body.rotation = this.rotation;
            this.pixiObj.zIndex = this.z;

            this.body.tint = this.flashTimer > 0 ? 0xffaaaa : 0xffffff;

            this.hpBar.clear();
            if(this.hp < this.maxHp) {
                this.hpBar.beginFill(0xff0000);
                this.hpBar.drawRect(-this.radius, -this.radius - 10, this.radius*2, 4);
                this.hpBar.beginFill(0x00ff00);
                this.hpBar.drawRect(-this.radius, -this.radius - 10, (this.radius*2) * (this.hp/this.maxHp), 4);
                this.hpBar.endFill();
            }
        }
    }
    takeDamage(amount, source, color = '#fff') {
        if (this.dead) return false;
        this.flashTimer = 0.1;
        let critInfo = calculateCrit(amount, source);
        amount = critInfo.amount;
        this.hp -= amount;
        if (amount >= 1) createFloatingText(`-${Math.floor(amount)}${critInfo.isCrit ? '!' : ''}`, this.x, this.y, color, 1.0, false, true, critInfo.isCrit);
        if(this.hp <= 0) {
            this.dead = true;
            if (this.pixiObj) {
                this.pixiObj.destroy({ children: true });
                this.pixiObj = null;
            }

            createParticles(this.x, this.y, this.z, 20, '#555');
            // Drop loot
            for(let i=0; i<MathUtils.randInt(2, 4); i++) {
                spawnDrop(this.x, this.y, true); // force resource
            }
            if(Math.random() < 0.1) spawnDrop(this.x, this.y); // small chance for gear
            
            if (Math.random() < HP_ORB_DROP_RATE) {
                hpOrbs.push(new HpOrb(this.x, this.y));
            }

            // Small chance for fragments
            if(Math.random() < 0.3) {
                let totalXp = player.level * 1;
                let numOrbs = MathUtils.randInt(1, 3);
                let xpPerOrb = totalXp / numOrbs;
                for(let i=0; i<numOrbs; i++) xpOrbs.push(new XpOrb(this.x, this.y, xpPerOrb));
                
                if (equipment['Reactor'] && equipment['Reactor'].upgradedPerk) {
                    let bonusOrbs = MathUtils.randInt(3, 5);
                    for(let i=0; i<bonusOrbs; i++) xpOrbs.push(new XpOrb(this.x, this.y, xpPerOrb * 1.2, true));
                }
            }
            return true; // remove
        }
        return false;
    }
}

class Enemy {
    constructor(x, y) {
        this.x = x; this.y = y; this.z = 0; // Spawn at z=0
        this.radius = 12;
        this.level = player.level;
        
        // Scale HP and Damage with Level
        this.maxHp = 50 * (1 + (this.level - 1) * 0.3);
        this.hp = this.maxHp;
        
        this.baseDamage = 5;
        this.damageScale = 0.2;
        this.meleeMult = 1.15;
        this.aoeMeleeMult = 1.5; // (3/2)
        this.shooterDamageMult = 1.7;
        this.rapidShotDamageMult = 1.0;
        this.damage = this.baseDamage * (1 + (this.level - 1) * this.damageScale);
        this.dead = false;
        
        this.speed = 150 + (this.level * 2); // get slightly faster
        this.attackTimer = 0;
        this.stunTimer = 0;
        this.type = Math.random() < 0.7 ? 'chaser' : 'shooter';
        this.baseXp = this.type === 'chaser' ? 5 : 8;
        if (this.type === 'chaser') {
            this.speed *= 0.8;
            this.attackCombo = 0;
            this.chaserKnockbackTimer = 0;
            this.chaserSlowTimer = 0;
        } else {
            this.orbitDir = Math.random() < 0.5 ? 1 : -1;
            this.rapidShotTimer = 10.0;
            this.rapidShotsToFire = 0;
            this.rapidShotInterval = 0;
            this.knockbackVx = 0;
            this.knockbackVy = 0;
        }
        this.color = this.type === 'chaser' ? '#ff0055' : '#00ffcc';
        this.inMeleeRange = false;
        this.windupCooldown = 0;
        
        this.empKnockbackTimer = 0;
        this.empKnockbackVx = 0;
        this.empKnockbackVy = 0;
        this.empSlowTimer = 0;
        
        this.flashTimer = 0;
        this.baseTint = this.type === 'chaser' ? 0xff0055 : (this.type === 'boss' ? 0xff4400 : 0x00ffcc);
        
        this.pixiObj = new PIXI.Container();
        this.body = new PIXI.Graphics();
        
        if (this.type === 'chaser') {
            this.body.beginFill(0x000000, 0.8);
            this.body.lineStyle(2, 0xffffff);
            this.body.moveTo(15, 0); this.body.lineTo(-10, 10); this.body.lineTo(-5, 0); this.body.lineTo(-10, -10); this.body.closePath();
            this.body.endFill();
            
            this.comboOverlay = new PIXI.Graphics();
            this.comboOverlay.beginFill(0xffffff, 1.0);
            this.comboOverlay.moveTo(15, 0); this.comboOverlay.lineTo(-10, 10); this.comboOverlay.lineTo(-5, 0); this.comboOverlay.lineTo(-10, -10); this.comboOverlay.closePath();
            this.comboOverlay.endFill();
            this.comboOverlay.visible = false;
            
            this.pixiObj.addChild(this.body, this.comboOverlay);
        } else {
            this.body.beginFill(0x000000, 0.8);
            this.body.lineStyle(2, 0xffffff);
            this.body.drawCircle(0, 0, this.radius);
            this.body.moveTo(0,0); this.body.lineTo(15, 0);
            this.body.endFill();
            this.pixiObj.addChild(this.body);
        }

        this.body.tint = this.baseTint;
        
        GAME.layers.game.addChild(this.pixiObj);
    }
    update(dt) {
        // Z-axis entrance
        if(this.z > 0) {
            this.z += this.vz * dt;
            if(this.z <= 0) { this.z = 0; this.vz = 0; }
            return; // don't act while spawning
        }
        
        if (this.flashTimer > 0) this.flashTimer -= dt;
        
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
                if (!this.inMeleeRange) {
                    this.inMeleeRange = true;
                    if (this.attackTimer <= 0 && this.windupCooldown <= 0) {
                        this.attackTimer = 0.45;
                        this.windupCooldown = MathUtils.rand(1.0, 4.0);
                    }
                }
                if (this.attackTimer <= 0) {
                    player.takeDamage(getDamage(this) * this.meleeMult, this);
                    this.attackTimer = 1.0;
                    this.chaserKnockbackTimer = 0.2;
                    this.chaserSlowTimer = 1.2;
                    this.knockbackVx = -Math.cos(angle) * 250;
                    this.knockbackVy = -Math.sin(angle) * 250;
                    this.vx = this.knockbackVx;
                    this.vy = this.knockbackVy;
                    this.attackCombo++;
                    if (this.attackCombo >= 4) {
                        let aoeDmg = getDamage(this) * this.aoeMeleeMult;
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
                        if (this.pixiObj) {
                            this.pixiObj.destroy({ children: true });
                            this.pixiObj = null;
                        }
                        return true; // Despawn without dropping loot/xp
                    } else {
                        player.takeDamage(getDamage(this), this);
                    }
                }
            } else {
                this.inMeleeRange = false;
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
                    this.rapidShotsToFire = 2;
                    this.rapidShotInterval = 0.5;
                    this.rapidShotTimer = 10.0;
                }

                // 3. Handle the Rapid Fire sequence
                if (this.rapidShotsToFire > 0) {
                    if (this.rapidShotInterval <= 0) {
                        projectiles.push(new Projectile(this.x, this.y, angle, 200, getDamage(this) * this.rapidShotDamageMult, false, this.color, this));
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
                    projectiles.push(new Projectile(this.x, this.y, angle, 200, getDamage(this) * this.shooterDamageMult, false, this.color, this));
                    this.attackTimer = 2.0;
                }
            }
        }
        
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if(this.attackTimer > 0) this.attackTimer -= dt;
    }
    draw() {
        let p = project(this.x, this.y, this.z);
        if(!p) {
            if(this.pixiObj) this.pixiObj.visible = false;
            return;
        }
        
        if (this.pixiObj) {
            this.pixiObj.visible = true;
            let scale = getScale(this.z);
            this.pixiObj.position.set(p.x, p.y);
            this.pixiObj.scale.set(scale);
            this.pixiObj.zIndex = this.z;
            
            let overrideAngle = null;
            if (this.blackHole) {
                let bhDist = MathUtils.distance(this.x, this.y, this.blackHole.x, this.blackHole.y);
                if (bhDist < 30) {
                    this.pixiObj.visible = false;
                } else {
                    let normalizedDist = Math.max(0, 1 - (bhDist / this.blackHole.currentRadius));
                    let stretch = 1 + Math.pow(normalizedDist, 3) * 4;
                    this.pixiObj.scale.set(scale * stretch, scale / stretch);
                    overrideAngle = MathUtils.angle(this.x, this.y, this.blackHole.x, this.blackHole.y);
                }
            }

            let angle = overrideAngle !== null ? overrideAngle : Math.atan2(this.vy, this.vx);
            this.body.rotation = angle;
            
            if (this.type === 'chaser') {
                if (this.comboOverlay) {
                    this.comboOverlay.rotation = angle;
                    if (this.attackCombo > 0) {
                        this.comboOverlay.visible = true;
                        if (this.attackCombo === 1) { this.comboOverlay.tint = 0xff0000; this.comboOverlay.alpha = 0.5; }
                        else if (this.attackCombo === 2) { this.comboOverlay.tint = 0xff8000; this.comboOverlay.alpha = 0.5; }
                        else if (this.attackCombo === 3) {
                            let t = (Math.sin(Date.now() / 100) + 1) / 2;
                            let g = Math.floor(128 + 127 * t);
                            this.comboOverlay.tint = (255 << 16) + (g << 8) + 0;
                            this.comboOverlay.alpha = 0.7;
                        }
                    } else {
                        this.comboOverlay.visible = false;
                    }
                }
            }

            if (this.flashTimer > 0) {
                this.body.tint = 0xffffff;
            } else if (this.stunTimer > 0 || this.empSlowTimer > 0) {
                this.body.tint = 0x00d2ff; // Bright electric blue while EMP slowed
            } else {
                this.body.tint = this.baseTint;
            }
        }
    }
    takeDamage(amount, source, color = '#fff') {
        if (this.dead) return false;
        this.flashTimer = 0.1;
        let critInfo = calculateCrit(amount, source);
        amount = critInfo.amount;
        this.hp -= amount;
        if (amount >= 1) createFloatingText(`-${Math.floor(amount)}${critInfo.isCrit ? '!' : ''}`, this.x, this.y, color, 1.0, false, true, critInfo.isCrit);
        if(this.hp <= 0) {
            this.dead = true;
            if (this.pixiObj) {
                this.pixiObj.destroy({ children: true });
                this.pixiObj = null;
            }
            player.totalKills++;
            player.killsThisLevel++;

            if (player.stats.energyOnKill > 0) {
                player.stats.energy = Math.min(player.stats.maxEnergy, player.stats.energy + player.stats.energyOnKill);
            }

            let isNormalFlak = source === player && equipment['Secondary Weapon'] && equipment['Secondary Weapon'].perk === 'Explosive Enemies';
            let isChainedFlak = source.isFlak && source.upgradedFlak;
            
            if (isNormalFlak || isChainedFlak) {
                createParticles(this.x, this.y, this.z, 50, '#ffaa00');
                let isUpgraded = isChainedFlak ? true : equipment['Secondary Weapon'].upgradedPerk;
                let explosionSource = { stats: player.stats, isFlak: true, upgradedFlak: isUpgraded };
                for(let other of entities) {
                    if (other instanceof Enemy && !other.dead && other !== this && MathUtils.distance(this.x, this.y, other.x, other.y) < 200) {
                        other.takeDamage(getDamage(player) * 0.5, explosionSource, '#ffaa00');
                    }
                }
            }

            createParticles(this.x, this.y, this.z, 30, this.color);
            if(Math.random() < 0.5) spawnDrop(this.x, this.y);
            
            if (Math.random() < HP_ORB_DROP_RATE) {
                hpOrbs.push(new HpOrb(this.x, this.y));
            }

            // Drop XP Orbs
            let totalXp = this.baseXp * this.level;
            let numOrbs = MathUtils.randInt(3, 5);
            let xpPerOrb = totalXp / numOrbs;
            for(let i=0; i<numOrbs; i++) xpOrbs.push(new XpOrb(this.x, this.y, xpPerOrb));
            
            if (equipment['Reactor'] && equipment['Reactor'].upgradedPerk) {
                let bonusOrbs = MathUtils.randInt(3, 5);
                for(let i=0; i<bonusOrbs; i++) xpOrbs.push(new XpOrb(this.x, this.y, xpPerOrb * 1.05, true));
            }
            
            return true;
        }
        return false;
    }
}

class FungalNode {
    constructor(x, y, level, networkId = null) {
        this.x = x; this.y = y; this.z = 0;
        this.level = level;
        this.radius = 12;
        this.baseXp = 2;
        this.maxHp = 25 * level;
        this.hp = this.maxHp;
        this.dead = false;
        this.pulseTimer = 0;
        this.networkId = networkId;
        // If part of a structured network, live indefinitely until replaced by Spreader
        this.life = networkId !== null ? 999999 : 15.0; 
        this.links = []; // Connected Mycelial nodes
        this.flashTimer = 0;
        
        this.pixiObj = new PIXI.Container();
        this.linksGraphics = new PIXI.Graphics();
        this.body = new PIXI.Graphics();
        
        this.body.beginFill(0x223311);
        this.body.lineStyle(2, 0xffffff); // White line to tint
        this.body.drawCircle(0, 0, this.radius);
        this.body.endFill();
        
        this.core = new PIXI.Graphics();
        this.core.beginFill(0x99ff33);
        this.core.drawCircle(0, 0, this.radius * 0.5);
        this.core.endFill();
        
        this.pixiObj.addChild(this.linksGraphics, this.body, this.core);
        GAME.layers.game.addChild(this.pixiObj);
    }
    update(dt) {
        if (this.dead) return true;
        if (this.flashTimer > 0) this.flashTimer -= dt;
        this.pulseTimer += dt;
        this.life -= dt;
        
        if (this.life <= 0) {
            this.dead = true;
            if (this.pixiObj) {
                this.pixiObj.destroy({ children: true });
                this.pixiObj = null;
            }
            createParticles(this.x, this.y, 0, 10, '#99ff33');
            return true;
        }
        
        // Form Mycelial Links
        this.links = [];
        for (let e of entities) {
            if (e instanceof FungalNode && e !== this && !e.dead) {
                if (MathUtils.distance(this.x, this.y, e.x, e.y) <= 400) {
                    if (this.networkId === null || e.networkId === null || this.networkId === e.networkId) {
                        this.links.push(e);
                    }
                }
            }
        }
        
        // Apply debuff if player is touching the mycelial web
        for (let e of this.links) {
            let d = MathUtils.distToSegment(player.x, player.y, this.x, this.y, e.x, e.y);
            if (d < player.radius + 5) {
                player.timers.mycelialDebuff = 0.5; // Stacks small chunks to maintain duration while crossed
            }
        }
        
        return false;
    }
    draw() {
        let p = project(this.x, this.y, this.z);
        if(!p) {
            if(this.pixiObj) this.pixiObj.visible = false;
            return;
        }
        
        if (this.pixiObj) {
            this.pixiObj.visible = true;
            let scale = getScale(this.z);
            this.pixiObj.position.set(p.x, p.y);
            this.pixiObj.scale.set(scale);
            this.pixiObj.zIndex = this.z;
            
            let pulse = 1 + 0.1 * Math.sin(this.pulseTimer * 5);
            this.body.scale.set(pulse);
            this.core.scale.set(pulse);
            this.core.alpha = 0.5 + 0.5 * Math.sin(this.pulseTimer * 5);
            
            this.body.tint = this.flashTimer > 0 ? 0xffffff : 0x99ff33;
            
            this.linksGraphics.clear();
            let linkAlpha = 0.4 + 0.2 * Math.sin(this.pulseTimer * 3);
            this.linksGraphics.lineStyle(2, 0x99ff33, linkAlpha);
            
            for (let e of this.links) {
                let p2 = project(e.x, e.y, e.z);
                if (p2 && (e.x > this.x || (e.x === this.x && e.y > this.y))) {
                    let localX = (p2.x - p.x) / scale;
                    let localY = (p2.y - p.y) / scale;
                    this.linksGraphics.moveTo(0, 0);
                    this.linksGraphics.lineTo(localX, localY);
                }
            }
        }
    }
    takeDamage(amount, source, color = '#fff') {
        if (this.dead) return false;
        this.flashTimer = 0.1;
        let critInfo = calculateCrit(amount, source);
        amount = critInfo.amount;
        this.hp -= amount;
        if (amount >= 1) createFloatingText(`-${Math.floor(amount)}${critInfo.isCrit ? '!' : ''}`, this.x, this.y, color, 1.0, false, true, critInfo.isCrit);
        if(this.hp <= 0) {
            this.dead = true;
            if (this.pixiObj) {
                this.pixiObj.destroy({ children: true });
                this.pixiObj = null;
            }
            createParticles(this.x, this.y, 0, 20, '#99ff33');
            if (Math.random() < 0.2) xpOrbs.push(new XpOrb(this.x, this.y, this.level * 2));
            if (Math.random() < HP_ORB_DROP_RATE) hpOrbs.push(new HpOrb(this.x, this.y));
            return true;
        }
        return false;
    }
}

class MycelialSpreader extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.radius = 20;
        this.type = 'spreader';
        this.baseXp = 3;
        this.color = '#af8123'; // Baby Shit Brown
        this.speed = 150 + this.level * 1.5;
        this.maxHp = 100 * (1 + (this.level - 1) * 0.3);
        this.hp = this.maxHp;
        
        this.baseDamage = 10; 
        this.damageScale = 0.2;
        this.spreaderDamageMult = 1.0;
        this.damage = this.baseDamage * (1 + (this.level - 1) * this.damageScale);
        
        this.attackTimer = 0;
        
        // Network properties
        this.networks = []; 
        this.currentNetwork = [];
        this.targetPoints = [];
        this.networkPhase = 'IDLE'; 
        this.networkCounter = 0;
        this.currentNetworkId = null;

        this.baseTint = 0xaf8123;
        this.pixiObj.removeChild(this.body);
        if(this.comboOverlay) this.comboOverlay.destroy();
        this.body.destroy();
        
        this.body = new PIXI.Graphics();
        this.body.beginFill(0x000000, 0.8);
        this.body.lineStyle(2, 0xffffff);
        this.body.drawCircle(0, 0, this.radius);
        this.body.moveTo(0,0); this.body.lineTo(15, 0);
        this.body.endFill();
        this.body.tint = this.baseTint;
        
        this.bioSpots = new PIXI.Graphics();
        this.bioSpots.beginFill(0x99ff33, 1.0);
        this.bioSpots.drawCircle(0, 0, 6);
        this.bioSpots.drawCircle(-10, 8, 3);
        this.bioSpots.drawCircle(-10, -8, 3);
        this.bioSpots.endFill();

        this.pixiObj.addChild(this.body, this.bioSpots);
    }
    update(dt) {
        if(this.z > 0) {
            this.z += this.vz * dt;
            if(this.z <= 0) { this.z = 0; this.vz = 0; }
            return false;
        }
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            return false;
        }
        if (this.windupCooldown > 0) this.windupCooldown -= dt;
        if (this.dead) return true;
        
        let dist = MathUtils.distance(this.x, this.y, player.x, player.y);
        
        if (this.attackTimer > 0) this.attackTimer -= dt;
        if (dist < this.radius + player.radius) {
            if (!this.inMeleeRange) {
                this.inMeleeRange = true;
                if (this.attackTimer <= 0 && this.windupCooldown <= 0) {
                    this.attackTimer = 0.45;
                    this.windupCooldown = MathUtils.rand(1.0, 4.0);
                }
            }
            if (this.attackTimer <= 0) {
                player.takeDamage(getDamage(this) * this.spreaderDamageMult, this);
                this.attackTimer = 1.0;
            }
        } else {
            this.inMeleeRange = false;
        }
        
        if (this.networkPhase === 'IDLE') {
            if (this.currentNetwork.length > 0) {
                this.networks.push(this.currentNetwork);
                this.currentNetwork = [];
            }
            
            this.currentNetworkId = this.x + '_' + this.y + '_' + (this.networkCounter++);
            
            // Pick a new center away from current position
            let angle = Math.random() * Math.PI * 2;
            let centerDist = MathUtils.rand(600, 1000); 
            let cx = this.x + Math.cos(angle) * centerDist;
            let cy = this.y + Math.sin(angle) * centerDist;
            
            cx = MathUtils.clamp(cx, -WORLD_SIZE + 600, WORLD_SIZE - 600);
            cy = MathUtils.clamp(cy, -WORLD_SIZE + 600, WORLD_SIZE - 600);

            // N = 3 to 8 nodes to cover a massive physical space
            let N = MathUtils.randInt(3, 8);
            let sideLength = MathUtils.rand(300, 380); // Limits edge length strictly below 400
            let radius = sideLength / (2 * Math.sin(Math.PI / N));

            let startAngle = Math.random() * Math.PI * 2;
            this.targetPoints = [];
            for(let i=0; i<N; i++) {
                let a = startAngle + i * (Math.PI * 2 / N);
                this.targetPoints.push({
                    x: cx + Math.cos(a) * radius,
                    y: cy + Math.sin(a) * radius
                });
            }
            this.networkPhase = 'TRANSIT';
        }

        if (this.networkPhase === 'TRANSIT' || this.networkPhase === 'BUILDING') {
            if (this.targetPoints.length === 0) {
                this.networkPhase = 'IDLE';
                return false;
            }

            let target = this.targetPoints[0];
            let tDist = MathUtils.distance(this.x, this.y, target.x, target.y);
            
            if (tDist < 15) {
                let node = new FungalNode(this.x, this.y, this.level, this.currentNetworkId);
                entities.push(node);
                this.currentNetwork.push(node);

                // A spreader maintains a max of 3 completed networks. Destroys oldest node.
                if (this.networks.length >= 3) {
                    let oldestNet = this.networks[0];
                    while (oldestNet.length > 0) {
                        let oldNode = oldestNet.shift();
                        if (!oldNode.dead) {
                            oldNode.dead = true;
                            if (oldNode.pixiObj) {
                                oldNode.pixiObj.destroy({ children: true });
                                oldNode.pixiObj = null;
                            }
                            createParticles(oldNode.x, oldNode.y, 0, 20, '#99ff33');
                            break; 
                        }
                    }
                    if (oldestNet.length === 0) {
                        this.networks.shift();
                    }
                }

                this.targetPoints.shift();
                if (this.targetPoints.length > 0) {
                    this.networkPhase = 'BUILDING';
                } else {
                    this.networkPhase = 'IDLE';
                }
            } else {
                let moveAngle = MathUtils.angle(this.x, this.y, target.x, target.y);
                this.vx = Math.cos(moveAngle) * this.speed;
                this.vy = Math.sin(moveAngle) * this.speed;
                this.x += this.vx * dt;
                this.y += this.vy * dt;
            }
        }
    }
    draw() {
        super.draw();
        if (this.pixiObj && this.bioSpots) {
            let pulse = (Math.sin(Date.now() / 200) + 1) / 2;
            this.bioSpots.alpha = 0.3 + 0.7 * pulse;
            this.bioSpots.rotation = this.body.rotation;
        }
    }
    takeDamage(amount, source, color = '#fff') {
        let died = super.takeDamage(amount, source, color);
        if (died) {
            // Clean up all active nodes if the Spreader is killed
            for (let net of this.networks) {
                for (let node of net) {
                    if (!node.dead) {
                        node.dead = true;
                        if (node.pixiObj) {
                            node.pixiObj.destroy({ children: true });
                            node.pixiObj = null;
                        }
                    }
                }
            }
            for (let node of this.currentNetwork) {
                if (!node.dead) {
                    node.dead = true;
                    if (node.pixiObj) {
                        node.pixiObj.destroy({ children: true });
                        node.pixiObj = null;
                    }
                }
            }
        }
        return died;
    }
}

class BrutalistMonolith extends Asteroid {
    constructor(x, y, level, damage = 0, source = null) {
        super(x, y, 35); // Fixed 35 radius for precision trap
        
        if (this.pixiObj) {
            this.pixiObj.destroy();
            this.pixiObj = null;
        }

        this.vx = 0; 
        this.vy = 0; 
        this.baseXp = 2;
        this.rotSpeed = 0;
        this.maxHp = 20 * level; // Low HP scale
        this.hp = this.maxHp;
        this.height = 60; // Visual height
        this.telegraphTimer = 1.5;
        this.damage = damage;
        this.source = source;
        this.life = 30.0;
        
        this.pixiObj = new PIXI.Container();
        this.telegraphGraphics = new PIXI.Graphics();
        this.body = new PIXI.Graphics();
        this.hpBar = new PIXI.Graphics();
        
        this.body.beginFill(0x2a2a2a);
        this.body.lineStyle(2, 0x444444);
        this.body.drawEllipse(0, 0, this.radius, this.radius * 0.4);
        this.body.endFill();
        
        this.body.beginFill(0x2a2a2a);
        this.body.drawRect(-this.radius, -this.height, this.radius * 2, this.height);
        this.body.endFill();
        
        this.body.lineStyle(2, 0x444444);
        this.body.moveTo(-this.radius, 0); this.body.lineTo(-this.radius, -this.height);
        this.body.moveTo(this.radius, 0); this.body.lineTo(this.radius, -this.height);
        
        this.body.beginFill(0x3a3a3a);
        this.body.drawEllipse(0, -this.height, this.radius, this.radius * 0.4);
        this.body.endFill();

        this.body.beginFill(0xff3366);
        this.body.lineStyle(0);
        this.body.drawRect(-10, -this.height * 0.7, 20, 4);
        this.body.drawRect(-10, -this.height * 0.4, 20, 4);
        this.body.endFill();

        this.body.visible = false; // Hidden while telegraphing
        
        this.pixiObj.addChild(this.telegraphGraphics, this.body, this.hpBar);
        GAME.layers.game.addChild(this.pixiObj);
    }
    update(dt) {
        if (this.flashTimer > 0) this.flashTimer -= dt;
        if (this.telegraphTimer > 0) this.telegraphTimer -= dt;
        this.life -= dt;
        if (this.life <= 0) {
            this.dead = true;
            if (this.pixiObj) {
                this.pixiObj.destroy({ children: true });
                this.pixiObj = null;
            }
            createParticles(this.x, this.y, this.z, 20, '#ff3366');
        }
    }
    draw() {
        let p = project(this.x, this.y, this.z);
        if(!p) {
            if(this.pixiObj) this.pixiObj.visible = false;
            return;
        }
        
        if (this.pixiObj) {
            this.pixiObj.visible = true;
            let scale = getScale(this.z);
            this.pixiObj.position.set(p.x, p.y);
            this.pixiObj.scale.set(scale);
            this.pixiObj.zIndex = this.z;

            this.telegraphGraphics.clear();
            if (this.telegraphTimer > 0) {
                let progress = Math.max(0, 1 - (this.telegraphTimer / 1.5));
                let timeElapsed = 1.5 - this.telegraphTimer;
                
                let rippleCount = 3;
                for (let i = 0; i < rippleCount; i++) {
                    let rProgress = (timeElapsed * (1 + progress * 2) + i / rippleCount) % 1.0;
                    this.telegraphGraphics.lineStyle(2, 0xff3366, 1.0 - rProgress);
                    this.telegraphGraphics.drawCircle(0, 0, this.radius * rProgress);
                }

                let freq = 10 + progress * 20; 
                let pulse = (Math.sin(timeElapsed * freq) + 1) / 2;
                this.telegraphGraphics.lineStyle(2 + 2 * pulse, 0xff3366, 0.5 + 0.5 * pulse);
                this.telegraphGraphics.drawCircle(0, 0, this.radius);
                
                this.telegraphGraphics.beginFill(0xff3366, progress * 0.4);
                this.telegraphGraphics.drawCircle(0, 0, this.radius * progress);
                this.telegraphGraphics.endFill();
                
                this.body.visible = false;
            } else {
                this.body.visible = true;
                this.body.tint = this.flashTimer > 0 ? 0xffaaaa : 0xffffff;
            }

            this.hpBar.clear();
            if(this.hp < this.maxHp && this.telegraphTimer <= 0) {
                this.hpBar.beginFill(0xff0000);
                this.hpBar.drawRect(-this.radius, -this.height - 15, this.radius*2, 4);
                this.hpBar.beginFill(0x00ff00);
                this.hpBar.drawRect(-this.radius, -this.height - 15, (this.radius*2) * (this.hp/this.maxHp), 4);
                this.hpBar.endFill();
            }
        }
    }
}

class MonolithArchitect extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.radius = 25;
        this.type = 'architect';
        this.baseXp = 12;
        this.color = '#778899';
        this.speed = 60 + this.level * 1.5;
        this.maxHp = 250 * (1 + (this.level - 1) * 0.4);
        this.hp = this.maxHp;
        
        this.baseDamage = 5;
        this.damageScale = 0.2;
        this.monolithDamageMult = 2.0;
        this.damage = this.baseDamage * (1 + (this.level - 1) * this.damageScale);
        
        this.summonTimer = 3.0; // Quick initial cast
        this.summonCooldown = 12.0;
        
        this.baseTint = 0x778899;
        this.pixiObj.removeChild(this.body);
        if(this.comboOverlay) this.comboOverlay.destroy();
        this.body.destroy();
        
        this.body = new PIXI.Graphics();
        this.body.beginFill(0x445566);
        this.body.lineStyle(2, 0xffffff);
        this.body.drawRect(-this.radius, -this.radius, this.radius*2, this.radius*2);
        this.body.beginFill(0x223344);
        this.body.lineStyle(0);
        this.body.drawRect(-this.radius/2, -this.radius/2, this.radius, this.radius);
        this.body.beginFill(0xffaa00);
        this.body.drawCircle(this.radius/2, 0, 4);
        this.body.endFill();
        
        this.body.tint = this.baseTint;
        this.pixiObj.addChild(this.body);
    }
    update(dt) {
        if(this.z > 0) {
            this.z += this.vz * dt;
            if(this.z <= 0) { this.z = 0; this.vz = 0; }
            return false;
        }
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            return false;
        }
        if (this.dead) return true;
        
        let dist = MathUtils.distance(this.x, this.y, player.x, player.y);
        let angle = MathUtils.angle(this.x, this.y, player.x, player.y);
        
        let targetDist = 400;
        if (dist > targetDist + 50) {
            this.vx = Math.cos(angle) * this.speed;
            this.vy = Math.sin(angle) * this.speed;
        } else if (dist < targetDist - 50) {
            this.vx = -Math.cos(angle) * this.speed;
            this.vy = -Math.sin(angle) * this.speed;
        } else {
            this.vx = Math.cos(angle + Math.PI/2) * this.speed * 0.5;
            this.vy = Math.sin(angle + Math.PI/2) * this.speed * 0.5;
        }
        
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        
        this.summonTimer -= dt;
        if (this.summonTimer <= 0) {
            entities.push(new BrutalistMonolith(player.x, player.y, this.level, getDamage(this) * this.monolithDamageMult, this));
            this.summonTimer = this.summonCooldown;
        }
        return false;
    }
    draw() {
        super.draw();
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

        this.pixiObj = new PIXI.Graphics();
        GAME.layers.game.addChild(this.pixiObj);
        
        let c = typeof this.color === 'string' ? parseColor(this.color) : this.color;
        
        if (this.type === 'bullet') {
            this.pixiObj.lineStyle(6, c, 0.3);
            this.pixiObj.moveTo(-15, 0);
            this.pixiObj.lineTo(15, 0);
            this.pixiObj.lineStyle(2, 0xffffff, 1.0);
            this.pixiObj.moveTo(-15, 0);
            this.pixiObj.lineTo(15, 0);
        } else {
            this.pixiObj.beginFill(c, 0.5);
            this.pixiObj.drawCircle(0, 0, 6);
            this.pixiObj.endFill();
            this.pixiObj.beginFill(c, 1.0);
            this.pixiObj.drawCircle(0, 0, 3);
            this.pixiObj.endFill();
        }
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        
        // Particles trail
        if(Math.random() < 0.3) createParticles(this.x, this.y, 0, 1, this.color, 0.5);

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
                        if (this.pixiObj) {
                            this.pixiObj.destroy();
                            this.pixiObj = null;
                        }
                        return true; // destroy projectile
                    }
                }
            }
        } else {
            if(MathUtils.distance(this.x, this.y, player.x, player.y) < player.radius) {
                player.takeDamage(this.damage, this.source);
                if (this.type === 'bullet') shockwaves.push(new Shockwave(this.x, this.y, this.z, this.color));
                else createParticles(this.x, this.y, 0, 5, this.color);
                if (this.pixiObj) {
                    this.pixiObj.destroy();
                    this.pixiObj = null;
                }
                return true;
            }
        }
        if (this.life <= 0) {
            if (this.pixiObj) {
                this.pixiObj.destroy();
                this.pixiObj = null;
            }
            return true;
        }
        return false;
    }
    draw() {
        if (!this.pixiObj) return;
        let p = project(this.x, this.y, this.z);
        if(!p) {
            this.pixiObj.visible = false;
            return;
        }
        this.pixiObj.visible = true;
        let s = getScale(this.z);
        this.pixiObj.position.set(p.x, p.y);
        this.pixiObj.scale.set(s);
        if (this.type === 'bullet' && (this.vx !== 0 || this.vy !== 0)) {
            this.pixiObj.rotation = Math.atan2(this.vy, this.vx);
        }
        this.pixiObj.zIndex = this.z;
    }
}

class WhipBeam {
    constructor(source, damage, color) {
        this.source = source;
        this.damage = damage;
        this.color = color;
        this.z = -1; // Render on top of player
        this.chainDamageMult = 0.90;
        this.dead = false;

        this.numNodes = 25;
        this.nodes = [];
        for (let i = 0; i < this.numNodes; i++) {
            this.nodes.push({ x: source.x, y: source.y, vx: 0, vy: 0 });
        }

        let fireRateMult = player.stats.fireRate / 100;
        this.tickTimer = 0.25 / fireRateMult;
        this.snappedEnemies = new Set();
        this.mainTarget = null;

        this.pulseCount = 0;
        this.maxPulsesNoTarget = 2; // Pulsing empty space times out weapon
        
        this.graphics = new PIXI.Graphics();
        GAME.layers.game.addChild(this.graphics);
    }

    update(dt, targetX, targetY) {
        if (this.dead) {
            if(this.graphics) {
                this.graphics.destroy();
                this.graphics = null;
            }
            return true;
        }

        this.snappedEnemies.clear();
        this.mainTarget = null;

        // Find main target directly at cursor
        for (let e of entities) {
            if (typeof e.takeDamage === 'function' && !e.dead && e.z <= 0) {
                if (MathUtils.distance(targetX, targetY, e.x, e.y) <= 20 + e.radius) {
                    this.mainTarget = e;
                    break;
                }
            }
        }

        let tipX = targetX;
        let tipY = targetY;
        if (this.mainTarget) {
            tipX = this.mainTarget.x;
            tipY = this.mainTarget.y;
            this.snappedEnemies.add(this.mainTarget);
        }

        // Base is locked to source
        this.nodes[0].x = this.source.x;
        this.nodes[0].y = this.source.y;
        this.nodes[0].vx = 0;
        this.nodes[0].vy = 0;

        let stiffness = 300;
        let friction = 0.70;

        for (let i = 1; i < this.numNodes; i++) {
            let t = i / (this.numNodes - 1);
            let idealX = MathUtils.lerp(this.source.x, tipX, t);
            let idealY = MathUtils.lerp(this.source.y, tipY, t);

            if (i < this.numNodes - 1) { // Intermediate magnetic path snapping
                for (let e of entities) {
                    if (typeof e.takeDamage === 'function' && !e.dead && e.z <= 0) {
                        if (MathUtils.distance(idealX, idealY, e.x, e.y) <= 50 + e.radius) {
                            idealX = e.x;
                            idealY = e.y;
                            this.snappedEnemies.add(e);
                            break;
                        }
                    }
                }
            }

            let node = this.nodes[i];
            let forceX = (idealX - node.x) * stiffness;
            let forceY = (idealY - node.y) * stiffness;

            node.vx += forceX * dt;
            node.vy += forceY * dt;
            node.vx *= friction;
            node.vy *= friction;

            node.x += node.vx * dt;
            node.y += node.vy * dt;
        }

        // Tip exactly snaps to target location
        this.nodes[this.numNodes - 1].x = tipX;
        this.nodes[this.numNodes - 1].y = tipY;

        // Tick Damage & Timeout Logic
        this.tickTimer -= dt;
        if (this.tickTimer <= 0) {
            let fireRateMult = player.stats.fireRate / 100;
            this.tickTimer = 0.25 / fireRateMult;
            
            if (!this.mainTarget) {
                this.pulseCount++;
                if (this.pulseCount >= this.maxPulsesNoTarget) {
                    this.dead = true;
                    if(this.graphics) {
                        this.graphics.destroy();
                        this.graphics = null;
                    }
                    return true;
                }
            } else {
                this.pulseCount = 0; // Reset pulses if target acquired
            }

            for (let e of this.snappedEnemies) {
                if (e === this.mainTarget) {
                    e.takeDamage(this.damage, this.source, this.color);
                    shockwaves.push(new Shockwave(e.x, e.y, e.z, this.color, 40));
                } else {
                    e.takeDamage(this.damage * this.chainDamageMult, this.source, this.color);
                }
            }
        }
        return false;
    }

    draw(ctx) {
        if (this.dead || !this.graphics) return;
        this.graphics.clear();
        
        let p0 = project(this.nodes[0].x, this.nodes[0].y, this.z);
        if (!p0) return;
        
        let widthMult = 1 + 0.5 * Math.sin(Date.now() / 50);
        let scale = getScale(this.z);
        let w = 4 * widthMult * scale;
        let c = typeof this.color === 'string' ? parseColor(this.color) : this.color;
        
        this.graphics.lineStyle(w + 4*scale, c, 0.3); // Glow effect
        this.graphics.moveTo(p0.x, p0.y);
        for (let i = 1; i < this.numNodes - 1; i++) {
            let pCurr = project(this.nodes[i].x, this.nodes[i].y, this.z);
            let pNext = project(this.nodes[i+1].x, this.nodes[i+1].y, this.z);
            if (pCurr && pNext) {
                let mx = (pCurr.x + pNext.x) / 2;
                let my = (pCurr.y + pNext.y) / 2;
                this.graphics.quadraticCurveTo(pCurr.x, pCurr.y, mx, my);
            }
        }
        let pLast = project(this.nodes[this.numNodes-1].x, this.nodes[this.numNodes-1].y, this.z);
        if (pLast) this.graphics.lineTo(pLast.x, pLast.y);

        this.graphics.lineStyle(w, c, 1.0); // Core beam
        this.graphics.moveTo(p0.x, p0.y);
        for (let i = 1; i < this.numNodes - 1; i++) {
            let pCurr = project(this.nodes[i].x, this.nodes[i].y, this.z);
            let pNext = project(this.nodes[i+1].x, this.nodes[i+1].y, this.z);
            if (pCurr && pNext) {
                let mx = (pCurr.x + pNext.x) / 2;
                let my = (pCurr.y + pNext.y) / 2;
                this.graphics.quadraticCurveTo(pCurr.x, pCurr.y, mx, my);
            }
        }
        if (pLast) this.graphics.lineTo(pLast.x, pLast.y);
        this.graphics.zIndex = this.z;
    }
}

class SpecialFuelDrop {
    constructor(x, y, fuelAmount) {
        this.x = x; this.y = y; this.z = 0;
        this.fuelAmount = fuelAmount;
        this.radius = 10;
        this.life = 10.0;
        this.dead = false;
        
        let ang = MathUtils.rand(0, Math.PI * 2);
        let spd = MathUtils.rand(20, 50);
        this.vx = Math.cos(ang) * spd;
        this.vy = Math.sin(ang) * spd;
        
        this.sprite = new PIXI.Sprite(GAME.textures.specialFuel);
        this.sprite.anchor.set(0.5);
        GAME.layers.game.addChild(this.sprite);
    }
    update(dt) {
        this.life -= dt;
        if (this.life <= 0) {
            if (this.sprite) {
                this.sprite.destroy();
                this.sprite = null;
            }
            return true;
        }
        
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        
        let distToPlayer = MathUtils.distance(this.x, this.y, player.x, player.y);
        if (distToPlayer < player.radius + this.radius + 30) {
            let angle = MathUtils.angle(this.x, this.y, player.x, player.y);
            this.vx += Math.cos(angle) * 500 * dt;
            this.vy += Math.sin(angle) * 500 * dt;
        }
        if (distToPlayer < player.radius + this.radius) {
            player.stats.fuel = Math.min(player.stats.maxFuel, player.stats.fuel + this.fuelAmount);
            createFloatingText(`+${Math.floor(this.fuelAmount)} Fuel`, this.x, this.y, '#ffff00', 1.5, true);
            playSound('https://media.githubusercontent.com/media/diploidian/void_drifter/refs/heads/sounds/impactMetal_004.ogg');
            updateUI();
            if (this.sprite) {
                this.sprite.destroy();
                this.sprite = null;
            }
            return true;
        }
        return false;
    }
    draw() {
        let p = project(this.x, this.y, this.z);
        if(!p) {
            if (this.sprite) this.sprite.visible = false;
            return;
        }
        if (this.sprite) {
            this.sprite.visible = true;
            this.sprite.position.set(p.x, p.y);
            this.sprite.scale.set(getScale(this.z));
            this.sprite.zIndex = this.z;
        }
    }
}

class HomingMissile {
    constructor(x, y, angle, hp, source) {
        this.x = x; this.y = y; this.z = 0;
        this.angle = angle;
        this.speed = player.stats.maxSpeed * 0.85;
        this.fuel = 100;
        this.maxHp = hp;
        this.hp = hp;
        this.dead = false;
        this.radius = 15;
        this.source = source;
        this.color = '#ffaa00';
        this.explosionDamagePercent = 0.15;
        
        this.baseDamage = 20;
        this.damageScale = 0.2;
        this.explosionDamageMult = 1.0;
        this.damage = this.baseDamage * (1 + (player.level - 1) * this.damageScale);

        this.pixiObj = new PIXI.Container();
        this.rotContainer = new PIXI.Container();
        this.body = new PIXI.Graphics();
        this.exhaust = new PIXI.Graphics();
        this.hpBar = new PIXI.Graphics();
        this.fuelBar = new PIXI.Graphics();

        this.body.beginFill(0xffaa00);
        this.body.lineStyle(1, 0x222222);
        this.body.moveTo(10, 0); 
        this.body.lineTo(-10, 7.5);
        this.body.lineTo(-10, -7.5);
        this.body.closePath();
        this.body.endFill();

        this.rotContainer.addChild(this.exhaust, this.body);
        this.pixiObj.addChild(this.rotContainer, this.hpBar, this.fuelBar);
        GAME.layers.game.addChild(this.pixiObj);
    }
    update(dt) {
        if (this.dead) return true;
        
        let targetAngle = MathUtils.angle(this.x, this.y, player.x, player.y);
        let diff = targetAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        let turnRate = 1.0; 
        this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);
        
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
        
        let distTraveled = this.speed * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        
        this.fuel -= distTraveled / 20;
        
        let distToPlayer = MathUtils.distance(this.x, this.y, player.x, player.y);
        
        if (this.fuel <= 0 || distToPlayer < this.radius + player.radius) {
            this.detonate();
            return true;
        }
        
        return false;
    }
    detonate() {
        this.dead = true;
        if (this.pixiObj) {
            this.pixiObj.destroy({ children: true });
            this.pixiObj = null;
        }
        createParticles(this.x, this.y, 0, 50, '#ff4400');
        shockwaves.push(new Shockwave(this.x, this.y, 0, '#ff4400', 75));
        let dist = MathUtils.distance(this.x, this.y, player.x, player.y);
        if (dist <= 75) {
            let hpDmg = player.stats.maxHp * this.explosionDamagePercent;
            let flatDmg = getDamage(this) * this.explosionDamageMult;
            player.takeDamage(hpDmg + flatDmg, this.source);
        }
    }
    draw() {
        if (!this.pixiObj) return;
        let p = project(this.x, this.y, this.z);
        if(!p) {
            this.pixiObj.visible = false;
            return;
        }
        this.pixiObj.visible = true;
        let s = getScale(this.z);
        this.pixiObj.position.set(p.x, p.y);
        this.pixiObj.scale.set(s);
        this.pixiObj.zIndex = this.z;
        
        this.rotContainer.rotation = this.angle;
        
        this.exhaust.clear();
        if (this.fuel > 0) {
            this.exhaust.beginFill(0xff0000);
            this.exhaust.moveTo(-10, 5);
            this.exhaust.lineTo(-10 - Math.random() * 15, 0);
            this.exhaust.lineTo(-10, -5);
            this.exhaust.endFill();
        }
        
        let barW = 30;
        let barH = 4;
        let bY = 20;
        
        this.hpBar.clear();
        this.hpBar.beginFill(0xff0000);
        this.hpBar.drawRect(-barW/2, bY, barW, barH);
        this.hpBar.beginFill(0x00ff00);
        this.hpBar.drawRect(-barW/2, bY, barW * Math.max(0, this.hp / this.maxHp), barH);
        this.hpBar.endFill();
        
        this.fuelBar.clear();
        this.fuelBar.beginFill(0x333333);
        this.fuelBar.drawRect(-barW/2, bY + barH + 2, barW, barH);
        this.fuelBar.beginFill(0xffff00);
        this.fuelBar.drawRect(-barW/2, bY + barH + 2, barW * Math.max(0, this.fuel / 100), barH);
        this.fuelBar.endFill();
    }
    takeDamage(amount, source, color = '#fff') {
        if (this.dead) return false;
        let critInfo = calculateCrit(amount, source);
        amount = critInfo.amount;
        this.hp -= amount;
        if (amount >= 1) createFloatingText(`-${Math.floor(amount)}${critInfo.isCrit ? '!' : ''}`, this.x, this.y, color, 1.0, false, true, critInfo.isCrit);
        if(this.hp <= 0) {
            this.dead = true;
            if (this.pixiObj) {
                this.pixiObj.destroy({ children: true });
                this.pixiObj = null;
            }
            createParticles(this.x, this.y, 0, 30, '#888');
            entities.push(new SpecialFuelDrop(this.x, this.y, this.fuel));
            return true;
        }
        return false;
    }
}

class Boss extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.radius = 40;
        this.level = player.level;
        this.maxHp = 2500 * (1 + (this.level - 1) * 0.5);
        this.hp = this.maxHp;
        
        this.baseDamage = 50;
        this.damageScale = 0.3;
        this.chargeDamageMult = 3.0;
        this.barrageDamageMult = 0.6;
        this.contactDamageMult = 1.0;
        this.damage = this.baseDamage * (1 + (this.level - 1) * this.damageScale);
        
        this.speed = 100;
        this.color = '#ff4400';
        this.type = 'boss';
        this.abilities = [
            { name: 'charge', cd: 0, maxCd: 8.0, active: false, duration: 0 },
            { name: 'barrage', cd: 3, maxCd: 10.0, active: false, shotsFired: 0, shotTimer: 0, currentAngle: 0 },
            { name: 'missile', cd: 6, maxCd: 9.0 }
        ];
        
        this.pixiObj.removeChild(this.body);
        if(this.comboOverlay) this.comboOverlay.destroy();
        this.body.destroy();
        
        this.body = new PIXI.Graphics();
        this.body.beginFill(0x000000, 0.8);
        this.body.lineStyle(2, 0xffffff);
        this.body.drawCircle(0, 0, this.radius);
        this.body.moveTo(0,0); this.body.lineTo(15, 0);
        this.body.endFill();
        
        this.baseTint = 0xff4400;
        this.body.tint = this.baseTint;
        
        this.hpBar = new PIXI.Graphics();
        this.bossText = new PIXI.Text('VOID BOSS', {fontFamily: 'Orbitron', fontSize: 10, fill: 0xffffff});
        this.bossText.anchor.set(0.5, 1);
        this.pixiObj.addChild(this.body, this.hpBar, this.bossText);
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

        if (this.windupCooldown > 0) this.windupCooldown -= dt;

        for(let ab of this.abilities) if(ab.cd > 0) ab.cd -= dt;

        let dist = MathUtils.distance(this.x, this.y, player.x, player.y);
        let angle = MathUtils.angle(this.x, this.y, player.x, player.y);

        // Ability logic
        let charge = this.abilities[0];
        if (charge.active) {
            charge.duration -= dt;
            if (charge.duration <= 0) charge.active = false;
            if (dist < this.radius + player.radius) player.takeDamage(getDamage(this) * this.chargeDamageMult, this);
        } else if (charge.cd <= 0 && dist > 200 && dist < 800) {
            charge.active = true;
            charge.duration = 1.5;
            this.vx = Math.cos(angle) * 450;
            this.vy = Math.sin(angle) * 450;
            charge.cd = charge.maxCd;
        }

        let barrage = this.abilities[1];
        if (barrage.active) {
            barrage.shotTimer -= dt;
            if (barrage.shotTimer <= 0) {
                for(let i=-1; i<=1; i++) {
                    projectiles.push(new Projectile(this.x, this.y, barrage.currentAngle + i * (Math.PI/16), 600, getDamage(this) * this.barrageDamageMult, false, '#ff8800', this));
                }
                barrage.currentAngle += Math.PI / 10;
                barrage.shotsFired++;
                barrage.shotTimer = 0.15;
                if (barrage.shotsFired >= 12) barrage.active = false;
            }
        } else if (barrage.cd <= 0) {
            barrage.active = true;
            barrage.shotsFired = 0;
            barrage.shotTimer = 0;
            barrage.currentAngle = angle;
            barrage.cd = barrage.maxCd;
        }

        let missile = this.abilities[2];
        if (missile.cd <= 0) {
            entities.push(new HomingMissile(this.x, this.y, angle, 300 * (1 + (this.level-1)*0.2), this));
            missile.cd = missile.maxCd;
        }

        if (!charge.active) {
            this.vx = Math.cos(angle) * this.speed;
            this.vy = Math.sin(angle) * this.speed;
            
            if (dist < this.radius + player.radius) {
                if (!this.inMeleeRange) {
                    this.inMeleeRange = true;
                    if (this.attackTimer <= 0 && this.windupCooldown <= 0) {
                        this.attackTimer = 0.45;
                        this.windupCooldown = MathUtils.rand(1.0, 4.0);
                    }
                }
                if (this.attackTimer <= 0) {
                    player.takeDamage(getDamage(this) * this.contactDamageMult, this);
                    this.attackTimer = 1.0;
                }
            } else {
                this.inMeleeRange = false;
            }
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if(this.attackTimer > 0) this.attackTimer -= dt;
    }

    draw(ctx) {
        super.draw(ctx); // basic shape
        if(!this.pixiObj || !this.pixiObj.visible) return;
        
        let barW = 80;
        let barH = 6;
        let bY = -50;
        
        this.hpBar.clear();
        this.hpBar.beginFill(0x000000);
        this.hpBar.drawRect(-barW/2, bY, barW, barH);
        this.hpBar.beginFill(0xff0000);
        this.hpBar.drawRect(-barW/2, bY, barW * Math.max(0, this.hp / this.maxHp), barH);
        this.hpBar.endFill();
        this.hpBar.lineStyle(1, 0xffffff);
        this.hpBar.drawRect(-barW/2, bY, barW, barH);
        
        this.bossText.position.set(0, bY - 4);
    }

    takeDamage(amount, source, color = '#fff') {
        if (super.takeDamage(amount, source, color)) {
            GAME.activeBoss = null;
            GAME.bossDefeated = true;
            // Big loot explosion
            let totalXp = Math.pow((100 * this.level), 1.2);
            let numOrbs = 50;
            let xpPerOrb = totalXp / numOrbs;
            for(let i=0; i<numOrbs; i++) xpOrbs.push(new XpOrb(this.x, this.y, xpPerOrb));
            
            if (equipment['Reactor'] && equipment['Reactor'].upgradedPerk) {
                let bonusOrbs = MathUtils.randInt(3, 5);
                for(let i=0; i<bonusOrbs; i++) xpOrbs.push(new XpOrb(this.x, this.y, xpPerOrb * 1.1, true));
            }

            for(let i=0; i<10; i++) spawnDrop(this.x, this.y, true);

            let slots = [...SLOT_TYPES];
            for(let i=0; i<1; i++) {
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
        this.x = targetX; this.y = targetY; this.z = 0;
        this.state = 'GROWING';
        this.timer = 1.0;
        this.currentRadius = 100;
        this.maxRadius = 400;
        this.capturedColors = new Set();
        
        this.graphics = new PIXI.Graphics();
        GAME.layers.game.addChild(this.graphics);
    }
    update(dt) {
        if (this.state === 'GROWING') {
            this.timer -= dt;
            let progress = 1 - (Math.max(0, this.timer) / 1.0);
            this.currentRadius = 100 + (this.maxRadius - 100) * Math.pow(progress, 2);
            this.applyGravity(dt);
            if (this.timer <= 0) {
                this.state = 'CHARGING';
                this.timer = 1.5;
            }
        } else if (this.state === 'CHARGING') {
            this.timer -= dt;
            this.currentRadius = this.maxRadius;
            this.applyGravity(dt);
            
            // Vacuum particles
            if (Math.random() < 0.8) {
                let angle = Math.random() * Math.PI * 2;
                let dist = MathUtils.rand(100, this.maxRadius);
                let px = this.x + Math.cos(angle) * dist;
                let py = this.y + Math.sin(angle) * dist;
                let p = new Particle(px, py, 0, '#fff', 0.5);
                p.vx = -Math.cos(angle) * (dist / 0.5); 
                p.vy = -Math.sin(angle) * (dist / 0.5);
                particles.push(p);
            }
            
            if (this.timer <= 0) {
                this.explode();
                if (this.graphics) {
                    this.graphics.destroy();
                    this.graphics = null;
                }
                return true;
            }
        }
        return false;
    }

    applyGravity(dt) {
        for (let e of entities) {
            if (e === this || e.dead || e.z > 0) continue;
            let dist = MathUtils.distance(this.x, this.y, e.x, e.y);
            if (dist < this.currentRadius) {
                if (e instanceof Enemy) {
                    e.blackHole = this;
                    this.capturedColors.add(e.color);
                }
                let normalizedDist = Math.max(0, 1 - (dist / this.currentRadius));
                let pullVelocity = Math.pow(normalizedDist, 3) * 2500 * dt;
                
                if (pullVelocity >= dist) {
                    e.x = this.x; e.y = this.y;
                } else {
                    let angle = MathUtils.angle(e.x, e.y, this.x, this.y);
                    e.x += Math.cos(angle) * pullVelocity;
                    e.y += Math.sin(angle) * pullVelocity;
                }
            } else if (e instanceof Enemy && e.blackHole === this) {
                e.blackHole = null; // Escaped
            }
        }
        
        for(let d of drops) {
            let dist = MathUtils.distance(this.x, this.y, d.x, d.y);
            if (dist < this.currentRadius) {
                let normalizedDist = Math.max(0, 1 - (dist / this.currentRadius));
                let pullVelocity = Math.pow(normalizedDist, 3) * 2000 * dt;
                if (pullVelocity >= dist) {
                    d.x = this.x; d.y = this.y;
                } else {
                    let angle = MathUtils.angle(d.x, d.y, this.x, this.y);
                    d.x += Math.cos(angle) * pullVelocity;
                    d.y += Math.sin(angle) * pullVelocity;
                }
            }
        }
    }

    explode() {
        let colors = Array.from(this.capturedColors);
        if (colors.length === 0) colors = ['#9933ff']; 

        for (let i = 0; i < 100; i++) {
            createParticles(this.x, this.y, 0, 1, colors[MathUtils.randInt(0, colors.length - 1)], 1.5);
        }
        shockwaves.push(new Shockwave(this.x, this.y, 0, colors[0], this.maxRadius));

        for (let e of entities) {
            if (e.blackHole === this || (e instanceof Enemy && MathUtils.distance(this.x, this.y, e.x, e.y) < this.maxRadius)) {
                e.blackHole = null;
                e.confused = 2.0;
                
                e.x = this.x + MathUtils.rand(-10, 10);
                e.y = this.y + MathUtils.rand(-10, 10);

                if (typeof e.takeDamage === 'function') {
                    let fauxSource = { stats: { ...player.stats, critChance: 50 } };
                    let dmg = getDamage(fauxSource) * 2; 
                    e.takeDamage(dmg, fauxSource, colors[MathUtils.randInt(0, colors.length - 1)]);
                }
            }
        }
        
        if (player.activeSingularity === this) {
            player.activeSingularity = null;
            player.skills[3].cd = player.skills[3].maxCd; 
        }
    }

    draw() {
        if (!this.graphics) return;
        this.graphics.clear();
        let p = project(this.x, this.y, this.z);
        if(!p) {
            this.graphics.visible = false;
            return;
        }
        
        this.graphics.visible = true;
        this.graphics.zIndex = this.z;
        let s = getScale(this.z);
        
        let tremorX = 0, tremorY = 0;
        if (this.state === 'CHARGING') {
            tremorX = MathUtils.rand(-5, 5) * s;
            tremorY = MathUtils.rand(-5, 5) * s;
        }

        this.graphics.beginFill(0x000000, 0.8);
        this.graphics.lineStyle(2, 0x9933ff, 1.0);
        this.graphics.drawCircle(p.x + tremorX, p.y + tremorY, (this.currentRadius/3)*s);
        this.graphics.endFill();
        
        this.graphics.lineStyle(1, 0x9933ff, Math.random());
        this.graphics.drawCircle(p.x + tremorX, p.y + tremorY, this.currentRadius*s);
    }
}

class WarpTrail {
    constructor(x1, y1, x2, y2, width, mult, color) {
        this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
        this.z = 0;
        this.width = width;
        this.mult = mult;
        this.color = color;
        this.life = 1.5;
        this.maxLife = 1.5;
        this.dx = x1 - x2;
        this.dy = y1 - y2;
        this.len = Math.hypot(this.dx, this.dy) * 1.5;
        this.angle = Math.atan2(this.dy, this.dx);
        this.tickTimer = 0;
        this.tickDamageMult = 0.8;
        
        this.graphics = new PIXI.Graphics();
        GAME.layers.game.addChild(this.graphics);
    }
    update(dt) {
        this.life -= dt;
        
        // Spawn lightning particles
        if (this.len > 0) {
            let spawnCount = Math.floor(this.len / 20); 
            for (let i = 0; i < spawnCount; i++) {
                if (Math.random() < dt * 15) {
                    let t = Math.random();
                    let r = t * this.len * 1.2;
                    let a = this.angle + MathUtils.rand(-Math.PI / 12, Math.PI / 12);
                    let px = this.x2 + Math.cos(a) * r;
                    let py = this.y2 + Math.sin(a) * r;
                    let colors = ['rgba(255, 0, 255, 0.5)', 'rgba(255, 137, 255, 0.8)', 'rgba(188, 59, 115, 0.93)'];
                    particles.push(new Particle(px, py, 0, colors[MathUtils.randInt(0, 2)], MathUtils.rand(0.2, 0.4), 'lightning'));
                }
            }
        }

        this.tickTimer -= dt;
        if (this.len > 0 && this.tickTimer <= 0) {
            let fireRateMult = player.stats.fireRate / 100;
            this.tickTimer = this.tickDamageMult / fireRateMult;
            let halfAngle = Math.PI / 8; // 22.5 degrees
            for (let i = entities.length - 1; i >= 0; i--) {
                let e = entities[i];
                if (e instanceof Enemy && !e.dead && e.z <= 0) {
                    let dist = MathUtils.distance(this.x2, this.y2, e.x, e.y);
                    if (dist <= this.len + e.radius) {
                        let eAngle = MathUtils.angle(this.x2, this.y2, e.x, e.y);
                        let diff = eAngle - this.angle;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        diff = Math.abs(diff);

                        if (diff <= halfAngle + (e.radius / Math.max(1, dist))) {
                            e.takeDamage(getDamage(player) * this.mult * this.tickDamageMult, player, this.color);
                        }
                    }
                }
            }
        }
        if (this.life <= 0) {
            if(this.graphics) {
                this.graphics.destroy();
                this.graphics = null;
            }
            return true;
        }
        return false;
    }
    draw() {
        if (!this.graphics) return;
        this.graphics.clear();
        let p1 = project(this.x1, this.y1, this.z);
        let p2 = project(this.x2, this.y2, this.z);
        if (!p1 || !p2) return;
        
        let progress = this.life / this.maxLife;
        let c = typeof this.color === 'string' ? parseColor(this.color) : this.color;
        this.graphics.lineStyle(this.width * getScale(this.z) * progress, c, progress * 0.3);
        this.graphics.moveTo(p1.x, p1.y);
        this.graphics.lineTo(p2.x, p2.y);
        this.graphics.zIndex = this.z;
    }
}

class Drop {
    constructor(x, y, forceResource = false, item = null) {
        this.x = x; this.y = y; this.z = 0;
        this.item = item || generateLoot(forceResource ? null : undefined);
        this.color = this.item.type === 'Fuel' ? '#ffff00' : TIERS[this.item.tier].color;
        this.iconInfo = getIcon(this.item.type, this.color);
        this.hoverOffset = Math.random() * Math.PI * 2;
        
        // Physics logic: slight burst to separate
        let ang = MathUtils.rand(0, Math.PI * 2);
        let spd = MathUtils.rand(10, 40);
        this.vx = Math.cos(ang) * spd;
        this.vy = Math.sin(ang) * spd;
        
        this.sprite = new PIXI.Sprite(PIXI.Texture.from(this.iconInfo.img));
        this.sprite.anchor.set(0.5);
        GAME.layers.game.addChild(this.sprite);
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
                if (this.sprite) {
                    this.sprite.destroy();
                    this.sprite = null;
                }
                return true;
            }
        }
        return false;
    }
    draw() {
        let p = project(this.x, this.y, this.z);
        if(!p) {
            if (this.sprite) this.sprite.visible = false;
            return;
        }
        if (this.sprite) {
            this.sprite.visible = true;
            let s = getScale(this.z);
            this.sprite.position.set(p.x, p.y + Math.sin(this.hoverOffset) * 5 * s);
            let scaleMult = this.item.type === 'Fuel' ? 0.75 : 0.5;
            this.sprite.scale.set(s * scaleMult); // SVG rendered at 48x48, scale back to 24 (or 36)
            this.sprite.zIndex = this.z;
        }
    }
}

class XpOrb {
    constructor(x, y, xpValue, isBonus = false) {
        this.x = x; this.y = y; this.z = 0;
        this.xpValue = xpValue;
        this.isBonus = isBonus;
        this.radius = isBonus ? 5 : 4;
        let ang = MathUtils.rand(0, Math.PI * 2);
        let spd = MathUtils.rand(50, 100);
        this.vx = Math.cos(ang) * spd;
        this.vy = Math.sin(ang) * spd;
        this.life = 0;
        
        this.sprite = new PIXI.Sprite(isBonus ? GAME.textures.xpOrbBonus : GAME.textures.xpOrb);
        this.sprite.anchor.set(0.5);
        GAME.layers.game.addChild(this.sprite);
    }
    update(dt) {
        this.life += dt;
        let dist = MathUtils.distance(this.x, this.y, player.x, player.y);
        
        // Magnetize to player
        let xpMult = (equipment['Reactor'] && equipment['Reactor'].perk === 'XP Boost') ? 1.15 : 1.0;
        if (dist < 150 * xpMult) { 
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
            if (this.sprite) {
                this.sprite.destroy();
                this.sprite = null;
            }
            return true; // remove orb
        }
        return false;
    }
    draw() {
        let p = project(this.x, this.y, this.z);
        if(!p) {
            if (this.sprite) this.sprite.visible = false;
            return;
        }
        if (this.sprite) {
            this.sprite.visible = true;
            this.sprite.position.set(p.x, p.y);
            this.sprite.scale.set(getScale(this.z) * (1 + 0.4 * Math.sin(this.life * 8)));
            this.sprite.zIndex = this.z;
        }
    }
}

class HpOrb {
    constructor(x, y) {
        this.x = x; this.y = y; this.z = 0;
        this.radius = 6;
        let ang = MathUtils.rand(0, Math.PI * 2);
        let spd = MathUtils.rand(50, 100);
        this.vx = Math.cos(ang) * spd;
        this.vy = Math.sin(ang) * spd;
        this.life = 0;
        
        this.sprite = new PIXI.Sprite(GAME.textures.hpOrb);
        this.sprite.anchor.set(0.5);
        GAME.layers.game.addChild(this.sprite);
    }
    update(dt) {
        this.life += dt;
        let dist = MathUtils.distance(this.x, this.y, player.x, player.y);
        
        // Magnetize to player
        if (dist < 200) { 
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
            let healAmount = player.stats.maxHp * 0.10;
            player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + healAmount);
            createFloatingText("+10% HP", this.x, this.y, '#00ff66', 1.5, true);
            updateUI();
            if (this.sprite) {
                this.sprite.destroy();
                this.sprite = null;
            }
            return true; // remove orb
        }
        return false;
    }
    draw() {
        let p = project(this.x, this.y, this.z);
        if(!p) {
            if (this.sprite) this.sprite.visible = false;
            return;
        }
        if (this.sprite) {
            this.sprite.visible = true;
            this.sprite.position.set(p.x, p.y);
            this.sprite.scale.set(getScale(this.z) * (1 + 0.3 * Math.sin(this.life * 5)));
            this.sprite.zIndex = this.z;
        }
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

        this.pixiObj = new PIXI.Graphics();
        GAME.layers.game.addChild(this.pixiObj);

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
        } else {
            let c = typeof this.color === 'string' ? parseColor(this.color) : this.color;
            this.pixiObj.beginFill(c);
            this.pixiObj.drawEllipse(0, 0, 4, 1.5);
            this.pixiObj.endFill();
        }
    }
    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
        this.life -= dt;
        if (this.life <= 0) {
            if (this.pixiObj) {
                this.pixiObj.destroy();
                this.pixiObj = null;
            }
            return true;
        }
        return false;
    }
    draw() {
        if (!this.pixiObj) return;
        let p = project(this.x, this.y, this.z);
        if(!p) {
            this.pixiObj.visible = false;
            return;
        }
        
        this.pixiObj.visible = true;
        let s = getScale(this.z);
        this.pixiObj.alpha = Math.max(0, this.life / this.maxLife);
        this.pixiObj.zIndex = this.z;
        
        if (this.type === 'lightning') {
            this.pixiObj.clear();
            let c = typeof this.color === 'string' ? parseColor(this.color) : this.color;
            this.pixiObj.lineStyle(2 * s, c, 1.0);
            this.pixiObj.moveTo(p.x, p.y);
            for(let i=1; i<this.points.length; i++) {
                this.pixiObj.lineTo(p.x + this.points[i].x * s, p.y + this.points[i].y * s);
            }
        } else {
            this.pixiObj.position.set(p.x, p.y);
            this.pixiObj.rotation = Math.atan2(this.vy, this.vx);
            this.pixiObj.scale.set(s);
        }
    }
}

class FloatingText {
    constructor(text, x, y, color, life = 1.0, isLoot = false, isDamage = false, isCrit = false) {
        this.text = text; this.x = x; this.y = y; this.z = 0;
        this.life = life; this.maxLife = life;
        this.color = color;
        this.isLoot = isLoot;
        this.isDamage = isDamage;
        this.isCrit = isCrit;
        
        if (isLoot) {
            let ang = MathUtils.rand(0, Math.PI * 2);
            let spd = MathUtils.rand(700, 1200); // More aggressive outward burst
            this.vx = Math.cos(ang) * spd;
            this.vy = Math.sin(ang) * spd;
        } else if (isCrit) {
            this.x += MathUtils.rand(-20, 20);
            this.y += MathUtils.rand(-20, 20);
            this.vx = 0;
            this.vy = -10; // Sticky drift
            this.life = life * 1.5;
            this.maxLife = this.life;
        } else if (isDamage) {
            this.vx = MathUtils.rand(-50, 50);
            this.vy = MathUtils.rand(-150, -50);
        } else {
            this.vx = 0; this.vy = -20;
        }
        
        this.pixiObj = new PIXI.Container();
        let lines = this.text.split('\n');
        
        for(let j=0; j<lines.length; j++) {
            let size = (this.isLoot && j > 0) ? 11 : (this.isLoot && j === 0 ? 16 : (this.isCrit ? 36 : (this.isDamage ? 26 : 22)));
            let styleObj = {
                fontFamily: 'Orbitron',
                fontSize: size,
                fontWeight: 'bold',
                fill: this.color,
                align: 'center'
            };
            if (this.isCrit) {
                styleObj.fontStyle = 'italic';
                styleObj.dropShadow = true;
                styleObj.dropShadowColor = this.color;
                styleObj.dropShadowBlur = 10;
                styleObj.dropShadowDistance = 0;
                styleObj.fill = '#ffffff';
                styleObj.stroke = this.color;
                styleObj.strokeThickness = 2;
            } else {
                styleObj.dropShadow = true;
                styleObj.dropShadowColor = '#000000';
                styleObj.dropShadowDistance = 2;
                styleObj.dropShadowBlur = 0;
                styleObj.fill = this.color;
            }

            let textSprite = new PIXI.Text(lines[j], styleObj);
            textSprite.anchor.set(0.5, 0);
            textSprite.y = j * (size + 4);
            this.pixiObj.addChild(textSprite);
        }
        
        GAME.layers.ui.addChild(this.pixiObj);
    }
    update(dt) {
        this.life -= dt;
        if (this.life <= 0) {
            if (this.pixiObj) {
                this.pixiObj.destroy({ children: true });
                this.pixiObj = null;
            }
            return true;
        }
        if (this.isLoot) {
            let speedSq = this.vx*this.vx + this.vy*this.vy;
            if (speedSq > 10) { // Lower threshold to allow it to glide further
                // Phase 1: Ease out (Less drag than before for further jut out)
                this.vx *= 0.88;
                this.vy *= 0.88;
                this.x += this.vx * dt;
                this.y += this.vy * dt;
             } 
        } else {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
        }
        return false;
    }
    draw() {
        if (!this.pixiObj) return;
        let p = project(this.x, this.y, this.z);
        if(!p) {
            this.pixiObj.visible = false;
            return;
        }
        this.pixiObj.visible = true;
        this.pixiObj.position.set(p.x, p.y);
        
        let alpha = 1.0;
        if(this.life < 0.5) alpha = this.life / 0.5;
        this.pixiObj.alpha = Math.max(0, alpha);
    }
}

class Shockwave {
    constructor(x, y, z, color, maxRadius=30) {
        this.x = x; this.y = y; this.z = z;
        this.color = color;
        this.life = 0.3;
        this.maxLife = 0.3;
        this.maxRadius = maxRadius;
        
        this.graphics = new PIXI.Graphics();
        GAME.layers.game.addChild(this.graphics);
    }
    update(dt) {
        this.life -= dt;
        if (this.life <= 0) {
            if (this.graphics) {
                this.graphics.destroy();
                this.graphics = null;
            }
            return true;
        }
        return false;
    }
    draw() {
        if (!this.graphics) return;
        this.graphics.clear();
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        
        let s = getScale(this.z);
        let progress = 1 - (this.life / this.maxLife);
        let alpha = 1 - progress;
        let c = typeof this.color === 'string' ? parseColor(this.color) : this.color;
        
        this.graphics.lineStyle(3 * s * (this.life / this.maxLife), c, alpha);
        this.graphics.drawCircle(p.x, p.y, progress * this.maxRadius * s);
        this.graphics.zIndex = this.z;
    }
}

function createParticles(x, y, z, count, color, life=1.0) {
    for(let i=0; i<count; i++) particles.push(new Particle(x, y, z, color, life));
}

function createFloatingText(text, x, y, color, life = 1.0, isLoot = false, isDamage = false, isCrit = false) {
    floatingTexts.push(new FloatingText(text, x, y, color, life, isLoot, isDamage, isCrit));
}

function spawnDrop(x, y, forceResource = false, item = null) {
    drops.push(new Drop(x, y, forceResource, item));
}

class EmpBlast {
    constructor(x, y, radius, damage, color) {
        let maxRadius = radius; // TWEAK: blast radius
        let displacementPower = 100; // TWEAK: displacement power
        let waveExpansionSpeed = 0.5; // TWEAK: wave expansion speed
        let showVectors = false; // TWEAK: show vectors

        this.x = x; this.y = y; this.z = 0;
        this.maxRadius = maxRadius;
        this.damage = damage;
        this.color = color;
        this.life = waveExpansionSpeed;
        this.maxLife = waveExpansionSpeed;
        this.hitEntities = new Set();
        this.dead = false;
        
        // Ripple displacement effect logic
        this.rippleLife = waveExpansionSpeed;
        this.maxRippleLife = waveExpansionSpeed;
        this.displacementPower = displacementPower;

        this.graphics = new PIXI.Graphics();
        
        this.displacementSprite = new PIXI.Sprite(this.getVectorTexture(showVectors));
        this.displacementSprite.anchor.set(0.5);
        this.displacementSprite.scale.set(0.1);
        
        this.displacementFilter = new PIXI.DisplacementFilter(this.displacementSprite, displacementPower);
        
        GAME.layers.game.addChild(this.graphics);
        GAME.layers.game.addChild(this.displacementSprite);
        
        let currentFilters = GAME.layers.game.filters || [];
        currentFilters.push(this.displacementFilter);
        GAME.layers.game.filters = currentFilters;
    }

    getVectorTexture(showVectors) {
        if (GAME.textures.vectorRipple) return GAME.textures.vectorRipple;

        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(256, 256);
        const data = imgData.data;

        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                let dx = x - 128;
                let dy = y - 128;
                let dist = Math.hypot(dx, dy);
                let idx = (y * 256 + x) * 4;

                if (dist > 0 && dist <= 128) {
                    let nx = dx / dist;
                    let ny = dy / dist;
                    
                    // A pulse ring Profile: peaks at 64, tails off to 128 and 0.
                    let strength = 0;
                    if (dist >= 64 && dist <= 128) {
                        let normalized = (dist - 64) / 64; 
                        strength = Math.sin(normalized * Math.PI); 
                    }

                    // Map physical vector direction onto Red and Green color channels
                    data[idx] = Math.max(0, Math.min(255, 128 + nx * strength * 127));
                    data[idx+1] = Math.max(0, Math.min(255, 128 + ny * strength * 127));
                    data[idx+2] = 128;
                    data[idx+3] = 255;
                } else {
                    data[idx] = 128;
                    data[idx+1] = 128;
                    data[idx+2] = 128;
                    data[idx+3] = 255;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);

        if (showVectors) {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
            ctx.beginPath();
            for (let y = 16; y < 256; y += 32) {
                for (let x = 16; x < 256; x += 32) {
                    let dx = x - 128;
                    let dy = y - 128;
                    let dist = Math.hypot(dx, dy);
                    if (dist > 0 && dist < 128) {
                        let strength = 0;
                        if (dist >= 64 && dist <= 128) {
                            strength = Math.sin(((dist - 64) / 64) * Math.PI); 
                        }
                        ctx.moveTo(x, y);
                        ctx.lineTo(x + (dx/dist) * strength * 15, y + (dy/dist) * strength * 15);
                    }
                }
            }
            ctx.stroke();
        }

        GAME.textures.vectorRipple = PIXI.Texture.from(canvas);
        return GAME.textures.vectorRipple;
    }

    update(dt) {
        if(this.dead) return true;
        this.life -= dt;
        this.rippleLife -= dt;

        let progress = 1.0 - Math.max(0, this.life / this.maxLife);
        let currentRadius = this.maxRadius * progress;

        for(let e of entities) {
            if (e instanceof Enemy && !e.dead && !this.hitEntities.has(e) && e.z <= 0) {
                if (MathUtils.distance(this.x, this.y, e.x, e.y) <= currentRadius + e.radius) {
                    this.hitEntities.add(e);
                    e.takeDamage(this.damage, player, this.color);
                    
                    let kbAngle = MathUtils.angle(this.x, this.y, e.x, e.y);
                    e.empKnockbackVx = Math.cos(kbAngle) * 1000;
                    e.empKnockbackVy = Math.sin(kbAngle) * 1000;
                    e.empKnockbackTimer = 0.3; 
                    e.empSlowTimer = 3.0;
                }
            }
        }
        
        for(let i=projectiles.length-1; i>=0; i--) {
            let p = projectiles[i];
            if (!p.isPlayer && !this.hitEntities.has(p)) {
                if (MathUtils.distance(this.x, this.y, p.x, p.y) <= currentRadius) {
                    this.hitEntities.add(p);
                    createParticles(p.x, p.y, 0, 5, p.color);
                    if (p.pixiObj) {
                        p.pixiObj.destroy();
                        p.pixiObj = null;
                    }
                    projectiles.splice(i, 1);
                }
            }
        }

        if(this.life <= 0 && this.rippleLife <= 0) {
            this.dead = true;
            if(this.graphics) {
                this.graphics.destroy();
                this.graphics = null;
            }
            if(this.displacementSprite) {
                this.displacementSprite.destroy();
                this.displacementSprite = null;
            }
            if(GAME.layers.game.filters) {
                GAME.layers.game.filters = GAME.layers.game.filters.filter(f => f !== this.displacementFilter);
                if (GAME.layers.game.filters.length === 0) {
                    GAME.layers.game.filters = null;
                }
            }
            if(this.displacementFilter) {
                this.displacementFilter.destroy();
                this.displacementFilter = null;
            }
            return true;
        }
        return false;
    }

    draw() {
        if(!this.graphics) return;
        this.graphics.clear();
        let p = project(this.x, this.y, this.z);
        if(!p) {
            this.graphics.visible = false;
            if(this.displacementSprite) this.displacementSprite.visible = false;
            return;
        }
        
        let s = getScale(this.z);
        
        if (this.life > 0) {
            this.graphics.visible = true;
            let progress = 1.0 - (this.life / this.maxLife);
            let currentRadius = this.maxRadius * progress;
            let alpha = 1.0 - Math.pow(progress, 2);
            
            let c = typeof this.color === 'string' ? parseColor(this.color) : this.color;
            this.graphics.lineStyle(4 * s, c, alpha);
            this.graphics.drawCircle(p.x, p.y, currentRadius * s);
            
            this.graphics.beginFill(c, alpha * 0.2);
            this.graphics.drawCircle(p.x, p.y, currentRadius * s);
            this.graphics.endFill();
            this.graphics.zIndex = this.z;
        } else {
            this.graphics.visible = false;
        }
        
        if (this.displacementSprite) {
            if (this.rippleLife > 0) {
                this.displacementSprite.visible = true;
                let rippleProgress = 1.0 - (this.rippleLife / this.maxRippleLife);
                let currentRippleRadius = this.maxRadius * rippleProgress;
                
                // Texture is 256x256, so radius is 128
                this.displacementSprite.scale.set((currentRippleRadius / 128) * s);
                this.displacementSprite.position.set(p.x, p.y);
                
                // Fade out displacement over time
                this.displacementFilter.scale.set((1.0 - Math.pow(rippleProgress, 2)) * this.displacementPower * s);
            } else {
                this.displacementSprite.visible = false;
            }
        }
    }
}

function spawnBoss() {
    for (let i = entities.length - 1; i >= 0; i--) {
        let e = entities[i];
        if (e instanceof Enemy) {
            e.dead = true;
            if (e.pixiObj) {
                e.pixiObj.destroy({ children: true });
                e.pixiObj = null;
            }
            if (e.type === 'spreader') {
                for (let net of e.networks) {
                    for (let node of net) {
                        node.dead = true;
                        if (node.pixiObj) {
                            node.pixiObj.destroy({ children: true });
                            node.pixiObj = null;
                        }
                    }
                }
                for (let node of e.currentNetwork) {
                    node.dead = true;
                    if (node.pixiObj) {
                        node.pixiObj.destroy({ children: true });
                        node.pixiObj = null;
                    }
                }
            }
            entities.splice(i, 1);
        }
    }
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