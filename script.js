import * as THREE from 'three';
import { SimplexNoise } from 'simplex-noise';

// --- KONFIGURASI FISIKA SUPER SMOOTH ---
const PLAYER = {
    height: 1.7,         
    eyeHeight: 1.6,      
    radius: 0.35,        
    
    speed: 7.5,             // Kecepatan lari maksimal
    smoothnessGround: 12.0, // Momentum di tanah (semakin kecil = semakin licin/ngedrift)
    smoothnessAir: 3.5,     // Momentum di udara (sulit ganti arah saat melayang)
    
    jumpForce: 10.5,        // Kekuatan lompat
    gravity: 28.0,          // Gravitasi
    terminalVelocity: 50,   // Kecepatan jatuh maksimal
    maxJumps: 2             // MENGAKTIFKAN DOUBLE JUMP!
};

const CAMERA_BOB = {
    frequency: 12.0,        
    amplitudeVertical: 0.06, 
    amplitudeHorizontal: 0.03, 
    smoothing: 0.1        
};

const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const MAP_SIZE = 64; 

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 30, 70);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const cameraContainer = new THREE.Object3D(); 
cameraContainer.add(camera);

const pitchObject = new THREE.Object3D(); 
pitchObject.add(cameraContainer); 

const yawObject = new THREE.Object3D(); 
yawObject.position.set(0, 15, 0); 
yawObject.add(pitchObject);
scene.add(yawObject);

const ui = document.getElementById('ui');
const crosshair = document.getElementById('crosshair');
const coordsUI = document.getElementById('coords');
let gameActive = false;

if (isTouchDevice) { document.getElementById('dpad').style.display = 'grid'; document.getElementById('jump-btn').style.display = 'flex'; }

ui.addEventListener('click', () => {
    if (!isTouchDevice) document.body.requestPointerLock();
    else { gameActive = true; ui.style.display = 'none'; crosshair.style.display = 'block'; }
});

document.addEventListener('pointerlockchange', () => {
    gameActive = document.pointerLockElement === document.body;
    ui.style.display = gameActive ? 'none' : 'block';
    crosshair.style.display = gameActive ? 'block' : 'none';
});

const PI_2 = Math.PI / 2;
document.addEventListener('mousemove', (event) => {
    if (gameActive && !isTouchDevice) {
        yawObject.rotation.y -= event.movementX * 0.002;
        pitchObject.rotation.x -= event.movementY * 0.002;
        pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, pitchObject.rotation.x));
    }
});

let moveState = { forward: false, backward: false, left: false, right: false };
const playerState = {
    onGround: false,
    velocity: new THREE.Vector3(),
    walkCycleTimer: 0,
    jumpCount: 0,       // Menghitung jumlah lompatan
    jumpQueue: false,
    jumpPressed: false  // Mencegah lompat terus-terusan jika spasi ditahan
};

const onKeyDown = (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space': 
            if (!playerState.jumpPressed) {
                playerState.jumpQueue = true; 
                playerState.jumpPressed = true;
            }
            break;
    }
};
const onKeyUp = (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyD': moveState.right = false; break;
        case 'Space': playerState.jumpPressed = false; break;
    }
};
document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0)); 
const dirLight = new THREE.DirectionalLight(0xffffff, 0.7); dirLight.position.set(15, 30, 15); scene.add(dirLight);

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

for (let x = 0; x < MAP_SIZE; x++) {
    for (let z = 0; z < MAP_SIZE; z++) {
        const surfaceY = Math.floor((simplex.noise2D(x * 0.08, z * 0.08) + 1) * 3) - 5; 
        const worldX = x - MAP_SIZE/2; const worldZ = z - MAP_SIZE/2;

        for (let y = surfaceY - 4; y <= surfaceY; y++) {
            addBlock(new THREE.Mesh(boxGeo, (y === surfaceY) ? grassMat : (y > surfaceY - 2) ? dirtMat : stoneMat), worldX, y, worldZ);
        }
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

const halfRadius = PLAYER.radius;

// Diperbarui: Mencegah hitbox menabrak lantai saat berjalan (Penyebab Tersendat)
function checkCollision(nx, ny, nz) {
    const minX = Math.floor(nx - halfRadius + 0.5); const maxX = Math.floor(nx + halfRadius + 0.5);
    const minY = Math.floor(ny - PLAYER.height + 0.6 + 0.5); // NAIKKAN BATAS BAWAH (+0.6) AGAR TIDAK MENGGESEK LANTAI
    const maxY = Math.floor(ny + 0.1 + 0.5); 
    const minZ = Math.floor(nz - halfRadius + 0.5); const maxZ = Math.floor(nz + halfRadius + 0.5);

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                if (worldBlocks.has(`${x},${y},${z}`)) return true;
            }
        }
    }
    return false;
}

function checkFloor(nx, ny, nz) {
    const minX = Math.floor(nx - (halfRadius * 0.8) + 0.5); const maxX = Math.floor(nx + (halfRadius * 0.8) + 0.5);
    const minZ = Math.floor(nz - (halfRadius * 0.8) + 0.5); const maxZ = Math.floor(nz + (halfRadius * 0.8) + 0.5);
    const blockY = Math.floor(ny - PLAYER.height + 0.5); 

    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            if (worldBlocks.has(`${x},${blockY},${z}`)) return blockY;
        }
    }
    return null;
}

const inputDirection = new THREE.Vector3();
let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    if (!gameActive) { prevTime = performance.now(); renderer.render(scene, camera); return; }

    const time = performance.now();
    let delta = (time - prevTime) / 1000;
    if (delta > 0.1) delta = 0.1; // Mencegah glitch fisika jika nge-lag

    cameraContainer.position.y = PLAYER.eyeHeight;

    // 1. INPUT
    inputDirection.set(0, 0, 0);
    if (moveState.forward) inputDirection.z -= 1;
    if (moveState.backward) inputDirection.z += 1;
    if (moveState.left) inputDirection.x -= 1;
    if (moveState.right) inputDirection.x += 1;
    inputDirection.normalize(); 
    inputDirection.applyEuler(new THREE.Euler(0, yawObject.rotation.y, 0));

    // 2. MOMENTUM (LERP SANGAT HALUS)
    const targetVelocityX = inputDirection.x * PLAYER.speed;
    const targetVelocityZ = inputDirection.z * PLAYER.speed;
    const smoothness = playerState.onGround ? PLAYER.smoothnessGround : PLAYER.smoothnessAir;

    playerState.velocity.x = THREE.MathUtils.lerp(playerState.velocity.x, targetVelocityX, smoothness * delta);
    playerState.velocity.z = THREE.MathUtils.lerp(playerState.velocity.z, targetVelocityZ, smoothness * delta);

    // 3. GRAVITASI & DOUBLE JUMP
    playerState.velocity.y -= PLAYER.gravity * delta; 
    if (playerState.velocity.y < -PLAYER.terminalVelocity) playerState.velocity.y = -PLAYER.terminalVelocity;

    if (playerState.jumpQueue) {
        // Cek apakah sisa lompatan masih ada (Double Jump!)
        if (playerState.jumpCount < PLAYER.maxJumps) {
            playerState.velocity.y = PLAYER.jumpForce; 
            playerState.jumpCount++;
            playerState.onGround = false;
        }
        playerState.jumpQueue = false; // Reset antrean tombol
    }

    // 4. TABRAKAN HORIZONTAL (SLIDING)
    const currentPos = yawObject.position;
    
    let nextX = currentPos.x + playerState.velocity.x * delta;
    if (checkCollision(nextX, currentPos.y, currentPos.z)) {
        playerState.velocity.x = 0;
        nextX = currentPos.x;
    }
    yawObject.position.x = nextX;

    let nextZ = currentPos.z + playerState.velocity.z * delta;
    if (checkCollision(currentPos.x, currentPos.y, nextZ)) {
        playerState.velocity.z = 0;
        nextZ = currentPos.z;
    }
    yawObject.position.z = nextZ;

    // 5. TABRAKAN VERTIKAL
    let nextY = currentPos.y + playerState.velocity.y * delta;
    
    if (playerState.velocity.y < 0) { 
        const floorY = checkFloor(yawObject.position.x, nextY, yawObject.position.z);
        if (floorY !== null) {
            const landingHeight = floorY + 0.5 + PLAYER.height;
            if (nextY <= landingHeight) {
                playerState.velocity.y = 0; 
                nextY = landingHeight;
                playerState.onGround = true;
                playerState.jumpCount = 0; // Reset Double Jump saat menyentuh tanah!
            }
        } else {
            playerState.onGround = false; 
            // Jika jatuh dari tebing tanpa melompat, anggap sudah menghabiskan 1 lompatan
            if (playerState.jumpCount === 0) playerState.jumpCount = 1; 
        }
    } else if (playerState.velocity.y > 0) { 
        if (checkCollision(yawObject.position.x, nextY + 0.1, yawObject.position.z)) {
            playerState.velocity.y = 0; // Nabrak atap
            nextY = currentPos.y;
        }
        playerState.onGround = false; 
    }
    yawObject.position.y = nextY;

    // 6. VIEW BOBBING (Guncangan natural)
    const horizontalSpeed = Math.sqrt(playerState.velocity.x**2 + playerState.velocity.z**2);
    if (playerState.onGround && horizontalSpeed > 0.5) {
        playerState.walkCycleTimer += horizontalSpeed * CAMERA_BOB.frequency * delta;
        cameraContainer.position.y += Math.sin(playerState.walkCycleTimer) * CAMERA_BOB.amplitudeVertical;
        cameraContainer.position.x = THREE.MathUtils.lerp(cameraContainer.position.x, Math.cos(playerState.walkCycleTimer * 0.5) * CAMERA_BOB.amplitudeHorizontal, CAMERA_BOB.smoothing);
    } else {
        cameraContainer.position.x = THREE.MathUtils.lerp(cameraContainer.position.x, 0, CAMERA_BOB.smoothing);
    }

    if (yawObject.position.y < -30) { yawObject.position.set(0, 15, 0); playerState.velocity.set(0, 0, 0); }
    coordsUI.innerText = `X: ${yawObject.position.x.toFixed(1)} | Y: ${yawObject.position.y.toFixed(1)} | Z: ${yawObject.position.z.toFixed(1)}`;

    prevTime = time;
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
animate();
