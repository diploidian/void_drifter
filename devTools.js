/** ==========================================
 * DEV TOOLS & CHEATS (lil-gui)
 * ========================================== */

const devSettings = {
    healPlayer: () => {
        player.stats.hp = player.stats.maxHp;
        updateUI();
    },
    levelUp: () => {
        player.gainXp(player.xpNext - player.xp);
    },
    spawnBoss: () => {
        spawnBoss();
    },
    spawnAsteroids: () => {
        for (let i = 0; i < 10; i++) {
            let angle = Math.random() * Math.PI * 2;
            let dist = MathUtils.rand(300, 800);
            entities.push(new Asteroid(player.x + Math.cos(angle) * dist, player.y + Math.sin(angle) * dist, MathUtils.rand(20, 80)));
        }
    },
    lootGen: () => {
        // Generate 3 Rare (Tier 3), 3 Epic (Tier 4), and 3 Legendary (Tier 5)
        for (let i = 0; i < 3; i++) spawnDrop(player.x + MathUtils.rand(-100, 100), player.y + MathUtils.rand(-100, 100), false, generateLoot(null, 3));
        for (let i = 0; i < 3; i++) spawnDrop(player.x + MathUtils.rand(-100, 100), player.y + MathUtils.rand(-100, 100), false, generateLoot(null, 4));
        for (let i = 0; i < 3; i++) spawnDrop(player.x + MathUtils.rand(-100, 100), player.y + MathUtils.rand(-100, 100), false, generateLoot(null, 5));
    },
    clearLoot: () => {
        drops.length = 0; // instantly clear all drops off the map
    },
    spawnRateMult: 1.0
};

const devGUI = new lil.GUI({ title: 'Dev Console' });

// Position UI on the Left side, start hidden
devGUI.domElement.style.position = 'absolute';
devGUI.domElement.style.top = '20px';
devGUI.domElement.style.left = '20px';
devGUI.domElement.style.right = 'auto';
devGUI.domElement.style.zIndex = '1000';
devGUI.hide();

const folderCheats = devGUI.addFolder('Cheats & Player');
folderCheats.add(devSettings, 'healPlayer').name('Heal to Max HP');
folderCheats.add(devSettings, 'levelUp').name('Level Up (+1)');

const folderSpawns = devGUI.addFolder('Spawns & Environment');
folderSpawns.add(devSettings, 'spawnBoss').name('Spawn Boss');
folderSpawns.add(devSettings, 'spawnAsteroids').name('Spawn Asteroids');
folderSpawns.add(devSettings, 'spawnRateMult', 0.1, 10.0, 0.1).name('Spawn Rate Multiplier');

const folderLoot = devGUI.addFolder('Loot Generation');
folderLoot.add(devSettings, 'lootGen').name('Drop Rare-Leg Items');
folderLoot.add(devSettings, 'clearLoot').name('Clear Map Drops');