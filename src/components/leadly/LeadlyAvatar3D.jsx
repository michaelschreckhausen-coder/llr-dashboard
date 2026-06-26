// src/components/leadly/LeadlyAvatar3D.jsx
//
// Selbstgebauter, EU-only 3D-Avatar für Leadly (Phase 2, In-House-Weg).
// Ein per Three.js-Code gebauter, stilisierter "blauer" Kopf — kein externes
// Modell, kein US-Dienst. Lippen-/Mundbewegung wird über die prop `speaking`
// getrieben: idle = Blinzeln + sanftes Wippen, speaking = Sprech-Mundanimation.
//
// `speaking` wird in der Bühne aus dem globalen `leadly:speaking`-Event gesetzt,
// das der TTS-Hook (1B, Azure-Stimme) beim Start/Ende der Wiedergabe feuert —
// der Mund bewegt sich also synchron dazu, wann Leadly real spricht.
//
// Upgrade-Pfad (später): echte Viseme-Lip-Sync via speech-token-EF + Azure
// JS-SDK → präzise Mundformen statt Sprech-Simulation. Geometrie bleibt gleich.

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function LeadlyAvatar3D({ speaking = false }) {
  const wrapRef = useRef(null);
  const speakingRef = useRef(speaking);

  useEffect(() => { speakingRef.current = speaking; }, [speaking]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let W = wrap.clientWidth || 240;
    let H = wrap.clientHeight || 320;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
    camera.position.set(0, 0.06, 3.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    wrap.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xb9c6ff, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 1.05); key.position.set(2.2, 3, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0x6f8cff, 0.7); rim.position.set(-3, 1.5, -2); scene.add(rim);

    const BRAND = 0x315ae7, DARK = 0x14225e;
    const head = new THREE.Group(); scene.add(head);
    const M = (c, r, extra) => new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.6 : r, ...(extra || {}) });

    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), M(BRAND, 0.42, { metalness: 0.05 }));
    skull.scale.set(0.96, 1.06, 0.92); head.add(skull);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.99, 48, 48), M(0x4d74ff, 0.35, { transparent: true, opacity: 0.35 }));
    glow.scale.set(0.9, 1.0, 0.86); glow.position.z = 0.04; head.add(glow);

    const makeEye = (x) => {
      const g = new THREE.Group();
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.135, 32, 32), M(0xffffff, 0.25));
      white.scale.set(1, 1, 0.6);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.066, 24, 24), M(DARK, 0.2));
      pupil.position.set(0, 0, 0.09);
      g.add(white); g.add(pupil);
      g.position.set(x, 0.16, 0.80); head.add(g);
      return g;
    };
    const eyeL = makeEye(-0.32), eyeR = makeEye(0.32);

    [-1, 1].forEach((s) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.06), M(DARK, 0.4));
      b.position.set(s * 0.31, 0.40, 0.83); head.add(b);
    });

    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.22, 40, 28), M(0x0c1640, 0.5));
    mouth.position.set(0, -0.40, 0.80); mouth.scale.set(0.62, 0.06, 0.5); head.add(mouth);
    const lips = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 16, 40), M(0x24347a, 0.4));
    lips.position.set(0, -0.40, 0.80); lips.scale.set(0.7, 0.5, 0.6); head.add(lips);

    // Lip-Sync-Sim (bis echte Visemes angebunden sind)
    const visemes = [
      { o: 0.06, w: 0.60 }, { o: 0.34, w: 0.52 }, { o: 0.20, w: 0.74 },
      { o: 0.30, w: 0.46 }, { o: 0.12, w: 0.66 }, { o: 0.24, w: 0.58 },
    ];
    let cur = { o: 0.06, w: 0.60 }, tgt = { o: 0.06, w: 0.60 };
    let nextViseme = 0, blinkT = 1.2 + Math.random() * 2.5, blink = 0;

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const now = performance.now();

      head.position.y = Math.sin(now * 0.0012) * 0.025;
      head.rotation.y = Math.sin(now * 0.0007) * 0.10;
      head.rotation.x = Math.sin(now * 0.0009) * 0.04;

      blinkT -= dt;
      if (blinkT <= 0) { blink = 1; blinkT = 2.2 + Math.random() * 3.0; }
      blink = Math.max(0, blink - dt * 7);
      const eyeSy = 1 - 0.92 * blink;
      eyeL.scale.y = eyeSy; eyeR.scale.y = eyeSy;

      if (speakingRef.current) {
        if (now >= nextViseme) {
          tgt = visemes[1 + Math.floor(Math.random() * (visemes.length - 1))];
          nextViseme = now + (70 + Math.random() * 70);
        }
      } else {
        tgt = { o: 0.06, w: 0.60 };
      }
      cur.o += (tgt.o - cur.o) * Math.min(1, dt * 18);
      cur.w += (tgt.w - cur.w) * Math.min(1, dt * 18);
      mouth.scale.set(cur.w, Math.max(0.05, cur.o), 0.5);
      lips.scale.set(cur.w * 1.12, Math.max(0.18, cur.o * 1.5 + 0.16), 0.6);

      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      W = wrap.clientWidth || W; H = wrap.clientHeight || H;
      if (!W || !H) return;
      camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(wrap);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { Array.isArray(o.material) ? o.material.forEach(m => m.dispose()) : o.material.dispose(); }
      });
      if (renderer.domElement.parentNode === wrap) wrap.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={wrapRef} style={{ width: '100%', height: '100%' }} aria-hidden="true" />;
}
