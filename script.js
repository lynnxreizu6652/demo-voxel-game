import * as THREE from 'three';
import { SimplexNoise } from 'simplex-noise';

const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const MAP_SIZE = 48; 

// ... (Masukkan sisa kode JavaScript kamu di sini sampai bagian animate() di bawah ini) ...

window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
animate();
