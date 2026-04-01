import * as THREE from 'three';
import { SimplexNoise } from 'simplex-noise';

// --- KONFIGURASI DASAR ---
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const PLAYER_HEIGHT = 1.6;
const CHUNK_SIZE = 16;

// Default render distance diatur ke 2 sesuai permintaan
let RENDER_DISTANCE = 2;
let gameActive = false;
let worldGenerated = false;
let worldSeedOffset = 0; 

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, (RENDER_DISTANCE - 1) * CHUNK_SIZE, RENDER_DISTANCE * CHUNK_SIZE);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// ==========================================
// --- PRNG (Pseudo-Random) & SEED SYSTEM ---
// ==========================================
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        let char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
}

function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

let seededRandom = Math.random;
let simplex = new SimplexNoise(seededRandom);

function pseudoRandom(x, z) {
    let h = Math.sin((x + worldSeedOffset) * 12.9898 + (z + worldSeedOffset) * 78.233) * 43758.5453123;
    return h - Math.floor(h);
}

// ==========================================
// --- PENCAHAYAAN ---
// ==========================================
const ambLight = new THREE.AmbientLight(0xffffff, 0.7); scene.add(ambLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9); dirLight.position.set(50, 100, 50); scene.add(dirLight);

// ==========================================
// --- MANAJER UI MENU & PAUSE ---
// ==========================================
const uiLayer = document.getElementById('ui-layer');
const bgDirt = document.getElementById('bg-dirt');
const bgDark = document.getElementById('bg-dark');

const menuHome = document.getElementById('menu-home');
const menuPlay = document.getElementById('menu-play');
const menuOptions = document.getElementById('menu-options');
const menuPause = document.getElementById('menu-pause');

const crosshair = document.getElementById('crosshair');
const coordsUI = document.getElementById('coords');

let optionsReturnTarget = menuHome; 

if(document.getElementById('seed-input')) document.getElementById('seed-input').value = Math.random().toString(36).substring(2, 10);

function switchMenu(hideElem, showElem) {
    hideElem.classList.add('hidden');
    showElem.classList.remove('hidden');
}

document.getElementById('btn-play')?.addEventListener('click', () => switchMenu(menuHome, menuPlay));
document.getElementById('btn-back-play')?.addEventListener('click', () => switchMenu(menuPlay, menuHome));
document.getElementById('btn-opt-main')?.addEventListener('click', () => { optionsReturnTarget = menuHome; switchMenu(menuHome, menuOptions); });
document.getElementById('btn-opt-pause')?.addEventListener('click', () => { optionsReturnTarget = menuPause; switchMenu(menuPause, menuOptions); });
document.getElementById('btn-back-options')?.addEventListener('click', () => switchMenu(menuOptions, optionsReturnTarget));

document.getElementById('opt-fov')?.addEventListener('input', (e) => { camera.fov = parseInt(e.target.value); camera.updateProjectionMatrix(); document.getElementById('val-fov').innerText = e.target.value; });
document.getElementById('opt-bright')?.addEventListener('input', (e) => { const val = parseInt(e.target.value) / 100; dirLight.intensity = 0.9 * val; ambLight.intensity = 0.7 * val; document.getElementById('val-bright').innerText = e.target.value; });
document.getElementById('opt-dist')?.addEventListener('input', (e) => {
    RENDER_DISTANCE = parseInt(e.target.value);
    document.getElementById('val-dist').innerText = RENDER_DISTANCE;
    if (worldGenerated) {
        scene.fog.near = (RENDER_DISTANCE - 1) * CHUNK_SIZE;
        scene.fog.far = RENDER_DISTANCE * CHUNK_SIZE;
        updateChunks(true);
    }
});

document.getElementById('btn-new-game')?.addEventListener('click', () => {
    let seedStr = document.getElementById('seed-input').value.trim();
    if (seedStr === "") seedStr = Math.random().toString(36).substring(2, 10);
    
    const seedNum = hashCode(seedStr);
    seededRandom = mulberry32(seedNum);
    simplex = new SimplexNoise(seededRandom);
    worldSeedOffset = Math.abs(seedNum % 10000);

    chunks.forEach(c => c.dispose()); chunks.clear(); chunkQueue.length = 0; waterUpdateQueue.clear();
    lastChunkX = null; lastChunkZ = null;
    
    const startY = getElevation(0, 0) + 10;
    yawObject.position.set(0, startY, 0);
    velocity.set(0, 0, 0);

    scene.fog.near = (RENDER_DISTANCE - 1) * CHUNK_SIZE;
    scene.fog.far = RENDER_DISTANCE * CHUNK_SIZE;

    worldGenerated = true;
    updateChunks(true); 
    resumeGame();
});

document.getElementById('btn-quit')?.addEventListener('click', () => {
    worldGenerated = false; gameActive = false;
    chunks.forEach(c => c.dispose()); chunks.clear(); chunkQueue.length = 0; waterUpdateQueue.clear();
    
    crosshair.style.display = 'none'; coordsUI.style.display = 'none'; document.getElementById('hotbar').style.display = 'none';
    if (isTouchDevice) { document.getElementById('dpad').style.display = 'none'; document.getElementById('jump-btn').style.display = 'none'; }

    uiLayer.classList.remove('pointer-none'); bgDirt.classList.remove('hidden'); bgDark.classList.add('hidden');
    menuPause.classList.add('hidden'); menuHome.classList.remove('hidden');
});

const inventory = ['stone', 'dirt', 'grass', 'wood', 'leaves', 'water_5'];
const blockColors = ['#888888', '#8B4513', '#228B22', '#654321', '#006400', '#2A52BE'];
let selectedSlot = 0;

const hotbarUI = document.createElement('div');
hotbarUI.id = 'hotbar';
hotbarUI.style.cssText = 'position:absolute; bottom:20px; left:50%; transform:translateX(-50%); display:none; gap:8px; z-index:100; padding:8px; background:rgba(0,0,0,0.6); border-radius:8px; pointer-events:auto;';
document.body.appendChild(hotbarUI);

inventory.forEach((item, index) => {
    const slot = document.createElement('div');
    slot.id = `slot-${index}`;
    const bgImage = item.startsWith('water') ? '' : `background-image:url('textures/${item}.png'); background-size:cover;`;
    slot.style.cssText = `width:46px; height:46px; border:3px solid ${index === 0 ? 'white' : '#555'}; border-radius:5px; background-color:${blockColors[index]}; ${bgImage} display:flex; align-items:flex-start; justify-content:flex-start; padding:4px; font-family:sans-serif; color:white; font-size:14px; font-weight:bold; text-shadow:1px 1px 0 #000; box-sizing:border-box; cursor:pointer; touch-action:none;`;
    slot.innerText = index + 1;
    
    slot.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); selectedSlot = index; updateHotbarUI(); });
    hotbarUI.appendChild(slot);
});

function updateHotbarUI() { inventory.forEach((_, index) => { document.getElementById(`slot-${index}`).style.borderColor = (index === selectedSlot) ? 'white' : '#555'; }); }
document.addEventListener('wheel', (e) => { if (!gameActive) return; selectedSlot += Math.sign(e.deltaY); if (selectedSlot < 0) selectedSlot = inventory.length - 1; if (selectedSlot >= inventory.length) selectedSlot = 0; updateHotbarUI(); });
document.addEventListener('keydown', (e) => { if (e.key >= '1' && e.key <= '6') { selectedSlot = parseInt(e.key) - 1; updateHotbarUI(); } });

// ==========================================
// --- KAMERA & STATE KONTROL ---
// ==========================================
const yawObject = new THREE.Object3D(); scene.add(yawObject);
const pitchObject = new THREE.Object3D(); yawObject.add(pitchObject); pitchObject.add(camera);

let headBobTimer = 0; const BOB_FREQ = 14.0, BOB_AMP_Y = 0.08, BOB_AMP_X = 0.04; const PI_2 = Math.PI / 2;

function resumeGame() {
    gameActive = true;
    uiLayer.classList.add('pointer-none'); bgDirt.classList.add('hidden'); bgDark.classList.add('hidden');
    menuPlay.classList.add('hidden'); menuHome.classList.add('hidden'); menuPause.classList.add('hidden');
    
    crosshair.style.display = 'block'; coordsUI.style.display = 'block'; hotbarUI.style.display = 'flex';
    if (isTouchDevice) { document.getElementById('dpad').style.display = 'grid'; document.getElementById('jump-btn').style.display = 'flex'; } 
    else { document.body.requestPointerLock(); }
}

function pauseGame() {
    if(!worldGenerated) return; gameActive = false;
    uiLayer.classList.remove('pointer-none'); bgDark.classList.remove('hidden'); menuPause.classList.remove('hidden');
    crosshair.style.display = 'none';
    if (isTouchDevice) { document.getElementById('dpad').style.display = 'none'; document.getElementById('jump-btn').style.display = 'none'; }
}

document.getElementById('btn-resume')?.addEventListener('click', resumeGame);
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== document.body && worldGenerated && gameActive) pauseGame(); });

document.addEventListener('mousemove', (e) => {
    if (gameActive && !isTouchDevice) {
        yawObject.rotation.y -= e.movementX * 0.002; pitchObject.rotation.x -= e.movementY * 0.002;
        pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, pitchObject.rotation.x));
    }
});

let cameraTouchId = null; let lastTouchX = 0, lastTouchY = 0; let interactTouchId = null; let interactTimer = null; let isHolding = false;

document.addEventListener('touchstart', (e) => {
    if (!gameActive) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.target.closest('.mobile-controls') || touch.target.closest('#hotbar')) continue; 
        if (touch.pageX > window.innerWidth / 2 && cameraTouchId === null) { cameraTouchId = touch.identifier; lastTouchX = touch.pageX; lastTouchY = touch.pageY; }
        if (interactTouchId === null) { interactTouchId = touch.identifier; isHolding = false; interactTimer = setTimeout(() => { isHolding = true; handleBlockInteraction(0); }, 500); }
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (!gameActive) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === cameraTouchId) {
            e.preventDefault(); yawObject.rotation.y -= (touch.pageX - lastTouchX) * 0.005; pitchObject.rotation.x -= (touch.pageY - lastTouchY) * 0.005; 
            pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, pitchObject.rotation.x)); lastTouchX = touch.pageX; lastTouchY = touch.pageY;
        }
        if (touch.identifier === interactTouchId) { clearTimeout(interactTimer); interactTouchId = null; }
    }
}, { passive: false });

document.addEventListener('touchend', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === cameraTouchId) cameraTouchId = null;
        if (touch.identifier === interactTouchId) { clearTimeout(interactTimer); if (!isHolding) handleBlockInteraction(2); interactTouchId = null; isHolding = false; }
    }
});

let moveState = { forward: false, backward: false, left: false, right: false }; let canJump = false;
const velocity = new THREE.Vector3(); const direction = new THREE.Vector3();
const setJump = () => { if (canJump) { velocity.y = 9.5; canJump = false; } };

document.addEventListener('keydown', (e) => {
    switch (e.code) { case 'KeyW': moveState.forward = true; break; case 'KeyS': moveState.backward = true; break; case 'KeyA': moveState.left = true; break; case 'KeyD': moveState.right = true; break; case 'Space': setJump(); break; case 'Escape': if(worldGenerated && !isTouchDevice && gameActive) pauseGame(); break; }
});
document.addEventListener('keyup', (e) => {
    switch (e.code) { case 'KeyW': moveState.forward = false; break; case 'KeyS': moveState.backward = false; break; case 'KeyA': moveState.left = false; break; case 'KeyD': moveState.right = false; break; }
});

if (isTouchDevice) {
    const bindBtn = (id, key) => { const btn = document.getElementById(id); if(!btn) return; btn.addEventListener('touchstart', (e) => { e.preventDefault(); moveState[key] = true; }); btn.addEventListener('touchend', (e) => { e.preventDefault(); moveState[key] = false; }); };
    bindBtn('btn-up', 'forward'); bindBtn('btn-down', 'backward'); bindBtn('btn-left', 'left'); bindBtn('btn-right', 'right');
    document.getElementById('jump-btn')?.addEventListener('touchstart', (e) => { e.preventDefault(); setJump(); });
}

// ==========================================
// --- TEKSTUR & MATERIAL ---
// ==========================================
const textureLoader = new THREE.TextureLoader();
function loadTex(url) { const tex = textureLoader.load(url); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; return tex; }
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

const mats = {
    stone: new THREE.MeshLambertMaterial({ map: loadTex('textures/stone.png') }),
    dirt: new THREE.MeshLambertMaterial({ map: loadTex('textures/dirt.png') }),
    grass: new THREE.MeshLambertMaterial({ map: loadTex('textures/grass.png') }),
    wood: new THREE.MeshLambertMaterial({ map: loadTex('textures/wood.png') }),
    leaves: new THREE.MeshLambertMaterial({ map: loadTex('textures/leaves.png'), transparent: true, alphaTest: 0.5 })
};

// Material Water Custom Geometry
const waterMat = new THREE.MeshLambertMaterial({ color: 0x2A52BE, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });

function isSolidBlock(type) { return type && !type.startsWith('water'); }
function isWaterBlock(type) { return type && type.startsWith('water'); }
function getWaterLevel(type) { if(!isWaterBlock(type)) return 0; return parseInt(type.split('_')[1]) || 0; }

function blockIntersectsPlayer(blockX, blockY, blockZ) {
    const pad = 0.3; const playerMinY = yawObject.position.y - PLAYER_HEIGHT; const playerMaxY = playerMinY + 1.8; 
    const blockMinX = blockX - 0.5; const blockMaxX = blockX + 0.5; const blockMinY = blockY - 0.5; const blockMaxY = blockY + 0.5; const blockMinZ = blockZ - 0.5; const blockMaxZ = blockZ + 0.5;
    return ( blockMinX < yawObject.position.x + pad && blockMaxX > yawObject.position.x - pad && blockMinY < playerMaxY && blockMaxY > playerMinY && blockMinZ < yawObject.position.z + pad && blockMaxZ > yawObject.position.z - pad );
}

// ==========================================
// --- SISTEM PARTIKEL & VOXEL CHUNK ---
// ==========================================
const particles = []; const particleGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
function spawnParticles(x, y, z, type) {
    if (isWaterBlock(type)) return;
    const mat = mats[type];
    for (let i = 0; i < 15; i++) {
        const p = new THREE.Mesh(particleGeo, mat);
        p.position.set(x + (Math.random() - 0.5)*0.5, y + (Math.random() - 0.5)*0.5, z + (Math.random() - 0.5)*0.5);
        p.userData = { vel: new THREE.Vector3((Math.random() - 0.5)*5, Math.random()*5 + 2, (Math.random() - 0.5)*5), life: 1.0 };
        scene.add(p); particles.push(p);
    }
}

const chunks = new Map(); let chunkQueue = []; const raycastMeshes = [];
let waterUpdateQueue = new Set();

function getBlockGlobal(x, y, z) {
    const chunk = chunks.get(`${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`);
    return chunk ? chunk.blocks.get(`${x},${y},${z}`) : null;
}
function setBlockGlobal(x, y, z, type) {
    const chunk = chunks.get(`${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`);
    if (chunk) { if (type) chunk.blocks.set(`${x},${y},${z}`, type); else chunk.blocks.delete(`${x},${y},${z}`); chunk.needsUpdate = true; }
}

function getElevation(x, z) {
    let e = 1.00 * simplex.noise2D(x * 0.003, z * 0.003) + 0.50 * simplex.noise2D(x * 0.01, z * 0.01) + 0.25 * simplex.noise2D(x * 0.03, z * 0.03);
    e = e / 1.75; return Math.floor(Math.sign(e) * Math.pow(Math.abs(e), 1.8) * 35);
}

class Chunk {
    constructor(cx, cz) {
        this.cx = cx; this.cz = cz; this.meshes = []; this.waterMesh = null; this.blocks = new Map(); this.needsUpdate = false;
        this.generateData(); this.buildMeshes();
    }
    generateData() {
        const WATER_LEVEL = -5; const BOTTOM_LIMIT = -40;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const worldX = this.cx * CHUNK_SIZE + lx; const worldZ = this.cz * CHUNK_SIZE + lz;
                const surfaceY = getElevation(worldX, worldZ);
                for (let y = BOTTOM_LIMIT; y <= Math.max(surfaceY, WATER_LEVEL); y++) {
                    if (y <= surfaceY) {
                        if (y > BOTTOM_LIMIT + 5 && simplex.noise3D(worldX * 0.04, y * 0.04, worldZ * 0.04) > 0.35) continue;
                        let type = 'stone'; if (y === surfaceY) type = (y >= WATER_LEVEL) ? 'grass' : 'dirt'; else if (y > surfaceY - 3) type = 'dirt';
                        this.blocks.set(`${worldX},${y},${worldZ}`, type);
                    } else if (y <= WATER_LEVEL) {
                        this.blocks.set(`${worldX},${y},${worldZ}`, 'water_5');
                        waterUpdateQueue.add(`${worldX},${y},${worldZ}`);
                    }
                }
                if (surfaceY >= WATER_LEVEL && pseudoRandom(worldX, worldZ) < 0.015) {
                    if (this.blocks.has(`${worldX},${surfaceY},${worldZ}`)) {
                        const th = Math.floor(pseudoRandom(worldX + 1, worldZ) * 3) + 4;
                        for (let ty = 1; ty <= th; ty++) this.blocks.set(`${worldX},${surfaceY + ty},${worldZ}`, 'wood');
                        for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
                            if (Math.abs(dx) === 1 && Math.abs(dz) === 1 && dy === 1) continue; if (dx === 0 && dz === 0 && dy === 0) continue;
                            this.blocks.set(`${worldX + dx},${surfaceY + th + dy},${worldZ + dz}`, 'leaves');
                        }
                    }
                }
            }
        }
    }
    buildMeshes() {
        this.meshes.forEach(mesh => { scene.remove(mesh); const idx = raycastMeshes.indexOf(mesh); if (idx > -1) raycastMeshes.splice(idx, 1); });
        if (this.waterMesh) { scene.remove(this.waterMesh); this.waterMesh.geometry.dispose(); this.waterMesh = null; }
        this.meshes = [];
        
        const counts = { stone: 0, dirt: 0, grass: 0, wood: 0, leaves: 0 };
        const exposedBlocks = [];
        
        const wPos = []; const wIdx = []; let wV = 0;
        const addFace = (p1, p2, p3, p4) => { wPos.push(...p1, ...p2, ...p3, ...p4); wIdx.push(wV, wV+1, wV+2, wV, wV+2, wV+3); wV += 4; };

        for (const [key, type] of this.blocks.entries()) {
            const [x, y, z] = key.split(',').map(Number);
            
            if (isWaterBlock(type)) {
                let topType = getBlockGlobal(x, y+1, z) || this.blocks.get(`${x},${y+1},${z}`);
                let botType = getBlockGlobal(x, y-1, z) || this.blocks.get(`${x},${y-1},${z}`);
                let north = getBlockGlobal(x, y, z-1) || this.blocks.get(`${x},${y},${z-1}`);
                let south = getBlockGlobal(x, y, z+1) || this.blocks.get(`${x},${y},${z+1}`);
                let east = getBlockGlobal(x+1, y, z) || this.blocks.get(`${x+1},${y},${z}`);
                let west = getBlockGlobal(x-1, y, z) || this.blocks.get(`${x-1},${y},${z}`);

                let hw = 0.5; let cx = x, cy = y - hw, cz = z;

                // --- KALKULASI AIR MIRING (SLANTED WATER) ---
                const getWHeight = (bx, by, bz) => {
                    let t = getBlockGlobal(bx, by, bz) || this.blocks.get(`${bx},${by},${bz}`);
                    if (!t || isSolidBlock(t)) return 0; 
                    let tAbove = getBlockGlobal(bx, by+1, bz) || this.blocks.get(`${bx},${by+1},${bz}`);
                    if (isWaterBlock(tAbove)) return 1.0; 
                    let l = getWaterLevel(t);
                    return (l === 5) ? 0.9 : (l / 5.0) * 0.8;
                };

                const getCornerH = (dx, dz) => {
                    let sum = 0, count = 0;
                    // Ambil rata-rata tinggi dari 4 blok yang mengelilingi sudut ini
                    [[x, z], [x+dx, z], [x, z+dz], [x+dx, z+dz]].forEach(b => {
                        let h = getWHeight(b[0], y, b[1]);
                        if (h > 0) { sum += h; count++; }
                    });
                    return count > 0 ? sum / count : 0.05;
                };

                let hNW = getCornerH(-1, -1);
                let hNE = getCornerH(1, -1);
                let hSE = getCornerH(1, 1);
                let hSW = getCornerH(-1, 1);

                // Jika ada air di atasnya, sudut ditarik penuh (1.0) agar tidak bolong
                if (isWaterBlock(topType)) { hNW = 1.0; hNE = 1.0; hSE = 1.0; hSW = 1.0; }

                // Pemasangan Face dengan Corner dinamis
                if (!isWaterBlock(topType)) 
                    addFace([cx-hw, cy+hNW, cz-hw], [cx+hw, cy+hNE, cz-hw], [cx+hw, cy+hSE, cz+hw], [cx-hw, cy+hSW, cz+hw]); // Atas
                if (!isWaterBlock(botType) && !isSolidBlock(botType)) 
                    addFace([cx-hw, cy, cz-hw], [cx+hw, cy, cz-hw], [cx+hw, cy, cz+hw], [cx-hw, cy, cz+hw]); // Bawah
                if (!isWaterBlock(north) && !isSolidBlock(north)) 
                    addFace([cx-hw, cy, cz-hw], [cx+hw, cy, cz-hw], [cx+hw, cy+hNE, cz-hw], [cx-hw, cy+hNW, cz-hw]); // Utara
                if (!isWaterBlock(south) && !isSolidBlock(south)) 
                    addFace([cx-hw, cy, cz+hw], [cx+hw, cy, cz+hw], [cx+hw, cy+hSE, cz+hw], [cx-hw, cy+hSW, cz+hw]); // Selatan
                if (!isWaterBlock(east) && !isSolidBlock(east)) 
                    addFace([cx+hw, cy, cz-hw], [cx+hw, cy, cz+hw], [cx+hw, cy+hSE, cz+hw], [cx+hw, cy+hNE, cz-hw]); // Timur
                if (!isWaterBlock(west) && !isSolidBlock(west)) 
                    addFace([cx-hw, cy, cz-hw], [cx-hw, cy, cz+hw], [cx-hw, cy+hSW, cz+hw], [cx-hw, cy+hNW, cz-hw]); // Barat

            } else {
                const neighbors = [
                    this.blocks.get(`${x+1},${y},${z}`), this.blocks.get(`${x-1},${y},${z}`),
                    this.blocks.get(`${x},${y+1},${z}`), this.blocks.get(`${x},${y-1},${z}`),
                    this.blocks.get(`${x},${y},${z+1}`), this.blocks.get(`${x},${y},${z-1}`)
                ];
                let isExposed = false;
                for (let n of neighbors) { if (!n || isWaterBlock(n) || n === 'leaves') { isExposed = true; break; } }
                if (isExposed) { counts[type]++; exposedBlocks.push({ type, pos: [x, y, z] }); }
            }
        }

        const dummy = new THREE.Object3D(); const indices = { stone: 0, dirt: 0, grass: 0, wood: 0, leaves: 0 };
        for (const matKey of Object.keys(counts)) {
            if (counts[matKey] === 0) continue;
            const mesh = new THREE.InstancedMesh(boxGeo, mats[matKey], counts[matKey]);
            mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage); this.meshes.push(mesh); scene.add(mesh); raycastMeshes.push(mesh);
        }
        for (const b of exposedBlocks) {
            dummy.position.set(...b.pos); dummy.updateMatrix();
            this.meshes.find(m => m.material === mats[b.type]).setMatrixAt(indices[b.type]++, dummy.matrix);
        }
        this.meshes.forEach(mesh => mesh.instanceMatrix.needsUpdate = true);

        if (wPos.length > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
            geo.setIndex(wIdx); geo.computeVertexNormals();
            this.waterMesh = new THREE.Mesh(geo, waterMat);
            scene.add(this.waterMesh);
        }
        this.needsUpdate = false;
    }
    
    dispose() {
        this.meshes.forEach(mesh => { scene.remove(mesh); const idx = raycastMeshes.indexOf(mesh); if (idx > -1) raycastMeshes.splice(idx, 1); });
        if (this.waterMesh) { scene.remove(this.waterMesh); this.waterMesh.geometry.dispose(); }
        this.blocks.clear();
    }
}

// ==========================================
// --- SISTEM WATER TICK DARI KODE SEBELUMNYA ---
// ==========================================
// ==========================================
// --- SISTEM WATER TICK (OPTIMASI JATUH) ---
// ==========================================
let lastWaterTick = 0;
function tickWater(time) {
    if (time - lastWaterTick < 250) return; 
    lastWaterTick = time;
    if (waterUpdateQueue.size === 0) return;

    const nextQueue = new Set();
    let updatesThisTick = 0;
    
    for (const key of waterUpdateQueue) {
        if (updatesThisTick > 40) { nextQueue.add(key); continue; } 
        
        const [x, y, z] = key.split(',').map(Number);
        const type = getBlockGlobal(x, y, z);
        if (!isWaterBlock(type)) continue;

        let level = getWaterLevel(type);
        const belowType = getBlockGlobal(x, y - 1, z);

        // LOGIKA JATUH (VERTIKAL)
        if (!belowType || !isSolidBlock(belowType)) { 
            if (y - 1 >= -40) {
                // PERBAIKAN: Air yang jatuh akan berkurang levelnya.
                // Jika level 5 jatuh, ia jadi level 4, 3, 2, 1 lalu lenyap.
                // Ini OTOMATIS membatasi air hanya jatuh maksimal 4 blok jarak!
                if (level > 1) { 
                    const fallLevel = `water_${level - 1}`;
                    const existingBelow = getBlockGlobal(x, y - 1, z);
                    
                    if (!existingBelow || (isWaterBlock(existingBelow) && getWaterLevel(existingBelow) < level - 1)) {
                        setBlockGlobal(x, y - 1, z, fallLevel); 
                        nextQueue.add(`${x},${y-1},${z}`);
                        updatesThisTick++;
                    }
                }
            }
        } 
        // LOGIKA MENYEBAR (HORIZONTAL)
        else if (isSolidBlock(belowType)) {
            if (level > 1) { 
                const spreadLevel = `water_${level - 1}`;
                const neighbors = [[1,0,0], [-1,0,0], [0,0,1], [0,0,-1]];
                for (const offset of neighbors) {
                    const nx = x + offset[0], nz = z + offset[2];
                    const nType = getBlockGlobal(nx, y, nz);
                    if (!nType || (isWaterBlock(nType) && getWaterLevel(nType) < level - 1)) {
                        setBlockGlobal(nx, y, nz, spreadLevel);
                        nextQueue.add(`${nx},${y},${nz}`);
                        updatesThisTick++;
                    }
                }
            }
        }
    }
    waterUpdateQueue = nextQueue;
}
let lastChunkX = null, lastChunkZ = null;
function updateChunks(force = false) {
    if(!worldGenerated) return; 
    const cx = Math.floor(yawObject.position.x / CHUNK_SIZE); const cz = Math.floor(yawObject.position.z / CHUNK_SIZE);
    if (!force && cx === lastChunkX && cz === lastChunkZ) return;
    lastChunkX = cx; lastChunkZ = cz; const keep = new Set();
    
    for (let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
        for (let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
            if (x*x + z*z > RENDER_DISTANCE*RENDER_DISTANCE) continue;
            const key = `${cx + x},${cz + z}`; keep.add(key);
            if (!chunks.has(key) && !chunkQueue.some(q => q.key === key)) chunkQueue.push({ cx: cx+x, cz: cz+z, key });
        }
    }
    for (const [key, chunk] of chunks.entries()) {
        if (!keep.has(key)) { chunk.dispose(); chunks.delete(key); }
    }
}

// --- SELEKSI & INTERAKSI BLOK ---
const selectionOutline = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2, transparent: true, opacity: 0.5 }));
selectionOutline.visible = false; scene.add(selectionOutline);
const raycaster = new THREE.Raycaster(); raycaster.far = 5;
const centerScreenVec = new THREE.Vector2(0, 0); const hitMatrix = new THREE.Matrix4(); const hitPosition = new THREE.Vector3();

function updateBlockSelection() {
    if (!gameActive) { selectionOutline.visible = false; return; }
    raycaster.setFromCamera(centerScreenVec, camera);
    const intersects = raycaster.intersectObjects(raycastMeshes, false);
    if (intersects.length > 0) {
        intersects[0].object.getMatrixAt(intersects[0].instanceId, hitMatrix); hitPosition.setFromMatrixPosition(hitMatrix);
        selectionOutline.position.copy(hitPosition); selectionOutline.scale.set(1.002, 1.002, 1.002); selectionOutline.visible = true;
    } else selectionOutline.visible = false;
}

document.addEventListener('contextmenu', e => e.preventDefault());
function handleBlockInteraction(buttonType) {
    if (!gameActive || !selectionOutline.visible) return;
    const px = Math.round(selectionOutline.position.x); const py = Math.round(selectionOutline.position.y); const pz = Math.round(selectionOutline.position.z);
    const type = getBlockGlobal(px, py, pz);

    if (buttonType === 0 && type && !isWaterBlock(type)) {
        setBlockGlobal(px, py, pz, null); 
        spawnParticles(px, py, pz, type); selectionOutline.visible = false;
        waterUpdateQueue.add(`${px+1},${py},${pz}`); waterUpdateQueue.add(`${px-1},${py},${pz}`);
        waterUpdateQueue.add(`${px},${py+1},${pz}`); waterUpdateQueue.add(`${px},${py},${pz+1}`); waterUpdateQueue.add(`${px},${py},${pz-1}`);
    } else if (buttonType === 2) {
        const intersects = raycaster.intersectObjects(raycastMeshes, false);
        if (intersects.length > 0 && intersects[0].face) {
            const normal = intersects[0].face.normal;
            const placeX = px + Math.round(normal.x); const placeY = py + Math.round(normal.y); const placeZ = pz + Math.round(normal.z);
            if (blockIntersectsPlayer(placeX, placeY, placeZ)) return;
            
            const existing = getBlockGlobal(placeX, placeY, placeZ);
            if (existing && !isWaterBlock(existing)) return;
            
            const blockToPlace = inventory[selectedSlot];
            setBlockGlobal(placeX, placeY, placeZ, blockToPlace);
            if (isWaterBlock(blockToPlace)) waterUpdateQueue.add(`${placeX},${placeY},${placeZ}`); 
        }
    }
}
document.addEventListener('mousedown', (e) => { if(!isTouchDevice) handleBlockInteraction(e.button); });

// --- FISIKA & ANIMASI ---
function checkCollision(nx, ny, nz) {
    const pad = 0.3; const minX = Math.floor(nx - pad + 0.5); const maxX = Math.floor(nx + pad + 0.5);
    const minZ = Math.floor(nz - pad + 0.5); const maxZ = Math.floor(nz + pad + 0.5);
    const minY = Math.floor(ny - PLAYER_HEIGHT + 0.2 + 0.5); const maxY = Math.floor(ny + 0.2 + 0.5);
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) {
        if (isSolidBlock(getBlockGlobal(x, y, z))) return true;
    }
    return false;
}
function checkFloor(nx, ny, nz) {
    const pad = 0.3; const minX = Math.floor(nx - pad + 0.5); const maxX = Math.floor(nx + pad + 0.5);
    const minZ = Math.floor(nz - pad + 0.5); const maxZ = Math.floor(nz + pad + 0.5);
    const blockY = Math.floor(ny - PLAYER_HEIGHT + 0.5);
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        if (isSolidBlock(getBlockGlobal(x, blockY, z))) return blockY;
    }
    return null;
}

let prevTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now(); 
    
    if (worldGenerated) {
        if (chunkQueue.length > 0) {
            const item = chunkQueue.shift();
            if (!chunks.has(item.key)) chunks.set(item.key, new Chunk(item.cx, item.cz));
        }
        
        tickWater(time);
        
        let chunksUpdated = 0;
        chunks.forEach(chunk => { 
            if(chunk.needsUpdate && chunksUpdated < 2) { 
                chunk.buildMeshes(); 
                chunksUpdated++; 
            } 
        });
    }

    if (!gameActive) { prevTime = performance.now(); renderer.render(scene, camera); return; }

    const delta = Math.min((time - prevTime) / 1000, 0.1);

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.position.addScaledVector(p.userData.vel, delta); p.userData.vel.y -= 20 * delta;
        p.scale.setScalar(p.userData.life); p.userData.life -= delta * 1.5;
        if (p.userData.life <= 0) { scene.remove(p); particles.splice(i, 1); }
    }

    if(worldGenerated) updateChunks();

    if (yawObject.position.y < -50) { 
        yawObject.position.set(0, getElevation(0, 0) + 10, 0); 
        velocity.set(0, 0, 0); 
    }
    coordsUI.innerText = `X: ${Math.floor(yawObject.position.x)} | Y: ${Math.floor(yawObject.position.y)} | Z: ${Math.floor(yawObject.position.z)}`;

    const moveX = Number(moveState.right) - Number(moveState.left); const moveZ = Number(moveState.backward) - Number(moveState.forward);
    direction.set(moveX, 0, moveZ).normalize(); direction.applyEuler(new THREE.Euler(0, yawObject.rotation.y, 0));

    const inWater = isWaterBlock(getBlockGlobal(Math.floor(yawObject.position.x), Math.floor(yawObject.position.y), Math.floor(yawObject.position.z)));
    const speed = inWater ? 3.5 : 7.0;

    if (moveState.forward || moveState.backward || moveState.left || moveState.right) { velocity.x = direction.x * speed; velocity.z = direction.z * speed; } 
    else { velocity.x = 0; velocity.z = 0; }

    const py = yawObject.position.y; let nextX = yawObject.position.x + velocity.x * delta; let nextZ = yawObject.position.z + velocity.z * delta;

    if (checkCollision(nextX, py, yawObject.position.z)) {
        if (canJump && !checkCollision(nextX, py + 1.1, yawObject.position.z)) { velocity.y = 9.5; canJump = false; }
        velocity.x = 0; nextX = yawObject.position.x;
    } yawObject.position.x = nextX;

    if (checkCollision(yawObject.position.x, py, nextZ)) {
        if (canJump && !checkCollision(yawObject.position.x, py + 1.1, nextZ)) { velocity.y = 9.5; canJump = false; }
        velocity.z = 0; nextZ = yawObject.position.z;
    } yawObject.position.z = nextZ;

    if (inWater) {
        velocity.y -= 5.0 * delta; if (velocity.y < -3) velocity.y = -3;
        if (moveState.forward && moveState.backward === false) velocity.y += 10.0 * delta;
    } else velocity.y -= 30.0 * delta;

    let nextY = yawObject.position.y + velocity.y * delta;
    if (velocity.y > 0) {
        if (checkCollision(yawObject.position.x, nextY, yawObject.position.z)) { velocity.y = 0; nextY = yawObject.position.y; }
    } else if (velocity.y < 0) {
        const floorY = checkFloor(yawObject.position.x, nextY, yawObject.position.z);
        if (floorY !== null) {
            const landingHeight = floorY + 0.5 + PLAYER_HEIGHT;
            if (nextY <= landingHeight) { velocity.y = 0; nextY = landingHeight; canJump = true; }
        } else canJump = inWater;
    }
    yawObject.position.y = nextY;

    const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    let targetBobY = 0, targetBobX = 0;
    if (horizontalSpeed > 0.1 && canJump && !inWater) {
        headBobTimer += delta * BOB_FREQ;
        targetBobY = Math.sin(headBobTimer) * BOB_AMP_Y; targetBobX = Math.cos(headBobTimer * 0.5) * BOB_AMP_X;
    }
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetBobY, delta * 10.0);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetBobX, delta * 10.0);

    updateBlockSelection();
    prevTime = time; renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
