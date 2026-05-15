/** ==========================================
 * CORE MATH & UTILITIES
 * ========================================== */
const MathUtils = {
    rand: (min, max) => Math.random() * (max - min) + min,
    randInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    distance: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    angle: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1),
    lerp: (a, b, t) => a + (b - a) * t,
    clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
    distToSegment: (px, py, x1, y1, x2, y2) => {
        let l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2));
        return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    }
};

const DSU = {
    parent: new Map(),
    init(nodes) {
        this.parent.clear();
        nodes.forEach(node => this.parent.set(node, node));
    },
    find(node) {
        if (!this.parent.has(node)) return null;
        if (this.parent.get(node) === node) {
            return node;
        }
        const root = this.find(this.parent.get(node));
        this.parent.set(node, root);
        return root;
    },
    union(nodeA, nodeB) {
        const rootA = this.find(nodeA);
        const rootB = this.find(nodeB);
        if (rootA !== rootB) {
            this.parent.set(rootB, rootA);
        }
    }
};

function findPath(startNode, endNode, adj) {
    const queue = [[startNode]];
    const visited = new Set([startNode]);

    while (queue.length > 0) {
        const path = queue.shift();
        const node = path[path.length - 1];

        if (node === endNode) return path;

        const neighbors = adj.get(node) || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                const newPath = [...path, neighbor];
                queue.push(newPath);
            }
        }
    }
    return null;
}

function isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i].x, yi = polygon[i].y;
        let xj = polygon[j].x, yj = polygon[j].y;
        let intersect = ((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function getDamage(source) {
    let dmg = source.stats ? source.stats.damage : source.damage;
    if (typeof dmg === 'object') {
        return MathUtils.rand(dmg.min, dmg.max);
    }
    return dmg;
}

function calculateCrit(amount, source) {
    let isCrit = false;
    if (source && source.stats && source.stats.critChance) {
        if (Math.random() * 100 < source.stats.critChance) {
            isCrit = true;
            amount *= 1.45;
        }
    }
    return { amount, isCrit };
}

function parseColor(colorStr) {
    if (!colorStr) return 0xffffff;
    colorStr = colorStr.trim();
    if (colorStr.startsWith('#')) {
        let hex = colorStr.replace('#', '');
        if(hex.length === 3) hex = hex.split('').map(c => c+c).join('');
        return parseInt(hex, 16);
    }
    if (colorStr.startsWith('rgb')) {
        let p = colorStr.match(/\d+/g);
        if (p && p.length >= 3) return (parseInt(p[0]) << 16) + (parseInt(p[1]) << 8) + parseInt(p[2]);
    }
    return 0xffffff;
}
window.parseColor = parseColor;

/** ==========================================
 * GAME CONSTANTS & GLOBALS
 * ========================================== */
const miniCanvas = document.getElementById('minimap');
const miniCtx = miniCanvas.getContext('2d');

var cw = window.innerWidth;
var ch = window.innerHeight;

const WORLD_SIZE = 4000; // -2000 to +2000
const FOCAL_LENGTH = 800; // For Z-axis perspective

const GAME = {
    state: 'PLAYING', // PLAYING, INVENTORY, DEAD
    lastTime: 0,
    pixiApp: null,
    layers: {},
    textures: {},
    camera: { x: 0, y: 0, zoom: 1.0 },
    bossSpawned: false,
    activeBoss: null,
    bossDefeated: false,
    keys: { w: false, a: false, s: false, d: false, ' ': false, '1': false, '2': false, '3': false, '4': false, 'f': false },
    mouse: { x: cw/2, y: ch/2, worldX: 0, worldY: 0, left: false },
    fowMap: new Map(), // Fog of War visited chunks
    stars: [],
    clouds: []
};

const AUDIO_CACHE = {};
function playSound(file, volume = 0.5, pitch = 1.0) {
    if(!AUDIO_CACHE[file]) {
        let newAudio = new Audio(file)
        newAudio.crossOrigin = "anonymous";
        AUDIO_CACHE[file] = new Audio(file);
    }
    let audio = AUDIO_CACHE[file].cloneNode();
    audio.volume = volume;
    audio.preservesPitch = false;
    audio.mozPreservesPitch = false;
    audio.webkitPreservesPitch = false;
    audio.playbackRate = pitch;

    audio.play().catch(e => {}); // Catch play-prevention to avoid error spam
}

/** ==========================================
 * ICONS & SVG GENERATION
 * ========================================== */
const SVG_CACHE = {};

function getIcon(type, color) {
    let key = type + color;
    if(SVG_CACHE[key]) return SVG_CACHE[key];
    
    let path = '';
    if(type === 'Primary Weapon') path = '<path d="M5 12h14M12 5l7 7-7 7"/>';
    else if(type === 'Secondary Weapon') path = '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>';
    else if(type === 'Hull') path = '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>';
    else if(type === 'Shields') path = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>';
    else if(type === 'Engine') path = '<path d="M12 2c0 0-6 8-6 14a6 6 0 0 0 12 0c0-6-6-14-6-14z"/><path d="M12 12c0 0-2 3-2 6a2 2 0 0 0 4 0c0-3-2-6-2-6z"/>';
    else if(type === 'Reactor') path = '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="3" transform="rotate(45 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="3" transform="rotate(-45 12 12)"/>';
    else if(type === 'Fuel') path = '<rect x="7" y="6" width="10" height="15" rx="2"/><path d="M10 2h4v4h-4z"/><line x1="12" y1="10" x2="12" y2="17"/>';
    else if(type === 'BossSkull') path = '<path d="M12 2C6.477 2 2 6.477 2 12v4c0 2.21 1.79 4 4 4h2v2h8v-2h2c2.21 0 4-1.79 4-4v-4c0-5.523-4.477-10-10-10zM9 12c-.552 0-1 .448-1 1s.448 1 1 1 1-.448 1-1-.448-1-1-1zm6 0c-.552 0-1 .448-1 1s.448 1 1 1 1-.448 1-1-.448-1-1-1z"/>';
    else if(type === 'Upgrade Material') path = '<polygon points="12 2 22 12 12 22 2 12"/>';
    else path = '<polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>'; // Resource
    
    let rawSvg = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${path}</svg>`;
    
    // Properly encode for Canvas Image src
    let encodedSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rawSvg);
    let img = new Image();
    img.src = encodedSvg;
    
    SVG_CACHE[key] = { img: img, raw: rawSvg };
    return SVG_CACHE[key];
}

/** ==========================================
 * ENTITIES & MANAGERS
 * ========================================== */
var entities = [];
var particles = [];
var projectiles = [];
var drops = [];
var floatingTexts = [];
var xpOrbs = [];
var hpOrbs = [];
var shockwaves = [];
var warpTrails = [];
var mycelialLoops = [];

const HP_ORB_DROP_RATE = 0.08;