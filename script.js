import * as THREE from 'three';
import { SimplexNoise } from 'simplex-noise';

// --- KONFIGURASI FISIKA ADVANCE ---
const PLAYER = {
    height: 1.7,         // Tinggi total player
    eyeHeight: 1.6,      // Posisi mata (camera) relative ke kaki
    radius: 0.35,        // Jari-jari tabrakan horizontal
    
    // Pergerakan Darat
    accelGround: 90.0,   // Seberapa cepat akselerasi di tanah (Gaya dorong)
    frictionGround: 10.0,// Gesekan di tanah (semakin tinggi semakin cepat berhenti)
    maxSpeedGround: 7.5, // Kecepatan maksimal berjalan
    
    // Pergerakan Udara
    accelAir: 15.0,      // Akselerasi saat melayang
    frictionAir: 1.5,    // Gesekan udara minimal
    maxSpeedAir: 6.0,    // Kecepatan udara maksimal
    
    jumpImpulse: 10.0,   // Kekuatan lompatan (Impulse instan)
    gravity: 30.0,       // Gaya gravitasi ke bawah
    terminalVelocity: 50 // Kecepatan jatuh maksimal
};

const CAMERA_BOB = {
    frequency: 10.0,     // Kecepatan guncangan (Hz)
    amplitudeVertical: 0.05, // Amplitudo guncangan atas-bawah
    amplitudeHorizontal: 0.02, // Amplitudo guncangan kiri-kanan
    smoothing: 0.1        // Kecepatan kamera kembali ke posisi netral
};

// --- SETUP SCENE DASAR ---
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const MAP_SIZE = 64; // Sedikit lebih luas untuk pergerakan halus

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 30, 70);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- STRUKTUR KAMERA ADVANCE (FPS STYLE) ---
// Pitch (Atas/Bawah) didalam Yaw (Kiri/Kanan) agar Bobbing tidak mengganggu rotasi.
const cameraContainer = new THREE.Object3D(); // Wadah untuk View Bobbing
cameraContainer.add(camera);

const pitchObject = new THREE.Object3D(); 
pitchObject.add(cameraContainer); // Kamera sekarang di dalam container bobbing

const yawObject = new THREE.Object3D(); 
yawObject.position.set(0, 15, 0); 
yawObject.add(pitchObject);
scene.add(yawObject);

// UI & Input (Sama seperti sebelumnya)
const ui = document.getElementById('ui');
const crosshair = document.getElementById('crosshair');
const coordsUI = document.getElementById('coords');
let gameActive = false;

if (isTouchDevice) { 
    document.getElementById('dpad').style.display = 'grid'; 
    document.getElementById('jump-btn').style.display = 'flex'; 
}

ui.addEventListener('click', () => {
    if (!isTouchDevice) document.body.requestPointerLock();
    else { gameActive = true; ui.style.display = 'none'; crosshair.style.display = 'block'; }
});

document.addEventListener('pointerlockchange', () => {
    gameActive = document.pointerLockElement === document.body;
    ui.style.display = gameActive ? 'none' : 'block';
    crosshair.style.display = gameActive ? 'block' : 'none';
});

// Rotasi Kamera Halus (Mouse & Touch sama seperti sebelumnya)
const PI_2 = Math.PI / 2;
document.addEventListener('mousemove', (event) => {
    if (gameActive && !isTouchDevice) {
        yawObject.rotation.y -= event.movementX * 0.002;
        pitchObject.rotation.x -= event.movementY * 0.002;
        pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, pitchObject.rotation.x));
    }
});
// (Input Touch dikecualikan untuk fokus pada Fisika)

// --- INPUT STATE & STATE PLAYER ---
let moveState = { forward: false, backward: false, left: false, right: false };
const playerState = {
    onGround: false,
    velocity: new THREE.Vector3(),
    currentSpeedHorizontal: 0,
    jumpQueue: false,
    walkCycleTimer: 0 // Untuk View Bobbing
};

// Input Handling (Keyboard)
const onKeyDown = (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space': playerState.jumpQueue = true; break; // Queue jump agar input tidak hilang
    }
};
const onKeyUp = (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyD': moveState.right = false; break;
    }
};
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

// (Input Touch dikecualikan)

// --- PENCAHAYAAN & DUNIA (Sama seperti sebelumnya, tapi Dunia lebih luas) ---
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0)); // Sedikit lebih terang
const dirLight = new THREE.DirectionalLight(0xffffff, 0.7); 
dirLight.position.set(15, 30, 15); 
scene.add(dirLight);

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const grassMat = new THREE.MeshLambertMaterial({ color: 0x4CAF50 });
const dirtMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
const stoneMat = new THREE.MeshLambertMaterial({ color: 0x808080 });
const woodMat = new THREE.MeshLambertMaterial({ color: 0x5C4033 });
const leafMat = new THREE.MeshLambertMaterial({ color: 0x228B22 });

const simplex = new SimplexNoise();
const worldBlocks = new Set(); 

function addBlock(mesh, x, y, z) {
    mesh.position.set(x, y, z); scene.add(mesh);
    worldBlocks.add(`${x},${y},${z}`); 
}

// Generate World Lebih Luas
for (let x = 0; x < MAP_SIZE; x++) {
    for (let z = 0; z < MAP_SIZE; z++) {
        const surfaceY = Math.floor((simplex.noise2D(x * 0.08, z * 0.08) + 1) * 3) - 5; 
        const worldX = x - MAP_SIZE/2; const worldZ = z - MAP_SIZE/2;

        for (let y = surfaceY - 4; y <= surfaceY; y++) {
            addBlock(new THREE.Mesh(boxGeo, (y === surfaceY) ? grassMat : (y > surfaceY - 2) ? dirtMat : stoneMat), worldX, y, worldZ);
        }
        // Spawn pohon acak (sama seperti sebelumnya)
        if (Math.random() < 0.02 && surfaceY > -6) {
             const treeHeight = Math.floor(Math.random() * 2) + 4; 
             for (let ty = 1; ty <= treeHeight; ty++) addBlock(new THREE.Mesh(boxGeo, woodMat), worldX, surfaceY + ty, worldZ);
             for (let lx = -2; lx <= 2; lx++) { for (let lz = -2; lz <= 2; lz++) {
                 if (Math.abs(lx) === 2 && Math.abs(lz) === 2) continue;
                 if (lx===0 && lz===0) continue;
                 addBlock(new THREE.Mesh(boxGeo, leafMat), worldX + lx, surfaceY + treeHeight + 1, worldZ + lz);
             }}
        }
    }
}

// --- SISTEM COLLISION AABB (DITINGKATKAN UNTUK SLIDING) ---
const halfRadius = PLAYER.radius;
const halfHeight = PLAYER.height / 2;

// Cek tabrakan tabung (player) dengan balok dunia
function checkCollision(nx, ny, nz) {
    // Tentukan range blok di sekitar player
    const minX = Math.floor(nx - halfRadius + 0.5); 
    const maxX = Math.floor(nx + halfRadius + 0.5);
    const minY = Math.floor(ny - PLAYER.height + 0.2 + 0.5); // Angkat sedikit dari lantai
    const maxY = Math.floor(ny + 0.1 + 0.5); // Sedikit di atas kepala
    const minZ = Math.floor(nz - halfRadius + 0.5); 
    const maxZ = Math.floor(nz + halfRadius + 0.5);

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                if (worldBlocks.has(`${x},${y},${z}`)) return true;
            }
        }
    }
    return false;
}

// Cek lantai (Vertikal)
function checkFloor(nx, ny, nz) {
    const minX = Math.floor(nx - (halfRadius * 0.9) + 0.5); // Sedikit lebih kecil agar tidak nyangkut di pinggir
    const maxX = Math.floor(nx + (halfRadius * 0.9) + 0.5);
    const minZ = Math.floor(nz - (halfRadius * 0.9) + 0.5); 
    const maxZ = Math.floor(nz + (halfRadius * 0.9) + 0.5);
    
    // Cek tepat di bawah kaki (ny sudah posisi mata, kurangi PLAYER_HEIGHT)
    const blockY = Math.floor(ny - PLAYER.height + 0.5); 

    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            if (worldBlocks.has(`${x},${blockY},${z}`)) return blockY;
        }
    }
    return null;
}

// --- INTI FISIKA ADVANCE (LOOP ANIMASI) ---
const inputDirection = new THREE.Vector3();
let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    if (!gameActive) { 
        prevTime = performance.now(); 
        renderer.render(scene, camera); 
        return; 
    }

    const time = performance.now();
    const delta = (time - prevTime) / 1000; // Delta time dalam detik (halus)

    // Reset posisi netral kamera container (eyeHeight)
    cameraContainer.position.y = PLAYER.eyeHeight;

    // 1. TENTUKAN ARAH INPUT (NORMALIZED)
    inputDirection.set(0, 0, 0);
    if (moveState.forward) inputDirection.z -= 1;
    if (moveState.backward) inputDirection.z += 1;
    if (moveState.left) inputDirection.x -= 1;
    if (moveState.right) inputDirection.x += 1;
    inputDirection.normalize(); // Pastikan jalan diagonal tidak lebih cepat

    // Ubah arah input relatif terhadap rotasi player (Yaw)
    inputDirection.applyEuler(new THREE.Euler(0, yawObject.rotation.y, 0));

    // 2. TERAPKAN FISIKA HORIZONTAL (BERBASIS GAYA)
    const accel = playerState.onGround ? PLAYER.accelGround : PLAYER.accelAir;
    const friction = playerState.onGround ? PLAYER.frictionGround : PLAYER.frictionAir;
    const maxSpeed = playerState.onGround ? PLAYER.maxSpeedGround : PLAYER.maxSpeedAir;

    // Terapkan Akselerasi (Gaya Dorong)
    playerState.velocity.x += inputDirection.x * accel * delta;
    playerState.velocity.z += inputDirection.z * accel * delta;

    // Terapkan Friksi (Gesekan bertahap)
    // Lerp kecepatan horizontal mendekati nol berdasarkan friksi dan delta time
    const frictionFactor = Math.max(0, 1 - friction * delta);
    playerState.velocity.x *= frictionFactor;
    playerState.velocity.z *= frictionFactor;

    // Batasi kecepatan maksimal (Terminal Velocity Horizontal)
    playerState.currentSpeedHorizontal = Math.sqrt(playerState.velocity.x**2 + playerState.velocity.z**2);
    if (playerState.currentSpeedHorizontal > maxSpeed) {
        const ratio = maxSpeed / playerState.currentSpeedHorizontal;
        playerState.velocity.x *= ratio;
        playerState.velocity.z *= ratio;
    }

    // 3. TERAPKAN FISIKA VERTIKAL (GRAVITASI & LOMPAT)
    playerState.velocity.y -= PLAYER.gravity * delta; // Gravitasi
    
    // Batasi kecepatan jatuh terminal
    if (playerState.velocity.y < -PLAYER.terminalVelocity) playerState.velocity.y = -PLAYER.terminalVelocity;

    // Lompat (Impulse Instan)
    if (playerState.jumpQueue && playerState.onGround) {
        playerState.velocity.y = PLAYER.jumpImpulse; // Berikan velocity vertikal instan
        playerState.onGround = false;
        playerState.jumpQueue = false; // Reset queue
    } else if (!playerState.onGround) {
        playerState.jumpQueue = false; // Batalkan lompatan jika sudah melayang
    }

    // 4. RESOLUSI TABRAKAN (SLIDING)
    const currentPos = yawObject.position;
    
    // --- Sumbu X ---
    let nextX = currentPos.x + playerState.velocity.x * delta;
    if (checkCollision(nextX, currentPos.y, currentPos.z)) {
        // Tabrakan X: Hentikan velocity X (Sliding terjadi karena velocity Z tetap jalan)
        playerState.velocity.x = 0;
        nextX = currentPos.x;
    }
    yawObject.position.x = nextX;

    // --- Sumbu Z ---
    let nextZ = currentPos.z + playerState.velocity.z * delta;
    if (checkCollision(currentPos.x, currentPos.y, nextZ)) {
        // Tabrakan Z: Hentikan velocity Z
        playerState.velocity.z = 0;
        nextZ = currentPos.z;
    }
    yawObject.position.z = nextZ;

    // --- Sumbu Y (Vertikal/Gravitasi) ---
    let nextY = currentPos.y + playerState.velocity.y * delta;
    
    if (playerState.velocity.y < 0) { // Sedang jatuh
        const floorY = checkFloor(yawObject.position.x, nextY, yawObject.position.z);
        if (floorY !== null) {
            // Mendarat
            const landingHeight = floorY + 0.5 + PLAYER.height;
            if (nextY <= landingHeight) {
                playerState.velocity.y = 0; // Hentikan jatuh
                nextY = landingHeight;
                playerState.onGround = true;
            }
        } else {
            playerState.onGround = false; // Melayang
        }
    } else if (playerState.velocity.y > 0) { // Sedang melompat naik
        // Cek tabrakan kepala (langit-langit)
        if (checkCollision(yawObject.position.x, nextY + 0.1, yawObject.position.z)) {
            playerState.velocity.y = 0; // Hentikan lompatan
            nextY = currentPos.y;
        }
        playerState.onGround = false; // Tidak di tanah saat naik
    }
    yawObject.position.y = nextY;

    // 5. VIEW BOBBING ADVANCE (GUNCANGAN KAMERA NATURAL)
    if (playerState.onGround && playerState.currentSpeedHorizontal > 0.1) {
        // Update walk cycle timer berdasarkan kecepatan jalan
        playerState.walkCycleTimer += playerState.currentSpeedHorizontal * CAMERA_BOB.frequency * delta;
        
        // Hitung osilasi sinusoidal
        const bobVertical = Math.sin(playerState.walkCycleTimer) * CAMERA_BOB.amplitudeVertical;
        const bobHorizontal = Math.cos(playerState.walkCycleTimer * 0.5) * CAMERA_BOB.amplitudeHorizontal; // Setengah frekuensi vertikal

        // Terapkan posisi bobbing relatif ke container kamera
        // Menggunakan lerp agar transisi guncangan mulus saat mulai/henti
        cameraContainer.position.y += bobVertical;
        cameraContainer.position.x = THREE.MathUtils.lerp(cameraContainer.position.x, bobHorizontal, CAMERA_BOB.smoothing);
    } else {
        // Kembali ke posisi netral (Lantai) jika berhenti/melayang
        cameraContainer.position.x = THREE.MathUtils.lerp(cameraContainer.position.x, 0, CAMERA_BOB.smoothing);
    }

    // Reset World (Void check)
    if (yawObject.position.y < -30) { yawObject.position.set(0, 15, 0); playerState.velocity.set(0, 0, 0); }
    
    // Update UI Coords (dibulatkan)
    coordsUI.innerText = `X: ${yawObject.position.x.toFixed(1)} | Y: ${yawObject.position.y.toFixed(1)} | Z: ${yawObject.position.z.toFixed(1)}`;

    prevTime = time;
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
animate();
