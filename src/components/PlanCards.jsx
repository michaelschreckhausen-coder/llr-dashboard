import React from 'react'

const PLANS = [
  {
    id:'free', name:'LinkedIn Suite Free', price:'0€', period:'/Monat',
    color:'var(--text-muted)', bg:'#F8FAFC', border:'#E2E8F0',
    features:[
      { label:'Bis zu 50 Leads', ok:true },
      { label:'10 Listen', ok:true },
      { label:'Pipeline', ok:false },
      { label:'Brand Voice', ok:false },
      { label:'Reports', ok:false },
      { label:'KI-Features', ok:false },
    ]
  },
  {
    id:'starter', name:'LinkedIn Suite Basic', price:'29€', period:'/Monat',
    color:'#0A66C2', bg:'#EFF6FF', border:'#BFDBFE', popular:true,
    wixUrl:'https://app.leadesk.de/pricing',
    features:[
      { label:'Bis zu 200 Leads', ok:true },
      { label:'20 Listen', ok:true },
      { label:'Pipeline', ok:true },
      { label:'Brand Voice', ok:true },
      { label:'Reports', ok:false },
      { label:'KI-Features', ok:false },
    ]
  },
  {
    id:'pro', name:'LinkedIn Suite Pro', price:'79€', period:'/Monat',
    color:'#8B5CF6', bg:'#F5F3FF', border:'#DDD6FE',
    wixUrl:'https://app.leadesk.de/pricing',
    features:[
      { label:'Bis zu 1000 Leads', ok:true },
      { label:'50 Listen', ok:true },
      { label:'Pipeline', ok:true },
      { label:'Brand Voice + KI', ok:true },
      { label:'Reports & Analytics', ok:true },
      { label:'KI-Features', ok:true },
    ]
  },
]

export default function PlanCards({ currentPlanId, periodEnd }) {
  return (
    <div style={{ background:'var(--surface)', borderRadius:16, border:'1px solid var(--border)', boxShadow:'0 1px 3px rgba(15,23,42,0.05)', overflow:'hidden' }}>
      <div style={{ padding:'16px 24px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontWeight:700, fontSize:15, color:'var(--text-strong)' }}>Abo & Plan</div>
        {periodEnd && (
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>
            {'gültig bis ' + new Date(periodEnd).toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' })}
          </span>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:0 }}>
        {PLANS.map((p, i) => {
          const isCurrent = currentPlanId === p.id
          return (
            <div key={p.id} style={{
              padding:'24px 20px',
              borderRight: i < 2 ? '1px solid #E2E8F0' : 'none',
              background: isCurrent ? p.bg : '#fff',
              position:'relative',
              transition:'all 0.2s',
            }}>
              {p.popular && (
                <div style={{ position:'absolute', top:12, right:12, fontSize:9, fontWeight:800, background:p.color, color:'#fff', padding:'2px 8px', borderRadius:999 }}>BELIEBT</div>
              )}
              {isCurrent && (
                <div style={{ position:'absolute', top:12, left:12, fontSize:9, fontWeight:800, background:p.color, color:'#fff', padding:'2px 8px', borderRadius:999 }}>AKTUELL</div>
              )}

              <div style={{ marginBottom:16, marginTop:isCurrent||p.popular?16:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:p.color, marginBottom:4 }}>{p.name}</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                  <span style={{ fontSize:28, fontWeight:900, color:'var(--text-strong)' }}>{p.price}</span>
                  <span style={{ fontSize:12, color:'var(--text-muted)' }}>{p.period}</span>
                </div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
                {p.features.map((f, fi) => (
                  <div key={fi} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color: f.ok ? '#0F172A' : '#CBD5E1' }}>
                    <span style={{ fontSize:14 }}>{f.ok ? '✓' : '✗'}</span>
                    <span style={{ fontWeight: f.ok ? 500 : 400 }}>{f.label}</span>
                  </div>
                ))}
              </div>

              {isCurrent ? (
                <div style={{ padding:'8px 0', textAlign:'center', fontSize:12, fontWeight:700, color:p.color }}>
                  ✓ Dein aktueller Plan
                </div>
              ) : p.wixUrl ? (
                <a href={p.wixUrl} target="_blank" rel="noreferrer"
                  style={{ display:'block', padding:'9px 0', textAlign:'center', borderRadius:999, background:p.color, color:'#fff', fontSize:12, fontWeight:700, textDecoration:'none', transition:'all 0.15s' }}>
                  Upgraden →
                </a>
              ) : (
                <div style={{ padding:'9px 0', textAlign:'center', fontSize:12, color:'#CBD5E1' }}>Kostenlos</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
