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
                let dmg = Math.floor(speed * this.collisionDamageMult); // damage based on speed
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
        let critInfo = calculateCrit(amount, source);
        amount = critInfo.amount;
        this.hp -= amount;
        if (amount >= 1) createFloatingText(`-${Math.floor(amount)}${critInfo.isCrit ? '!' : ''}`, this.x, this.y, color, 1.0, false, true, critInfo.isCrit);
        if(this.hp <= 0) {
            this.dead = true;

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
        let critInfo = calculateCrit(amount, source);
        amount = critInfo.amount;
        this.hp -= amount;
        if (amount >= 1) createFloatingText(`-${Math.floor(amount)}${critInfo.isCrit ? '!' : ''}`, this.x, this.y, color, 1.0, false, true, critInfo.isCrit);
        if(this.hp <= 0) {
            this.dead = true;

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
            let totalXp = 5 * this.level;
            let numOrbs = MathUtils.randInt(3, 5);
            let xpPerOrb = totalXp / numOrbs;
            for(let i=0; i<numOrbs; i++) xpOrbs.push(new XpOrb(this.x, this.y, xpPerOrb));
            
            if (equipment['Reactor'] && equipment['Reactor'].upgradedPerk) {
                let bonusOrbs = MathUtils.randInt(3, 5);
                for(let i=0; i<bonusOrbs; i++) xpOrbs.push(new XpOrb(this.x, this.y, xpPerOrb * 1.2, true));
            }
            
            return true;
        }
        return false;
    }
}

class FungalNode {
    constructor(x, y, level) {
        this.x = x; this.y = y; this.z = 0;
        this.level = level;
        this.radius = 12;
        this.maxHp = 25 * level;
        this.hp = this.maxHp;
        this.dead = false;
        this.pulseTimer = 0;
        this.life = 15.0; // Dies naturally after 45s to avoid permanent clutter
        this.links = []; // Connected Mycelial nodes
    }
    update(dt) {
        if (this.dead) return true;
        this.pulseTimer += dt;
        this.life -= dt;
        
        if (this.life <= 0) {
            this.dead = true;
            createParticles(this.x, this.y, 0, 10, '#99ff33');
            return true;
        }
        
        // Form Mycelial Links
        this.links = [];
        for (let e of entities) {
            if (e instanceof FungalNode && e !== this && !e.dead) {
                if (MathUtils.distance(this.x, this.y, e.x, e.y) <= 400) {
                    this.links.push(e);
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
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        let s = getScale(this.z);
        
        // Draw Links
        ctx.strokeStyle = `rgba(153, 255, 51, ${0.4 + 0.2 * Math.sin(this.pulseTimer * 3)})`;
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        for (let e of this.links) {
            let p2 = project(e.x, e.y, e.z);
            if (p2 && (e.x > this.x || (e.x === this.x && e.y > this.y))) { // Avoids double-drawing the same link back and forth
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p2.x, p2.y);
            }
        }
        ctx.stroke();
        
        // Draw Node
        ctx.fillStyle = '#223311';
        ctx.strokeStyle = '#99ff33';
        ctx.lineWidth = 2 * s;
        let pulse = 1 + 0.1 * Math.sin(this.pulseTimer * 5);
        ctx.beginPath(); ctx.arc(p.x, p.y, this.radius * s * pulse, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        
        // Inner glowing core
        ctx.fillStyle = `rgba(153, 255, 51, ${0.5 + 0.5 * Math.sin(this.pulseTimer * 5)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, this.radius * 0.5 * s * pulse, 0, Math.PI*2); ctx.fill();
    }
    takeDamage(amount, source, color = '#fff') {
        if (this.dead) return false;
        let critInfo = calculateCrit(amount, source);
        amount = critInfo.amount;
        this.hp -= amount;
        if (amount >= 1) createFloatingText(`-${Math.floor(amount)}${critInfo.isCrit ? '!' : ''}`, this.x, this.y, color, 1.0, false, true, critInfo.isCrit);
        if(this.hp <= 0) {
            this.dead = true;
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
        this.color = '#af8123'; // Baby Shit Brown
        this.speed = 100 + this.level * 1.5;
        this.maxHp = 100 * (1 + (this.level - 1) * 0.3);
        this.hp = this.maxHp;
        
        this.baseDamage = 10; 
        this.damageScale = 0.2;
        this.spreaderDamageMult = 1.0;
        this.damage = this.baseDamage * (1 + (this.level - 1) * this.damageScale);
        
        this.nodeTimer = 2.0; 
        this.attackTimer = 0;
    }
    update(dt) {
        if(super.update(dt)) return true; // Spawning or stun handling from superclass
        if (this.dead) return true;
        
        let dist = MathUtils.distance(this.x, this.y, player.x, player.y);
        let angle = MathUtils.angle(this.x, this.y, player.x, player.y);
        
        // Spreader evades the player and attempts to circle around at mid-range
        let targetDist = 600;
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
        
        if (this.attackTimer > 0) this.attackTimer -= dt;
        if (dist < this.radius + player.radius && this.attackTimer <= 0) {
            player.takeDamage(getDamage(this) * this.spreaderDamageMult, this);
            this.attackTimer = 1.0;
        }
        
        this.nodeTimer -= dt;
        if (this.nodeTimer <= 0) {
            entities.push(new FungalNode(this.x, this.y, this.level));
            this.nodeTimer = 5.0; // Every 5 seconds it drops a new fungal node
        }
    }
    draw(ctx) {
        super.draw(ctx);
        // Add bioluminescent spots
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        let scale = getScale(this.z);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(scale, scale);
        ctx.rotate(Math.atan2(this.vy, this.vx));
        
        let pulse = (Math.sin(Date.now() / 200) + 1) / 2;
        ctx.fillStyle = `rgba(153, 255, 51, ${0.3 + 0.7 * pulse})`;
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-10, 8, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-10, -8, 3, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    }
}

class BrutalistMonolith extends Asteroid {
    constructor(x, y, level, damage = 0, source = null) {
        super(x, y, 35); // Fixed 35 radius for precision trap
        this.vx = 0; 
        this.vy = 0; 
        this.rotSpeed = 0;
        this.maxHp = 20 * level; // Low HP scale
        this.hp = this.maxHp;
        this.height = 60; // Visual height
        this.telegraphTimer = 1.5;
        this.damage = damage;
        this.source = source;
    }
    update(dt) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        let scale = getScale(this.z);
        
        if (this.telegraphTimer > 0) {
            let progress = 1 - (this.telegraphTimer / 1.5);
            let timeElapsed = 1.5 - this.telegraphTimer;
            
            // Ripple effect
            let rippleCount = 3;
            for (let i = 0; i < rippleCount; i++) {
                let rProgress = (timeElapsed * (1 + progress * 2) + i / rippleCount) % 1.0;
                ctx.strokeStyle = `rgba(255, 51, 102, ${1.0 - rProgress})`;
                ctx.lineWidth = 2 * scale;
                ctx.beginPath();
                ctx.arc(p.x, p.y, this.radius * scale * rProgress, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Target boundary
            let freq = 10 + progress * 20; 
            let pulse = (Math.sin(timeElapsed * freq) + 1) / 2;
            
            ctx.strokeStyle = `rgba(255, 51, 102, ${0.5 + 0.5 * pulse})`;
            ctx.lineWidth = (2 + 2 * pulse) * scale;
            ctx.beginPath();
            ctx.arc(p.x, p.y, this.radius * scale, 0, Math.PI * 2);
            ctx.stroke();
            
            // Growing red core
            ctx.fillStyle = `rgba(255, 51, 102, ${progress * 0.4})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, this.radius * scale * progress, 0, Math.PI * 2);
            ctx.fill();

            return;
        }
        
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(scale, scale);
        
        ctx.fillStyle = '#2a2a2a';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;

        // Base shadow/ellipse
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius, this.radius * 0.4, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Body extending upwards visually
        ctx.fillRect(-this.radius, -this.height, this.radius * 2, this.height);
        ctx.beginPath(); ctx.moveTo(-this.radius, 0); ctx.lineTo(-this.radius, -this.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(this.radius, 0); ctx.lineTo(this.radius, -this.height); ctx.stroke();

        // Top ellipse
        ctx.fillStyle = '#3a3a3a';
        ctx.beginPath();
        ctx.ellipse(0, -this.height, this.radius, this.radius * 0.4, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Cyberpunk/brutalist accents
        ctx.fillStyle = '#ff3366';
        ctx.fillRect(-10, -this.height * 0.7, 20, 4);
        ctx.fillRect(-10, -this.height * 0.4, 20, 4);
        
        // HP bar
        if(this.hp < this.maxHp) {
            ctx.fillStyle = 'red';
            ctx.fillRect(-this.radius, -this.height - 15, this.radius*2, 4);
            ctx.fillStyle = 'green';
            ctx.fillRect(-this.radius, -this.height - 15, (this.radius*2) * (this.hp/this.maxHp), 4);
        }
        
        ctx.restore();
    }
}

class MonolithArchitect extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.radius = 25;
        this.type = 'architect';
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
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        let scale = getScale(this.z);
        
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(scale, scale);
        ctx.rotate(Math.atan2(this.vy, this.vx));
        
        // Heavy armor plating
        ctx.fillStyle = '#445566';
        ctx.strokeStyle = this.stunTimer > 0 ? '#ffff00' : this.color;
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.rect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
        ctx.fill(); ctx.stroke();
        
        ctx.fillStyle = '#223344';
        ctx.fillRect(-this.radius/2, -this.radius/2, this.radius, this.radius);
        
        // Eye
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath(); ctx.arc(this.radius/2, 0, 4, 0, Math.PI*2); ctx.fill();
        
        ctx.restore();
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
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        
        if (this.type === 'bullet' && (this.vx !== 0 || this.vy !== 0)) {
            let s = getScale(this.z);
            let angle = Math.atan2(this.vy, this.vx);
            let length = 15 * s;
            
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 6 * s;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x - Math.cos(angle) * length, p.y - Math.sin(angle) * length);
            ctx.lineTo(p.x + Math.cos(angle) * length, p.y + Math.sin(angle) * length);
            ctx.stroke();
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2 * s;
            ctx.stroke();
        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, 3 * getScale(this.z), 0, Math.PI*2); ctx.fill();
        }
        ctx.shadowBlur = 0;
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
    }

    update(dt, targetX, targetY) {
        if (this.dead) return true;

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
        if (this.dead) return;
        ctx.strokeStyle = this.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        
        // Visual pulsing width
        let widthMult = 1 + 0.5 * Math.sin(Date.now() / 50);
        ctx.lineWidth = 4 * widthMult * getScale(this.z);
        
        ctx.beginPath();
        let p0 = project(this.nodes[0].x, this.nodes[0].y, this.z);
        if (!p0) {
            ctx.shadowBlur = 0;
            return; 
        }
        ctx.moveTo(p0.x, p0.y);

        // Quad curve through midpoints
        for (let i = 1; i < this.numNodes - 1; i++) {
            let pCurr = project(this.nodes[i].x, this.nodes[i].y, this.z);
            let pNext = project(this.nodes[i+1].x, this.nodes[i+1].y, this.z);
            if (pCurr && pNext) {
                let mx = (pCurr.x + pNext.x) / 2;
                let my = (pCurr.y + pNext.y) / 2;
                ctx.quadraticCurveTo(pCurr.x, pCurr.y, mx, my);
            }
        }
        let pLast = project(this.nodes[this.numNodes-1].x, this.nodes[this.numNodes-1].y, this.z);
        if (pLast) {
            ctx.lineTo(pLast.x, pLast.y);
        }

        ctx.stroke();
        ctx.shadowBlur = 0;
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
    }
    update(dt) {
        this.life -= dt;
        if (this.life <= 0) return true;
        
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
            return true;
        }
        return false;
    }
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        let s = getScale(this.z);
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffff00';
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(p.x, p.y, this.radius * s, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = '#000';
        ctx.fillRect(p.x - 2*s, p.y - 4*s, 4*s, 8*s);
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
        createParticles(this.x, this.y, 0, 50, '#ff4400');
        shockwaves.push(new Shockwave(this.x, this.y, 0, '#ff4400', 75));
        let dist = MathUtils.distance(this.x, this.y, player.x, player.y);
        if (dist <= 75) {
            let hpDmg = player.stats.maxHp * this.explosionDamagePercent;
            let flatDmg = getDamage(this) * this.explosionDamageMult;
            player.takeDamage(hpDmg + flatDmg, this.source);
        }
    }
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        let s = getScale(this.z);
        
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(s, s);
        ctx.rotate(this.angle);
        
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath();
        ctx.moveTo(10, 0); 
        ctx.lineTo(-10, 7.5);
        ctx.lineTo(-10, -7.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        if (this.fuel > 0) {
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.moveTo(-10, 5);
            ctx.lineTo(-10 - Math.random() * 15, 0);
            ctx.lineTo(-10, -5);
            ctx.fill();
        }
        
        ctx.restore();
        
        let barW = 30 * s;
        let barH = 4 * s;
        let bY = p.y + 20 * s;
        
        ctx.fillStyle = 'red';
        ctx.fillRect(p.x - barW/2, bY, barW, barH);
        ctx.fillStyle = 'green';
        ctx.fillRect(p.x - barW/2, bY, barW * Math.max(0, this.hp / this.maxHp), barH);
        
        ctx.fillStyle = '#333';
        ctx.fillRect(p.x - barW/2, bY + barH + 2, barW, barH);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(p.x - barW/2, bY + barH + 2, barW * Math.max(0, this.fuel / 100), barH);
    }
    takeDamage(amount, source, color = '#fff') {
        if (this.dead) return false;
        let critInfo = calculateCrit(amount, source);
        amount = critInfo.amount;
        this.hp -= amount;
        if (amount >= 1) createFloatingText(`-${Math.floor(amount)}${critInfo.isCrit ? '!' : ''}`, this.x, this.y, color, 1.0, false, true, critInfo.isCrit);
        if(this.hp <= 0) {
            this.dead = true;
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
            { name: 'missile', cd: 6, maxCd: 15.0 }
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
            
            if (dist < this.radius + player.radius && this.attackTimer <= 0) {
                player.takeDamage(getDamage(this) * this.contactDamageMult, this);
                this.attackTimer = 1.0;
            }
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if(this.attackTimer > 0) this.attackTimer -= dt;
    }

    draw(ctx) {
        super.draw(ctx); // basic shape
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        
        let barW = 80 * getScale(this.z);
        let barH = 6 * getScale(this.z);
        let bY = p.y - 50 * getScale(this.z);
        
        ctx.fillStyle = '#000';
        ctx.fillRect(p.x - barW/2, bY, barW, barH);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(p.x - barW/2, bY, barW * Math.max(0, this.hp / this.maxHp), barH);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x - barW/2, bY, barW, barH);
        
        ctx.fillStyle = '#fff';
        ctx.font = `${10 * getScale(this.z)}px Orbitron`;
        ctx.textAlign = 'center';
        ctx.fillText("VOID BOSS", p.x, bY - 4 * getScale(this.z));
    }

    takeDamage(amount, source, color = '#fff') {
        if (super.takeDamage(amount, source, color)) {
            GAME.activeBoss = null;
            GAME.bossDefeated = true;
            // Big loot explosion
            let totalXp = 500 * this.level;
            let numOrbs = 50;
            let xpPerOrb = totalXp / numOrbs;
            for(let i=0; i<numOrbs; i++) xpOrbs.push(new XpOrb(this.x, this.y, xpPerOrb));
            
            if (equipment['Reactor'] && equipment['Reactor'].upgradedPerk) {
                let bonusOrbs = MathUtils.randInt(3, 5);
                for(let i=0; i<bonusOrbs; i++) xpOrbs.push(new XpOrb(this.x, this.y, xpPerOrb * 1.2, true));
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
        this.x = x; this.y = y; this.z = 0;
        let angle = MathUtils.angle(x, y, targetX, targetY);
        this.vx = Math.cos(angle) * 400;
        this.vy = Math.sin(angle) * 400;
        this.targetX = targetX; this.targetY = targetY;
        this.state = 'moving'; // moving, blackhole
        this.timer = 3.0; // blackhole duration
        this.radius = 0;
        this.tickTimer = 0;
        this.tickDamageMult = 0.35;
        this.explosionDamageMult = 2.0;
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
                        e.takeDamage(getDamage(player) * this.tickDamageMult, player, '#9933ff');
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
                        e.takeDamage(getDamage(player) * this.explosionDamageMult, player, '#9933ff');
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
            ctx.fillStyle = '#9933ff';
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
    constructor(x1, y1, x2, y2, width, mult, color) {
        this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
        this.z = 0;
        this.width = width;
        this.mult = mult;
        this.color = color;
        this.life = 1.5;
        this.maxLife = 1.5;
        this.dx = x2 - x1;
        this.dy = y2 - y1;
        this.len = Math.hypot(this.dx, this.dy);
        this.angle = Math.atan2(this.dy, this.dx);
        this.tickTimer = 0;
        this.tickDamageMult = 0.4;
    }
    update(dt) {
        this.life -= dt;
        
        // Spawn lightning particles
        if (this.len > 0) {
            let spawnCount = Math.floor(this.len / 50); 
            for (let i = 0; i < spawnCount; i++) {
                if (Math.random() < dt * 15) {
                    let t = Math.random();
                    let r = t * this.len;
                    let a = this.angle + MathUtils.rand(-Math.PI / 12, Math.PI / 12);
                    let px = this.x1 + Math.cos(a) * r;
                    let py = this.y1 + Math.sin(a) * r;
                    let colors = ['#ff00ff', '#ff66ff', '#cc00ff'];
                    particles.push(new Particle(px, py, 0, colors[MathUtils.randInt(0, 2)], MathUtils.rand(0.1, 0.3), 'lightning'));
                }
            }
        }

        this.tickTimer -= dt;
        if (this.len > 0 && this.tickTimer <= 0) {
            let fireRateMult = player.stats.fireRate / 100;
            this.tickTimer = this.tickDamageMult / fireRateMult;
            let halfAngle = Math.PI / 12; // 15 degrees
            for (let i = entities.length - 1; i >= 0; i--) {
                let e = entities[i];
                if (e instanceof Enemy && !e.dead && e.z <= 0) {
                    let dist = MathUtils.distance(this.x1, this.y1, e.x, e.y);
                    if (dist <= this.len + e.radius) {
                        let eAngle = MathUtils.angle(this.x1, this.y1, e.x, e.y);
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
        let color = this.isBonus ? '#aaffcc' : '#00ff66';
        ctx.fillStyle = color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.beginPath(); ctx.arc(p.x, p.y, this.radius * s * pulse, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        
        if (this.isBonus) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(p.x, p.y, this.radius * s * pulse, 0, Math.PI*2); ctx.stroke();
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
        this.color = '#ff3366';
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
            return true; // remove orb
        }
        return false;
    }
    draw(ctx) {
        let p = project(this.x, this.y, this.z);
        if(!p) return;
        let s = getScale(this.z);
        let pulse = 1 + 0.3 * Math.sin(this.life * 5);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, this.radius * s * pulse, 0, Math.PI*2); ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.fillRect(p.x - 1*s, p.y - 3*s, 2*s, 6*s);
        ctx.fillRect(p.x - 3*s, p.y - 1*s, 6*s, 2*s);
        
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
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.atan2(this.vy, this.vx));
            ctx.beginPath(); 
            ctx.ellipse(0, 0, 4 * s, 1.5 * s, 0, 0, Math.PI * 2); 
            ctx.fill();
            ctx.restore();
        }
        
        ctx.globalAlpha = 1.0;
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
            let spd = MathUtils.rand(400, 700); // More aggressive outward burst
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
            let size = (this.isLoot && j > 0) ? 14 : (this.isLoot && j === 0 ? 18 : (this.isCrit ? 36 : (this.isDamage ? 26 : 22)));
            ctx.font = this.isCrit ? `italic bold ${size}px Orbitron` : `bold ${size}px Orbitron`;
            
            if (this.isCrit) {
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 10;
                ctx.fillStyle = '#fff';
                ctx.fillText(lines[j], p.x, p.y + j * (size + 4));
                
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 2;
                ctx.shadowBlur = 0;
                ctx.strokeText(lines[j], p.x, p.y + j * (size + 4));
            } else {
                // Replaced shadowBlur with a much faster manual drop shadow
                ctx.fillStyle = 'black';
                ctx.fillText(lines[j], p.x + 2, p.y + j * (size + 4) + 2);
                ctx.fillStyle = this.color;
                ctx.fillText(lines[j], p.x, p.y + j * (size + 4));
            }
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

function createFloatingText(text, x, y, color, life = 1.0, isLoot = false, isDamage = false, isCrit = false) {
    floatingTexts.push(new FloatingText(text, x, y, color, life, isLoot, isDamage, isCrit));
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