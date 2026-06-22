// src/pages/Assistant.jsx
//
// Full-Screen-Variante von Leadly. Nutzt den gleichen useLeadly-Hook wie der
// globale Bubble — Chat-Verlauf ist 1:1 synchron. Diese Page macht Sinn als
// "Workshop"-View wenn man konzentriert mit Leadly arbeiten will (z.B. Bulk-
// Operationen via natural language, längere Recherchen).
//
// Refactored 2026-05-30: vorher 346 LOC mit eigenem fetch-Code gegen die
// 'generate'-Function ohne Tool-Use. Jetzt thin wrapper um <LeadlyPanel/>.

import React from 'react';
import LeadlyPanel from '../components/leadly/LeadlyPanel';
import { useLeadly } from '../hooks/useLeadly';

export default function Assistant() {
  const leadly = useLeadly();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 170px)', margin: '0 auto', width: '100%', maxWidth: 1040 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary, #111827)', margin: 0, marginBottom: 4, letterSpacing: '-0.02em' }}>
          Leadly
        </h1>
        <div style={{ fontSize: 13, color: '#6B7280' }}>
          Dein KI-Assistent. Frag nach heutigen Aufgaben, leg Kontakte und Deals an, ändere Status — alles in natürlicher Sprache.
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <LeadlyPanel leadly={leadly} embedded={true} onClose={() => {}} />
      </div>
    </div>
  );
}
