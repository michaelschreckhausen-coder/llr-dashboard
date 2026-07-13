// src/components/LeadPicker.jsx
//
// Autocomplete-Picker für Leads — analog zu OrganizationPicker, aber OHNE
// "Neu anlegen"-Option (Lead-Anlegen geschieht via NewLeadModal auf /leads,
// hat eigenes Multi-Field-Formular).
//
// Verwendung: NewTaskModal auf /aufgaben für optionale Lead-Verknüpfung.
//
// Props:
//   value      — lead_id (uuid oder null)
//   valueName  — Anzeigename als Initial-Display vor Auswahl
//   onChange   — (leadId|null, leadDisplayName|null) => void
//   placeholder, disabled, allowClear (default true)

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useTeam } from '../context/TeamContext';

const PRIMARY = 'var(--wl-primary, #0A6FB0)';

function leadDisplay(lead) {
  if (!lead) return '';
  const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.name || '—';
  return lead.company ? `${name} · ${lead.company}` : name;
}

export default function LeadPicker({ value, valueName, onChange, placeholder, disabled, allowClear = true }) {
  const { activeTeamId } = useTeam();
  const [query, setQuery] = useState('');
  const [display, setDisplay] = useState('');
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  // Initial display: lade Lead bei gegebener ID
  useEffect(() => {
    let cancelled = false;
    async function loadSelected() {
      if (!value) { setDisplay(valueName || ''); return; }
      const { data } = await supabase
        .from('leads')
        .select('id, first_name, last_name, name, company')
        .eq('id', value)
        .maybeSingle();
      if (!cancelled && data) setDisplay(leadDisplay(data));
    }
    loadSelected();
    return () => { cancelled = true; };
  }, [value, valueName]);

  // Search beim Tippen
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      let q = supabase
        .from('leads')
        .select('id, first_name, last_name, name, company, email')
        .eq('archived', false)
        .order('updated_at', { ascending: false })
        .limit(20);
      if (activeTeamId) q = q.eq('team_id', activeTeamId);
      const term = query.trim();
      if (term) {
        // Multi-Field-OR-Search auf first_name / last_name / company / email
        q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%`);
      }
      const { data, error } = await q;
      if (error) console.warn('[LeadPicker] search failed:', { error: error.message, activeTeamId, query: term });
      if (!cancelled) setOptions(data || []);
      setLoading(false);
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open, activeTeamId]);

  // Click außerhalb → schließen
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const selectLead = (lead) => {
    setDisplay(leadDisplay(lead));
    setQuery('');
    setOpen(false);
    onChange?.(lead.id, leadDisplay(lead));
  };

  const clearLead = () => {
    setDisplay('');
    setQuery('');
    onChange?.(null, null);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          value={open ? query : display}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          placeholder={placeholder || 'Kontakt suchen (optional)…'}
          style={{
            flex: 1, padding: '8px 12px',
            border: '1.5px solid #E4E7EC', borderRadius: 10,
            fontSize: 13, outline: 'none', background: 'var(--surface)',
            color: 'var(--text-primary, #111827)',
          }}
        />
        {display && allowClear && !disabled && (
          <button className="lk-btn lk-btn-ghost" type="button" onClick={clearLead}
            >
            ×
          </button>
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid #E4E7EC', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)', zIndex: 500, maxHeight: 280, overflowY: 'auto',
        }}>
          {loading && <div style={{ padding: 12, fontSize: 12, color: '#9CA3AF' }}>Suche…</div>}
          {!loading && options.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: '#9CA3AF' }}>
              {query.trim() ? 'Keine Treffer' : 'Tippen um Kontakte zu suchen'}
            </div>
          )}
          {options.map(o => {
            const name = `${o.first_name || ''} ${o.last_name || ''}`.trim() || o.name || '—';
            return (
              <button key={o.id} type="button" onClick={() => selectLead(o)}
                style={{ display: 'block', width: '100%', textAlign: 'left',
                  padding: '9px 12px', border: 'none', borderBottom: '1px solid #F3F4F6',
                  background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#111827' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <div style={{ fontWeight: 600 }}>{name}</div>
                {(o.company || o.email) && (
                  <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                    {[o.company, o.email].filter(Boolean).join(' · ')}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
