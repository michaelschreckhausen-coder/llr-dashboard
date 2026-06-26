// src/components/leadly/LeadlyAvatar3D.jsx
//
// Selbstgebauter, EU-only 3D-Avatar für Leadly (Phase 2, In-House-Weg).
// Stilisierter Roboter-Kopf im Leadly-Mascot-Stil (weißer Helm, große
// leuchtende Augen, Lächeln, Antennen mit Glow, Hex-Panel) — per Three.js-Code,
// kein externes Modell, kein US-Dienst. Farben aus dem Leadesk-Logo / Mascot.
//
// Lip-Sync: prop `speaking` (in der Bühne aus dem globalen `leadly:speaking`-
// Event gesetzt, das der TTS-Hook beim Start/Ende der Azure-Wiedergabe feuert) →
// Mund bewegt sich synchron, wann Leadly real spricht. Idle = Blinzeln + Wippen.
//
// Upgrade-Pfad: echtes Viseme-Lip-Sync via speech-token-EF + Azure JS-SDK.

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function LeadlyAvatar3D({ speaking = false }) {
  const wrapRef = useRef(null);
  const speakingRef = useRef(speaking);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let W = wrap.clientWidth || 160;
    let H = wrap.clientHeight || 160;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
    camera.position.set(0, 0.05, 5.3);
    camera.lookAt(0, 0.05, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    wrap.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xc8d6ee, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2.5, 3, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x4aa6e6, 0.8); rim.position.set(-3, 1, -2); scene.add(rim);

    // ── Leadly-Mascot-Palette (Logo / Referenz) ──
    const WHITE = 0xeef2f7, FACE = 0xc4d2e2, BLUE = 0x3f6aa6, NAVY = 0x16335c, TEAL = 0x2d6e7e, EYE = 0x35a9ff;
    const M = (c, r, e) => new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.4 : r, metalness: 0.15, ...(e || {}) });
    const glowMat = (c, i) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.28 });

    const head = new THREE.Group(); scene.add(head);

    // Helm (weiß, glänzend) + Gesichts-Panel (heller Blaugrau-Oval vorne)
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), M(WHITE, 0.28, { metalness: 0.2 }));
    helmet.scale.set(1.02, 1.0, 0.98); head.add(helmet);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.82, 48, 48), M(FACE, 0.5));
    face.scale.set(0.86, 0.92, 0.5); face.position.set(0, -0.04, 0.6); head.add(face);

    // Ohr-Pods seitlich
    [-1, 1].forEach((s) => {
      const e = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 28), M(WHITE, 0.3, { metalness: 0.2 }));
      e.rotation.z = Math.PI / 2; e.position.set(s * 1.0, -0.05, 0); head.add(e);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 20), M(BLUE, 0.4));
      c.rotation.z = Math.PI / 2; c.position.set(s * 1.05, -0.05, 0); head.add(c);
    });

    // Hex-Panel oben (Teal-Sechsecke)
    const hexPos = [[0, 1.0, 0.25, 0.22], [-0.32, 0.92, 0.2, 0.16], [0.32, 0.92, 0.2, 0.16], [0, 0.78, 0.55, 0.18], [-0.28, 0.72, 0.5, 0.13], [0.28, 0.72, 0.5, 0.13]];
    hexPos.forEach((p) => {
      const hx = new THREE.Mesh(new THREE.CylinderGeometry(p[3], p[3], 0.05, 6), M(TEAL, 0.45, { metalness: 0.1 }));
      hx.position.set(p[0], p[1], p[2]); hx.lookAt(p[0] * 2, p[1] * 1.6, p[2] + 1.2); head.add(hx);
    });

    // Antennen mit leuchtender Spitze
    [-1, 1].forEach((s) => {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 12), M(0x9fb0c4, 0.5));
      rod.position.set(s * 0.55, 0.95, 0.0); rod.rotation.z = s * 0.5; head.add(rod);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 18), glowMat(0x39c0ff, 1.2));
      tip.position.set(s * 0.74, 1.2, 0.0); head.add(tip);
    });

    // Große leuchtende Augen (+ Highlight), blinzelbar
    const makeEye = (x) => {
      const g = new THREE.Group();
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 32), new THREE.MeshStandardMaterial({ color: 0x2b7fd0, emissive: EYE, emissiveIntensity: 0.9, roughness: 0.25 }));
      o.scale.set(0.85, 1.15, 0.5);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), glowMat(0xffffff, 0.8));
      hl.position.set(0.05, 0.07, 0.12);
      g.add(o); g.add(hl); g.position.set(x, 0.08, 0.92); head.add(g);
      return g;
    };
    const eyeL = makeEye(-0.28), eyeR = makeEye(0.28);

    // Mund / Lächeln (animierbar)
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.12, 28, 20), M(NAVY, 0.4));
    mouth.position.set(0, -0.34, 0.94); mouth.scale.set(0.9, 0.18, 0.4); head.add(mouth);

    // Kleiner Hals/Kragen zur Erdung
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.22, 28), M(BLUE, 0.5));
    neck.position.set(0, -1.02, 0.1); head.add(neck);

    // Lip-Sync-Sim (bis echte Visemes angebunden sind)
    const visemes = [
      { o: 0.18, w: 0.9 }, { o: 0.55, w: 0.78 }, { o: 0.35, w: 1.05 },
      { o: 0.5, w: 0.7 }, { o: 0.22, w: 0.95 },
    ];
    let cur = { o: 0.18, w: 0.9 }, tgt = { o: 0.18, w: 0.9 };
    let nextViseme = 0, blinkT = 1.4 + Math.random() * 2.5, blink = 0;

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const now = performance.now();

      head.position.y = Math.sin(now * 0.0012) * 0.02;
      head.rotation.y = Math.sin(now * 0.0007) * 0.09;
      head.rotation.x = Math.sin(now * 0.0009) * 0.03;

      blinkT -= dt;
      if (blinkT <= 0) { blink = 1; blinkT = 2.4 + Math.random() * 3.0; }
      blink = Math.max(0, blink - dt * 8);
      const eyeSy = 1 - 0.85 * blink;
      eyeL.scale.y = eyeSy; eyeR.scale.y = eyeSy;

      if (speakingRef.current) {
        if (now >= nextViseme) {
          tgt = visemes[Math.floor(Math.random() * visemes.length)];
          nextViseme = now + (75 + Math.random() * 70);
        }
      } else {
        tgt = { o: 0.18, w: 0.9 };
      }
      cur.o += (tgt.o - cur.o) * Math.min(1, dt * 16);
      cur.w += (tgt.w - cur.w) * Math.min(1, dt * 16);
      mouth.scale.set(cur.w, Math.max(0.12, cur.o), 0.4);

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
