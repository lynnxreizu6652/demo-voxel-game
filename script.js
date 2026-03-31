import * as THREE from 'three';
import { SimplexNoise } from 'simplex-noise';

// --- KONFIGURASI DASAR ---
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const PLAYER_HEIGHT = 1.6;
const CHUNK_SIZE = 16;
let RENDER_DISTANCE = 4;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, (RENDER_DISTANCE - 1) * CHUNK_SIZE, RENDER_DISTANCE * CHUNK_SIZE);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// --- UI RENDER DISTANCE ---
const distUI = document.createElement('div');
distUI.style.cssText = 'position:absolute; top:10px; left:10px; z-index:100; color:white; background:rgba(0,0,0,0.6); padding:8px; border-radius:5px; font-family:sans-serif; pointer-events:auto;';
distUI.innerHTML = `
    <label>Chunk Distance: <span id="dist-val">${RENDER_DISTANCE}</span></label><br>
    <input type="range" id="dist-slider" min="2" max="10" step="1" value="${RENDER_DISTANCE}" style="width:100%;">
`;
document.body.appendChild(distUI);

document.getElementById('dist-slider').addEventListener('change', (e) => {
    RENDER_DISTANCE = parseInt(e.target.value);
    document.getElementById('dist-val').innerText = RENDER_DISTANCE;
    scene.fog.near = (RENDER_DISTANCE - 1) * CHUNK_SIZE;
    scene.fog.far = RENDER_DISTANCE * CHUNK_SIZE;
    updateChunks(true);
});

// ==========================================
// --- SISTEM HOTBAR & INVENTORY UI ---
// ==========================================
const inventory = ['stone', 'dirt', 'grass', 'wood', 'leaves'];
const blockColors = ['#888888', '#8B4513', '#228B22', '#654321', '#006400'];
let selectedSlot = 0;

const hotbarUI = document.createElement('div');
hotbarUI.id = 'hotbar';
hotbarUI.style.cssText = 'position:absolute; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:8px; z-index:100; padding:8px; background:rgba(0,0,0,0.6); border-radius:8px; pointer-events:none;';
document.body.appendChild(hotbarUI);

inventory.forEach((item, index) => {
    const slot = document.createElement('div');
    slot.id = `slot-${index}`;
    slot.style.cssText = `width:46px; height:46px; border:3px solid ${index === 0 ? 'white' : '#555'}; border-radius:5px; background-color:${blockColors[index]}; background-image:url('/textures/${item}.png'); background-size:cover; display:flex; align-items:flex-start; justify-content:flex-start; padding:4px; font-family:sans-serif; color:white; font-size:14px; font-weight:bold; text-shadow:1px 1px 0 #000; box-sizing:border-box;`;
    slot.innerText = index + 1;
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
    if (e.key >= '1' && e.key <= '5') {
        selectedSlot = parseInt(e.key) - 1;
        updateHotbarUI();
    }
});

// --- KAMERA & KONTROL ---
const yawObject = new THREE.Object3D();
yawObject.position.set(0, 40, 0);
scene.add(yawObject);

const pitchObject = new THREE.Object3D();
yawObject.add(pitchObject);
pitchObject.add(camera);

let headBobTimer = 0;
const BOB_FREQ = 14.0, BOB_AMP_Y = 0.08, BOB_AMP_X = 0.04;

const ui = document.getElementById('ui');
const crosshair = document.getElementById('crosshair');
const coordsUI = document.getElementById('coords');

let gameActive = false;

ui?.addEventListener('click', () => {
    if (!isTouchDevice) document.body.requestPointerLock();
    else {
        gameActive = true;
        ui.style.display = 'none';
        crosshair.style.display = 'block';
    }
});

document.addEventListener('pointerlockchange', () => {
    gameActive = document.pointerLockElement === document.body;
    if (ui) ui.style.display = gameActive ? 'none' : 'block';
    if (crosshair) crosshair.style.display = gameActive ? 'block' : 'none';
});

const PI_2 = Math.PI / 2;

document.addEventListener('mousemove', (e) => {
    if (gameActive && !isTouchDevice) {
        yawObject.rotation.y -= e.movementX * 0.002;
        pitchObject.rotation.x -= e.movementY * 0.002;
        pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, pitchObject.rotation.x));
    }
});

let moveState = { forward: false, backward: false, left: false, right: false };
let canJump = false;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

const setJump = () => {
    if (canJump) {
        velocity.y = 8.5;
        canJump = false;
    }
};

document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space': setJump(); break;
    }
});

document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyD': moveState.right = false; break;
    }
});

// --- PENCAHAYAAN ---
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(50, 100, 50);
scene.add(dirLight);

// ==========================================
// --- TEKSTUR & MATERIAL ---
// ==========================================
const textureLoader = new THREE.TextureLoader();

function loadTex(url) {
    const tex = textureLoader.load(url);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const mats = {
    stone: new THREE.MeshLambertMaterial({ map: loadTex('/textures/stone.png') }),
    dirt: new THREE.MeshLambertMaterial({ map: loadTex('/textures/dirt.png') }),
    grass: new THREE.MeshLambertMaterial({ map: loadTex('/textures/grass.png') }),
    wood: new THREE.MeshLambertMaterial({ map: loadTex('/textures/wood.png') }),
    leaves: new THREE.MeshLambertMaterial({ map: loadTex('/textures/leaves.png'), transparent: true, alphaTest: 0.5 }),
    water: new THREE.MeshBasicMaterial({ color: 0x2A52BE, transparent: true, opacity: 0.6, depthWrite: false })
};

function isSolidBlock(type) {
    return type && type !== 'water';
}

function blockIntersectsPlayer(blockX, blockY, blockZ) {
    const pad = 0.35;

    const playerFeetY = yawObject.position.y - PLAYER_HEIGHT;
    const playerMinX = yawObject.position.x - pad;
    const playerMaxX = yawObject.position.x + pad;
    const playerMinZ = yawObject.position.z - pad;
    const playerMaxZ = yawObject.position.z + pad;

    const playerMinY = playerFeetY;
    const playerMaxY = playerFeetY + 2.0; // proteksi 2 blok tinggi

    const blockMinX = blockX;
    const blockMaxX = blockX + 1;
    const blockMinY = blockY;
    const blockMaxY = blockY + 1;
    const blockMinZ = blockZ;
    const blockMaxZ = blockZ + 1;

    return (
        blockMinX < playerMaxX && blockMaxX > playerMinX &&
        blockMinY < playerMaxY && blockMaxY > playerMinY &&
        blockMinZ < playerMaxZ && blockMaxZ > playerMinZ
    );
}

// ==========================================
// --- SISTEM PARTIKEL (BLOCK BREAKING) ---
// ==========================================
const particles = [];
const particleGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);

function spawnParticles(x, y, z, type) {
    if (type === 'water') return;
    const mat = mats[type];
    for (let i = 0; i < 15; i++) {
        const p = new THREE.Mesh(particleGeo, mat);
        p.position.set(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.5, z + (Math.random() - 0.5) * 0.5);
        p.userData = {
            vel: new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 5 + 2, (Math.random() - 0.5) * 5),
            life: 1.0
        };
        scene.add(p);
        particles.push(p);
    }
}

// ==========================================
// --- SISTEM GENERASI VOXEL ---
// ==========================================
const simplex = new SimplexNoise();
const chunks = new Map();
const chunkQueue = [];
const raycastMeshes = [];

function pseudoRandom(x, z) {
    let h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453123;
    return h - Math.floor(h);
}

function getElevation(x, z) {
    let e = 1.00 * simplex.noise2D(x * 0.003, z * 0.003) +
            0.50 * simplex.noise2D(x * 0.01, z * 0.01) +
            0.25 * simplex.noise2D(x * 0.03, z * 0.03);
    e = e / 1.75;
    return Math.floor(Math.sign(e) * Math.pow(Math.abs(e), 1.8) * 35);
}

class Chunk {
    constructor(cx, cz) {
        this.cx = cx;
        this.cz = cz;
        this.meshes = [];
        this.blocks = new Map();

        this.generateData();
        this.buildMeshes();
    }

    generateData() {
        const WATER_LEVEL = -5;
        const BOTTOM_LIMIT = -40;

        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const worldX = this.cx * CHUNK_SIZE + lx;
                const worldZ = this.cz * CHUNK_SIZE + lz;
                const surfaceY = getElevation(worldX, worldZ);

                for (let y = BOTTOM_LIMIT; y <= Math.max(surfaceY, WATER_LEVEL); y++) {
                    if (y <= surfaceY) {
                        if (y > BOTTOM_LIMIT + 5) {
                            let caveNoise = simplex.noise3D(worldX * 0.04, y * 0.04, worldZ * 0.04);
                            if (caveNoise > 0.35) continue;
                        }

                        let type = 'stone';
                        if (y === surfaceY) type = (y >= WATER_LEVEL) ? 'grass' : 'dirt';
                        else if (y > surfaceY - 3) type = 'dirt';

                        this.blocks.set(`${worldX},${y},${worldZ}`, type);
                    } else if (y <= WATER_LEVEL) {
                        // Water diperlakukan sebagai fluid/non-solid.
                        // Tetap disimpan agar mengisi cekungan, tapi tidak dihitung sebagai blok solid.
                        this.blocks.set(`${worldX},${y},${worldZ}`, 'water');
                    }
                }

                if (surfaceY >= WATER_LEVEL && pseudoRandom(worldX, worldZ) < 0.015) {
                    if (this.blocks.has(`${worldX},${surfaceY},${worldZ}`)) {
                        const th = Math.floor(pseudoRandom(worldX + 1, worldZ) * 3) + 4;
                        for (let ty = 1; ty <= th; ty++) this.blocks.set(`${worldX},${surfaceY + ty},${worldZ}`, 'wood');

                        for (let dx = -1; dx <= 1; dx++) {
                            for (let dy = 0; dy <= 1; dy++) {
                                for (let dz = -1; dz <= 1; dz++) {
                                    if (Math.abs(dx) === 1 && Math.abs(dz) === 1 && dy === 1) continue;
                                    if (dx === 0 && dz === 0 && dy === 0) continue;
                                    this.blocks.set(`${worldX + dx},${surfaceY + th + dy},${worldZ + dz}`, 'leaves');
                                }
                            }
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
            const [x, y, z] = key.split(',').map(Number);
            let isExposed = false;

            if (type === 'water') {
                // Water hanya render permukaan atas / bagian yang tidak tertutup water di atasnya
                const blockAbove = this.blocks.get(`${x},${y + 1},${z}`);
                if (blockAbove !== 'water') isExposed = true;
            } else {
                const neighbors = [
                    this.blocks.get(`${x + 1},${y},${z}`), this.blocks.get(`${x - 1},${y},${z}`),
                    this.blocks.get(`${x},${y + 1},${z}`), this.blocks.get(`${x},${y - 1},${z}`),
                    this.blocks.get(`${x},${y},${z + 1}`), this.blocks.get(`${x},${y},${z - 1}`)
                ];

                for (let n of neighbors) {
                    if (!n || n === 'water' || n === 'leaves') {
                        isExposed = true;
                        break;
                    }
                }
            }

            if (isExposed) {
                counts[type]++;
                exposedBlocks.push({ type, pos: [x, y, z] });
            }
        }

        const dummy = new THREE.Object3D();
        const indices = { stone: 0, dirt: 0, grass: 0, wood: 0, leaves: 0, water: 0 };

        for (const type of Object.keys(counts)) {
            if (counts[type] === 0) continue;
            const mesh = new THREE.InstancedMesh(boxGeo, mats[type], counts[type]);
            mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
            this.meshes.push(mesh);
            scene.add(mesh);

            // Water jangan dimasukkan ke raycast, supaya klik bisa menembus air
            // Leaves tetap dimasukkan, dan sekarang juga solid di collision
            if (type !== 'water') raycastMeshes.push(mesh);
        }

        for (const b of exposedBlocks) {
            dummy.position.set(b.pos[0], b.pos[1], b.pos[2]);
            dummy.updateMatrix();
            const targetMesh = this.meshes.find(m => m.material === mats[b.type]);
            targetMesh.setMatrixAt(indices[b.type]++, dummy.matrix);
        }

        this.meshes.forEach(mesh => mesh.instanceMatrix.needsUpdate = true);
    }

    dispose() {
        this.meshes.forEach(mesh => {
            scene.remove(mesh);
            const index = raycastMeshes.indexOf(mesh);
            if (index > -1) raycastMeshes.splice(index, 1);
            // Jangan dispose shared geometry/material di sini, karena dipakai bersama
        });
        this.blocks.clear();
    }
}

function getBlock(x, y, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = chunks.get(`${cx},${cz}`);
    if (chunk) return chunk.blocks.get(`${x},${y},${z}`);
    return null;
}

let lastChunkX = null, lastChunkZ = null;

function updateChunks(force = false) {
    const px = yawObject.position.x;
    const pz = yawObject.position.z;
    const currentChunkX = Math.floor(px / CHUNK_SIZE);
    const currentChunkZ = Math.floor(pz / CHUNK_SIZE);

    if (!force && currentChunkX === lastChunkX && currentChunkZ === lastChunkZ) return;

    lastChunkX = currentChunkX;
    lastChunkZ = currentChunkZ;

    const chunksToKeep = new Set();

    for (let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
        for (let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
            if (x * x + z * z > RENDER_DISTANCE * RENDER_DISTANCE) continue;
            const cx = currentChunkX + x;
            const cz = currentChunkZ + z;
            const key = `${cx},${cz}`;
            chunksToKeep.add(key);

            if (!chunks.has(key) && !chunkQueue.some(q => q.key === key)) {
                chunkQueue.push({ cx, cz, key });
            }
        }
    }

    for (const [key, chunk] of chunks.entries()) {
        if (!chunksToKeep.has(key)) {
            chunk.dispose();
            chunks.delete(key);
        }
    }
}

updateChunks(true);

// --- SELEKSI BLOK ---
const selectionOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(boxGeo),
    new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2, transparent: true, opacity: 0.5 })
);
selectionOutline.visible = false;
scene.add(selectionOutline);

const raycaster = new THREE.Raycaster();
raycaster.far = 5;
const centerScreenVec = new THREE.Vector2(0, 0);
const hitMatrix = new THREE.Matrix4();
const hitPosition = new THREE.Vector3();

function updateBlockSelection() {
    if (!gameActive) {
        selectionOutline.visible = false;
        return;
    }

    raycaster.setFromCamera(centerScreenVec, camera);
    const intersects = raycaster.intersectObjects(raycastMeshes, false);

    if (intersects.length > 0) {
        const hit = intersects[0];
        hit.object.getMatrixAt(hit.instanceId, hitMatrix);
        hitPosition.setFromMatrixPosition(hitMatrix);
        selectionOutline.position.copy(hitPosition);
        selectionOutline.scale.set(1.002, 1.002, 1.002);
        selectionOutline.visible = true;
    } else {
        selectionOutline.visible = false;
    }
}

// ==========================================
// --- FUNGSI FISIKA ---
// ==========================================
function checkCollision(nx, ny, nz) {
    const pad = 0.3;
    const minX = Math.floor(nx - pad + 0.5);
    const maxX = Math.floor(nx + pad + 0.5);
    const minZ = Math.floor(nz - pad + 0.5);
    const maxZ = Math.floor(nz + pad + 0.5);
    const minY = Math.floor(ny - PLAYER_HEIGHT + 0.2 + 0.5);
    const maxY = Math.floor(ny + 0.2 + 0.5);

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const b = getBlock(x, y, z);
                if (isSolidBlock(b)) return true;
            }
        }
    }
    return false;
}

function checkFloor(nx, ny, nz) {
    const pad = 0.3;
    const minX = Math.floor(nx - pad + 0.5);
    const maxX = Math.floor(nx + pad + 0.5);
    const minZ = Math.floor(nz - pad + 0.5);
    const maxZ = Math.floor(nz + pad + 0.5);
    const blockY = Math.floor(ny - PLAYER_HEIGHT + 0.5);

    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            const b = getBlock(x, blockY, z);
            if (isSolidBlock(b)) return blockY;
        }
    }
    return null;
}

// ==========================================
// --- INTERAKSI BLOK (BREAK & PLACE) ---
// ==========================================
document.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('mousedown', (e) => {
    if (!gameActive || !selectionOutline.visible) return;

    const px = Math.round(selectionOutline.position.x);
    const py = Math.round(selectionOutline.position.y);
    const pz = Math.round(selectionOutline.position.z);
    const type = getBlock(px, py, pz);

    if (e.button === 0) {
        // KLIK KIRI: HANCURKAN
        if (type && type !== 'water') {
            const cx = Math.floor(px / CHUNK_SIZE);
            const cz = Math.floor(pz / CHUNK_SIZE);
            const chunk = chunks.get(`${cx},${cz}`);

            if (chunk) {
                chunk.blocks.delete(`${px},${py},${pz}`);

                chunk.meshes.forEach(mesh => {
                    scene.remove(mesh);
                    const index = raycastMeshes.indexOf(mesh);
                    if (index > -1) raycastMeshes.splice(index, 1);
                });
                chunk.meshes = [];

                chunk.buildMeshes();
                spawnParticles(px, py, pz, type);
                selectionOutline.visible = false;
            }
        }
    } else if (e.button === 2) {
        // KLIK KANAN: TEMPATKAN BLOK
        const intersects = raycaster.intersectObjects(raycastMeshes, false);
        if (intersects.length > 0 && intersects[0].face) {
            const hit = intersects[0];
            const normal = hit.face.normal;

            const placeX = px + Math.round(normal.x);
            const placeY = py + Math.round(normal.y);
            const placeZ = pz + Math.round(normal.z);

            // Proteksi: jangan taruh blok pada area player setinggi 2 blok
            if (blockIntersectsPlayer(placeX, placeY, placeZ)) {
                return;
            }

            const cx = Math.floor(placeX / CHUNK_SIZE);
            const cz = Math.floor(placeZ / CHUNK_SIZE);
            const chunk = chunks.get(`${cx},${cz}`);

            if (chunk) {
                const existing = chunk.blocks.get(`${placeX},${placeY},${placeZ}`);

                // Air dianggap fluid, jadi boleh tergantikan oleh blok baru
                if (existing && existing !== 'water') return;

                chunk.blocks.set(`${placeX},${placeY},${placeZ}`, inventory[selectedSlot]);

                chunk.meshes.forEach(mesh => {
                    scene.remove(mesh);
                    const index = raycastMeshes.indexOf(mesh);
                    if (index > -1) raycastMeshes.splice(index, 1);
                });
                chunk.meshes = [];
                chunk.buildMeshes();
            }
        }
    }
});

// --- LOOP ANIMASI ---
let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    if (chunkQueue.length > 0) {
        const item = chunkQueue.shift();
        if (!chunks.has(item.key)) chunks.set(item.key, new Chunk(item.cx, item.cz));
    }

    if (!gameActive) {
        prevTime = performance.now();
        renderer.render(scene, camera);
        return;
    }

    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.1);

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.position.addScaledVector(p.userData.vel, delta);
        p.userData.vel.y -= 20 * delta;
        p.scale.setScalar(p.userData.life);
        p.userData.life -= delta * 1.5;

        if (p.userData.life <= 0) {
            scene.remove(p);
            particles.splice(i, 1);
        }
    }

    updateChunks();

    if (yawObject.position.y < -50) {
        yawObject.position.set(0, 40, 0);
        velocity.set(0, 0, 0);
    }

    if (coordsUI) coordsUI.innerText = `X: ${Math.floor(yawObject.position.x)} | Y: ${Math.floor(yawObject.position.y)} | Z: ${Math.floor(yawObject.position.z)}`;

    const moveX = Number(moveState.right) - Number(moveState.left);
    const moveZ = Number(moveState.backward) - Number(moveState.forward);
    direction.set(moveX, 0, moveZ).normalize();
    direction.applyEuler(new THREE.Euler(0, yawObject.rotation.y, 0));

    const headBlockType = getBlock(Math.floor(yawObject.position.x), Math.floor(yawObject.position.y), Math.floor(yawObject.position.z));
    const inWater = headBlockType === 'water';

    const speed = inWater ? 3.5 : 7.0;

    if (moveState.forward || moveState.backward || moveState.left || moveState.right) {
        velocity.x = direction.x * speed;
        velocity.z = direction.z * speed;
    } else {
        velocity.x = 0;
        velocity.z = 0;
    }

    const py = yawObject.position.y;
    let nextX = yawObject.position.x + velocity.x * delta;
    let nextZ = yawObject.position.z + velocity.z * delta;

    if (checkCollision(nextX, py, yawObject.position.z)) {
        if (canJump && !checkCollision(nextX, py + 1.1, yawObject.position.z)) {
            velocity.y = 8.5;
            canJump = false;
        }
        velocity.x = 0;
        nextX = yawObject.position.x;
    }
    yawObject.position.x = nextX;

    if (checkCollision(yawObject.position.x, py, nextZ)) {
        if (canJump && !checkCollision(yawObject.position.x, py + 1.1, nextZ)) {
            velocity.y = 8.5;
            canJump = false;
        }
        velocity.z = 0;
        nextZ = yawObject.position.z;
    }
    yawObject.position.z = nextZ;

    if (inWater) {
        velocity.y -= 5.0 * delta;
        if (velocity.y < -3) velocity.y = -3;
        if (moveState.forward && moveState.backward === false) velocity.y += 10.0 * delta;
    } else {
        velocity.y -= 30.0 * delta;
    }

    let nextY = yawObject.position.y + velocity.y * delta;

    // Pengecekan kepala menabrak plafon
    if (velocity.y > 0) {
        if (checkCollision(yawObject.position.x, nextY, yawObject.position.z)) {
            velocity.y = 0;
            nextY = yawObject.position.y;
        }
    } else if (velocity.y < 0) {
        const floorY = checkFloor(yawObject.position.x, nextY, yawObject.position.z);
        if (floorY !== null) {
            const landingHeight = floorY + 0.5 + PLAYER_HEIGHT;
            if (nextY <= landingHeight) {
                velocity.y = 0;
                nextY = landingHeight;
                canJump = true;
            }
        } else {
            canJump = inWater;
        }
    }

    yawObject.position.y = nextY;

    // --- HEAD BOBBING ---
    const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    const isMovingOnGround = horizontalSpeed > 0.1 && canJump && !inWater;

    let targetBobY = 0, targetBobX = 0;
    if (isMovingOnGround) {
        headBobTimer += delta * BOB_FREQ;
        targetBobY = Math.sin(headBobTimer) * BOB_AMP_Y;
        targetBobX = Math.cos(headBobTimer * 0.5) * BOB_AMP_X;
    } else {
        targetBobY = 0;
        targetBobX = 0;
    }

    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetBobY, delta * 10.0);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetBobX, delta * 10.0);

    updateBlockSelection();

    prevTime = time;
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
