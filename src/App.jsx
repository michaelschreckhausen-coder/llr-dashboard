import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import Comments from './pages/Comments'
import Settings from './pages/Settings'
import BrandVoice from './pages/BrandVoice'
import AdminUsers from './pages/AdminUsers'
import Layout from './components/Layout'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [role,    setRole]    = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) fetchRole()
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s)
      if (s) fetchRole(); else setRole(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchRole() {
    const { data } = await supabase.rpc('get_my_role')
    setRole(data || 'user')
  }

  if (session === undefined || (session && role === null))
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#888' }}>Loading…</div>

  if (!session) return <Login />

  return (
    <Layout session={session} role={role}>
      <Routes>
        <Route path="/"           element={<Dashboard  session={session} />} />
        <Route path="/leads"      element={<Leads      session={session} />} />
        <Route path="/comments"   element={<Comments   session={session} />} />
        <Route path="/brand-voice"element={<BrandVoice session={session} />} />
        <Route path="/settings"   element={<Settings   session={session} />} />
        {role === 'admin' && (
          <Route path="/admin/users" element={<AdminUsers session={session} />} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
