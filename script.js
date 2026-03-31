import * as THREE from 'three';
import { SimplexNoise } from 'simplex-noise';

// --- KONFIGURASI DASAR ---
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const PLAYER_HEIGHT = 1.6;
const CHUNK_SIZE = 16;

let RENDER_DISTANCE = 4;
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
// Mengkonversi string menjadi angka integer 32-bit
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        let char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
}

// Algoritma Mulberry32 untuk PRNG (agar SimplexNoise konsisten berdasarkan Seed)
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

// Fungsi Random khusus untuk posisi Pohon dll
function pseudoRandom(x, z) {
    let h = Math.sin((x + worldSeedOffset) * 12.9898 + (z + worldSeedOffset) * 78.233) * 43758.5453123;
    return h - Math.floor(h);
}

// ==========================================
// --- PENCAHAYAAN ---
// ==========================================
const ambLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(50, 100, 50);
scene.add(dirLight);

// ==========================================
// --- UI LOGIC (MAIN MENU & OPTIONS) ---
// ==========================================
const menuContainer = document.getElementById('main-menu-container');
const menuHome = document.getElementById('menu-home');
const menuPlay = document.getElementById('menu-play');
const menuOptions = document.getElementById('menu-options');
const pauseUI = document.getElementById('pause-ui');
const crosshair = document.getElementById('crosshair');
const coordsUI = document.getElementById('coords');
const hotbarUI = document.createElement('div');

// Set Random Seed placeholder
document.getElementById('seed-input').value = Math.random().toString(36).substring(2, 10);

function switchMenu(hideElem, showElem) {
    hideElem.classList.add('hidden');
    showElem.classList.remove('hidden');
}

document.getElementById('btn-play').addEventListener('click', () => switchMenu(menuHome, menuPlay));
document.getElementById('btn-options').addEventListener('click', () => switchMenu(menuHome, menuOptions));
document.getElementById('btn-back-play').addEventListener('click', () => switchMenu(menuPlay, menuHome));
document.getElementById('btn-back-options').addEventListener('click', () => switchMenu(menuOptions, menuHome));

// Options Listeners
document.getElementById('opt-fov').addEventListener('input', (e) => {
    camera.fov = parseInt(e.target.value);
    camera.updateProjectionMatrix();
    document.getElementById('val-fov').innerText = e.target.value;
});

document.getElementById('opt-bright').addEventListener('input', (e) => {
    const val = parseInt(e.target.value) / 100;
    dirLight.intensity = 0.9 * val;
    ambLight.intensity = 0.7 * val;
    document.getElementById('val-bright').innerText = e.target.value;
});

document.getElementById('opt-dist').addEventListener('input', (e) => {
    RENDER_DISTANCE = parseInt(e.target.value);
    document.getElementById('val-dist').innerText = RENDER_DISTANCE;
    if (worldGenerated) {
        scene.fog.near = (RENDER_DISTANCE - 1) * CHUNK_SIZE;
        scene.fog.far = RENDER_DISTANCE * CHUNK_SIZE;
        updateChunks(true);
    }
});

// Start Game Event
document.getElementById('btn-new-game').addEventListener('click', () => {
    let seedStr = document.getElementById('seed-input').value.trim();
    if (seedStr === "") seedStr = Math.random().toString(36).substring(2, 10);
    
    // Inisialisasi Seed
    const seedNum = hashCode(seedStr);
    seededRandom = mulberry32(seedNum);
    simplex = new SimplexNoise(seededRandom);
    worldSeedOffset = Math.abs(seedNum % 10000);

    // Hapus chunk lama (kalau ada)
    chunks.forEach(c => c.dispose());
    chunks.clear();
    chunkQueue.length = 0;
    lastChunkX = null;
    lastChunkZ = null;
    yawObject.position.set(0, 40, 0);

    // Reset Fog
    scene.fog.near = (RENDER_DISTANCE - 1) * CHUNK_SIZE;
    scene.fog.far = RENDER_DISTANCE * CHUNK_SIZE;

    menuContainer.classList.add('hidden');
    
    worldGenerated = true;
    updateChunks(true); // Mulai merender dunia
    
    resumeGame();
});

// ==========================================
// --- SISTEM HOTBAR & INVENTORY UI ---
// ==========================================
const inventory = ['stone', 'dirt', 'grass', 'wood', 'leaves'];
const blockColors = ['#888888', '#8B4513', '#228B22', '#654321', '#006400'];
let selectedSlot = 0;

hotbarUI.id = 'hotbar';
hotbarUI.style.cssText = 'position:absolute; bottom:20px; left:50%; transform:translateX(-50%); display:none; gap:8px; z-index:100; padding:8px; background:rgba(0,0,0,0.6); border-radius:8px; pointer-events:auto;';
document.body.appendChild(hotbarUI);

inventory.forEach((item, index) => {
    const slot = document.createElement('div');
    slot.id = `slot-${index}`;
    slot.style.cssText = `width:46px; height:46px; border:3px solid ${index === 0 ? 'white' : '#555'}; border-radius:5px; background-color:${blockColors[index]}; background-image:url('textures/${item}.png'); background-size:cover; display:flex; align-items:flex-start; justify-content:flex-start; padding:4px; font-family:sans-serif; color:white; font-size:14px; font-weight:bold; text-shadow:1px 1px 0 #000; box-sizing:border-box; cursor:pointer; touch-action:none;`;
    slot.innerText = index + 1;
    
    slot.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        selectedSlot = index; updateHotbarUI();
    });
    hotbarUI.appendChild(slot);
});

function updateHotbarUI() {
    inventory.forEach((_, index) => {
        document.getElementById(`slot-${index}`).style.borderColor = (index === selectedSlot) ? 'white' : '#555';
    });
}

document.addEventListener('wheel', (e) => {
    if (!gameActive) return;
    selectedSlot += Math.sign(e.deltaY);
    if (selectedSlot < 0) selectedSlot = inventory.length - 1;
    if (selectedSlot >= inventory.length) selectedSlot = 0;
    updateHotbarUI();
});
document.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '5') { selectedSlot = parseInt(e.key) - 1; updateHotbarUI(); }
});

// ==========================================
// --- KAMERA & STATE KONTROL ---
// ==========================================
const yawObject = new THREE.Object3D();
yawObject.position.set(0, 40, 0);
scene.add(yawObject);

const pitchObject = new THREE.Object3D();
yawObject.add(pitchObject);
pitchObject.add(camera);

let headBobTimer = 0;
const BOB_FREQ = 14.0, BOB_AMP_Y = 0.08, BOB_AMP_X = 0.04;
const PI_2 = Math.PI / 2;

function resumeGame() {
    gameActive = true;
    pauseUI.style.display = 'none';
    crosshair.style.display = 'block';
    coordsUI.style.display = 'block';
    hotbarUI.style.display = 'flex';
    
    if (isTouchDevice) {
        document.getElementById('dpad').style.display = 'grid'; 
        document.getElementById('jump-btn').style.display = 'flex';
    } else {
        document.body.requestPointerLock();
    }
}

function pauseGame() {
    gameActive = false;
    crosshair.style.display = 'none';
    if(worldGenerated && menuContainer.classList.contains('hidden')) {
        pauseUI.style.display = 'block';
    }
}

pauseUI.addEventListener('click', resumeGame);

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== document.body && worldGenerated) pauseGame();
});

// Kontrol Mouse (Desktop)
document.addEventListener('mousemove', (e) => {
    if (gameActive && !isTouchDevice) {
        yawObject.rotation.y -= e.movementX * 0.002;
        pitchObject.rotation.x -= e.movementY * 0.002;
        pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, pitchObject.rotation.x));
    }
});

// Kontrol Touch (Mobile)
let cameraTouchId = null; let lastTouchX = 0, lastTouchY = 0;
let interactTouchId = null; let interactTimer = null; let isHolding = false;

document.addEventListener('touchstart', (e) => {
    if (!gameActive) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.target.closest('.mobile-controls') || touch.target.closest('#hotbar')) continue; 

        if (touch.pageX > window.innerWidth / 2 && cameraTouchId === null) { 
            cameraTouchId = touch.identifier; lastTouchX = touch.pageX; lastTouchY = touch.pageY; 
        }
        
        if (interactTouchId === null) {
            interactTouchId = touch.identifier; isHolding = false;
            interactTimer = setTimeout(() => { isHolding = true; handleBlockInteraction(0); }, 500);
        }
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (!gameActive) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === cameraTouchId) {
            e.preventDefault(); 
            yawObject.rotation.y -= (touch.pageX - lastTouchX) * 0.005; 
            pitchObject.rotation.x -= (touch.pageY - lastTouchY) * 0.005; 
            pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, pitchObject.rotation.x));
            lastTouchX = touch.pageX; lastTouchY = touch.pageY;
        }
        if (touch.identifier === interactTouchId) { clearTimeout(interactTimer); interactTouchId = null; }
    }
}, { passive: false });

document.addEventListener('touchend', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === cameraTouchId) cameraTouchId = null;
        if (touch.identifier === interactTouchId) {
            clearTimeout(interactTimer);
            if (!isHolding) handleBlockInteraction(2); 
            interactTouchId = null; isHolding = false;
        }
    }
});

let moveState = { forward: false, backward: false, left: false, right: false };
let canJump = false;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

const setJump = () => { if (canJump) { velocity.y = 8.5; canJump = false; } };

document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = true; break; case 'KeyS': moveState.backward = true; break;
        case 'KeyA': moveState.left = true; break; case 'KeyD': moveState.right = true; break;
        case 'Space': setJump(); break;
        case 'Escape': if(worldGenerated && !isTouchDevice) pauseGame(); break;
    }
});
document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = false; break; case 'KeyS': moveState.backward = false; break;
        case 'KeyA': moveState.left = false; break; case 'KeyD': moveState.right = false; break;
    }
});

if (isTouchDevice) {
    const bindBtn = (id, key) => {
        const btn = document.getElementById(id);
        if(!btn) return;
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); moveState[key] = true; });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); moveState[key] = false; });
    };
    bindBtn('btn-up', 'forward'); bindBtn('btn-down', 'backward'); 
    bindBtn('btn-left', 'left'); bindBtn('btn-right', 'right');
    document.getElementById('jump-btn')?.addEventListener('touchstart', (e) => { e.preventDefault(); setJump(); });
}

// ==========================================
// --- TEKSTUR & MATERIAL ---
// ==========================================
const textureLoader = new THREE.TextureLoader();
function loadTex(url) {
    const tex = textureLoader.load(url);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const mats = {
    stone: new THREE.MeshLambertMaterial({ map: loadTex('textures/stone.png') }),
    dirt: new THREE.MeshLambertMaterial({ map: loadTex('textures/dirt.png') }),
    grass: new THREE.MeshLambertMaterial({ map: loadTex('textures/grass.png') }),
    wood: new THREE.MeshLambertMaterial({ map: loadTex('textures/wood.png') }),
    leaves: new THREE.MeshLambertMaterial({ map: loadTex('textures/leaves.png'), transparent: true, alphaTest: 0.5 }),
    water: new THREE.MeshBasicMaterial({ color: 0x2A52BE, transparent: true, opacity: 0.6, depthWrite: false })
};

function isSolidBlock(type) { return type && type !== 'water'; }
function blockIntersectsPlayer(blockX, blockY, blockZ) {
    const pad = 0.35;
    const playerMinY = yawObject.position.y - PLAYER_HEIGHT;
    return ( blockX < yawObject.position.x + pad && blockX + 1 > yawObject.position.x - pad &&
             blockY < playerMinY + 2.0 && blockY + 1 > playerMinY &&
             blockZ < yawObject.position.z + pad && blockZ + 1 > yawObject.position.z - pad );
}

// ==========================================
// --- SISTEM PARTIKEL & VOXEL CHUNK ---
// ==========================================
const particles = [];
const particleGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
function spawnParticles(x, y, z, type) {
    if (type === 'water') return;
    const mat = mats[type];
    for (let i = 0; i < 15; i++) {
        const p = new THREE.Mesh(particleGeo, mat);
        p.position.set(x + (Math.random() - 0.5)*0.5, y + (Math.random() - 0.5)*0.5, z + (Math.random() - 0.5)*0.5);
        p.userData = { vel: new THREE.Vector3((Math.random() - 0.5)*5, Math.random()*5 + 2, (Math.random() - 0.5)*5), life: 1.0 };
        scene.add(p); particles.push(p);
    }
}

const chunks = new Map();
const chunkQueue = [];
const raycastMeshes = [];

function getElevation(x, z) {
    let e = 1.00 * simplex.noise2D(x * 0.003, z * 0.003) + 0.50 * simplex.noise2D(x * 0.01, z * 0.01) + 0.25 * simplex.noise2D(x * 0.03, z * 0.03);
    e = e / 1.75;
    return Math.floor(Math.sign(e) * Math.pow(Math.abs(e), 1.8) * 35);
}

class Chunk {
    constructor(cx, cz) {
        this.cx = cx; this.cz = cz; this.meshes = []; this.blocks = new Map();
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
                        let type = 'stone';
                        if (y === surfaceY) type = (y >= WATER_LEVEL) ? 'grass' : 'dirt';
                        else if (y > surfaceY - 3) type = 'dirt';
                        this.blocks.set(`${worldX},${y},${worldZ}`, type);
                    } else if (y <= WATER_LEVEL) this.blocks.set(`${worldX},${y},${worldZ}`, 'water');
                }
                if (surfaceY >= WATER_LEVEL && pseudoRandom(worldX, worldZ) < 0.015) {
                    if (this.blocks.has(`${worldX},${surfaceY},${worldZ}`)) {
                        const th = Math.floor(pseudoRandom(worldX + 1, worldZ) * 3) + 4;
                        for (let ty = 1; ty <= th; ty++) this.blocks.set(`${worldX},${surfaceY + ty},${worldZ}`, 'wood');
                        for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
                            if (Math.abs(dx) === 1 && Math.abs(dz) === 1 && dy === 1) continue;
                            if (dx === 0 && dz === 0 && dy === 0) continue;
                            this.blocks.set(`${worldX + dx},${surfaceY + th + dy},${worldZ + dz}`, 'leaves');
                        }
                    }
                }
            }
        }
    }
    buildMeshes() {
        const counts = { stone: 0, dirt: 0, grass: 0, wood: 0, leaves: 0, water: 0 };
        const exposedBlocks = [];
        for (const [key, type] of this.blocks.entries()) {
            const [x, y, z] = key.split(',').map(Number); let isExposed = false;
            if (type === 'water') {
                if (this.blocks.get(`${x},${y + 1},${z}`) !== 'water') isExposed = true;
            } else {
                const neighbors = [
                    this.blocks.get(`${x+1},${y},${z}`), this.blocks.get(`${x-1},${y},${z}`),
                    this.blocks.get(`${x},${y+1},${z}`), this.blocks.get(`${x},${y-1},${z}`),
                    this.blocks.get(`${x},${y},${z+1}`), this.blocks.get(`${x},${y},${z-1}`)
                ];
                if(neighbors.some(n => !n || n === 'water' || n === 'leaves')) isExposed = true;
            }
            if (isExposed) { counts[type]++; exposedBlocks.push({ type, pos: [x, y, z] }); }
        }
        const dummy = new THREE.Object3D(); const indices = { stone: 0, dirt: 0, grass: 0, wood: 0, leaves: 0, water: 0 };
        for (const type of Object.keys(counts)) {
            if (counts[type] === 0) continue;
            const mesh = new THREE.InstancedMesh(boxGeo, mats[type], counts[type]);
            mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage); this.meshes.push(mesh); scene.add(mesh);
            if (type !== 'water') raycastMeshes.push(mesh);
        }
        for (const b of exposedBlocks) {
            dummy.position.set(...b.pos); dummy.updateMatrix();
            this.meshes.find(m => m.material === mats[b.type]).setMatrixAt(indices[b.type]++, dummy.matrix);
        }
        this.meshes.forEach(mesh => mesh.instanceMatrix.needsUpdate = true);
    }
    dispose() {
        this.meshes.forEach(mesh => { scene.remove(mesh); const idx = raycastMeshes.indexOf(mesh); if (idx > -1) raycastMeshes.splice(idx, 1); });
        this.blocks.clear();
    }
}

function getBlock(x, y, z) {
    const chunk = chunks.get(`${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`);
    return chunk ? chunk.blocks.get(`${x},${y},${z}`) : null;
}

let lastChunkX = null, lastChunkZ = null;
function updateChunks(force = false) {
    if(!worldGenerated) return; // Jangan hasilkan chunk sebelum New Game ditekan

    const cx = Math.floor(yawObject.position.x / CHUNK_SIZE);
    const cz = Math.floor(yawObject.position.z / CHUNK_SIZE);
    if (!force && cx === lastChunkX && cz === lastChunkZ) return;
    lastChunkX = cx; lastChunkZ = cz;
    const keep = new Set();
    
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
        intersects[0].object.getMatrixAt(intersects[0].instanceId, hitMatrix);
        hitPosition.setFromMatrixPosition(hitMatrix);
        selectionOutline.position.copy(hitPosition); selectionOutline.scale.set(1.002, 1.002, 1.002); selectionOutline.visible = true;
    } else selectionOutline.visible = false;
}

document.addEventListener('contextmenu', e => e.preventDefault());
function handleBlockInteraction(buttonType) {
    if (!gameActive || !selectionOutline.visible) return;
    const px = Math.round(selectionOutline.position.x); const py = Math.round(selectionOutline.position.y); const pz = Math.round(selectionOutline.position.z);
    const type = getBlock(px, py, pz);

    if (buttonType === 0 && type && type !== 'water') {
        const chunk = chunks.get(`${Math.floor(px/CHUNK_SIZE)},${Math.floor(pz/CHUNK_SIZE)}`);
        if (chunk) {
            chunk.blocks.delete(`${px},${py},${pz}`);
            chunk.meshes.forEach(mesh => { scene.remove(mesh); const idx = raycastMeshes.indexOf(mesh); if(idx>-1) raycastMeshes.splice(idx,1); });
            chunk.meshes = []; chunk.buildMeshes(); spawnParticles(px, py, pz, type); selectionOutline.visible = false;
        }
    } else if (buttonType === 2) {
        const intersects = raycaster.intersectObjects(raycastMeshes, false);
        if (intersects.length > 0 && intersects[0].face) {
            const normal = intersects[0].face.normal;
            const placeX = px + Math.round(normal.x); const placeY = py + Math.round(normal.y); const placeZ = pz + Math.round(normal.z);
            if (blockIntersectsPlayer(placeX, placeY, placeZ)) return;
            const chunk = chunks.get(`${Math.floor(placeX/CHUNK_SIZE)},${Math.floor(placeZ/CHUNK_SIZE)}`);
            if (chunk) {
                const existing = chunk.blocks.get(`${placeX},${placeY},${placeZ}`);
                if (existing && existing !== 'water') return;
                chunk.blocks.set(`${placeX},${placeY},${placeZ}`, inventory[selectedSlot]);
                chunk.meshes.forEach(mesh => { scene.remove(mesh); const idx = raycastMeshes.indexOf(mesh); if(idx>-1) raycastMeshes.splice(idx,1); });
                chunk.meshes = []; chunk.buildMeshes();
            }
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
        if (isSolidBlock(getBlock(x, y, z))) return true;
    }
    return false;
}
function checkFloor(nx, ny, nz) {
    const pad = 0.3; const minX = Math.floor(nx - pad + 0.5); const maxX = Math.floor(nx + pad + 0.5);
    const minZ = Math.floor(nz - pad + 0.5); const maxZ = Math.floor(nz + pad + 0.5);
    const blockY = Math.floor(ny - PLAYER_HEIGHT + 0.5);
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        if (isSolidBlock(getBlock(x, blockY, z))) return blockY;
    }
    return null;
}

let prevTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    
    // Jangan proses pembaruan chunk jika dunia belum dibuat (Masih di Menu)
    if (worldGenerated && chunkQueue.length > 0) {
        const item = chunkQueue.shift();
        if (!chunks.has(item.key)) chunks.set(item.key, new Chunk(item.cx, item.cz));
    }

    if (!gameActive) { prevTime = performance.now(); renderer.render(scene, camera); return; }

    const time = performance.now(); const delta = Math.min((time - prevTime) / 1000, 0.1);

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.position.addScaledVector(p.userData.vel, delta); p.userData.vel.y -= 20 * delta;
        p.scale.setScalar(p.userData.life); p.userData.life -= delta * 1.5;
        if (p.userData.life <= 0) { scene.remove(p); particles.splice(i, 1); }
    }

    if(worldGenerated) updateChunks();

    if (yawObject.position.y < -50) { yawObject.position.set(0, 40, 0); velocity.set(0, 0, 0); }
    coordsUI.innerText = `X: ${Math.floor(yawObject.position.x)} | Y: ${Math.floor(yawObject.position.y)} | Z: ${Math.floor(yawObject.position.z)}`;

    const moveX = Number(moveState.right) - Number(moveState.left); const moveZ = Number(moveState.backward) - Number(moveState.forward);
    direction.set(moveX, 0, moveZ).normalize(); direction.applyEuler(new THREE.Euler(0, yawObject.rotation.y, 0));

    const inWater = getBlock(Math.floor(yawObject.position.x), Math.floor(yawObject.position.y), Math.floor(yawObject.position.z)) === 'water';
    const speed = inWater ? 3.5 : 7.0;

    if (moveState.forward || moveState.backward || moveState.left || moveState.right) { velocity.x = direction.x * speed; velocity.z = direction.z * speed; } 
    else { velocity.x = 0; velocity.z = 0; }

    const py = yawObject.position.y; let nextX = yawObject.position.x + velocity.x * delta; let nextZ = yawObject.position.z + velocity.z * delta;

    if (checkCollision(nextX, py, yawObject.position.z)) {
        if (canJump && !checkCollision(nextX, py + 1.1, yawObject.position.z)) { velocity.y = 8.5; canJump = false; }
        velocity.x = 0; nextX = yawObject.position.x;
    } yawObject.position.x = nextX;

    if (checkCollision(yawObject.position.x, py, nextZ)) {
        if (canJump && !checkCollision(yawObject.position.x, py + 1.1, nextZ)) { velocity.y = 8.5; canJump = false; }
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

    // --- HEAD BOBBING ---
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
