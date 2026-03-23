import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import Comments from './pages/Comments'
import Settings from './pages/Settings'
import BrandVoice from './pages/BrandVoice'
import Layout from './components/Layout'

export default function App() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])
  if (session === undefined) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#888' }}>Loading...</div>
  if (!session) return <Login />
  return (
    <Layout session={session}>
      <Routes>
        <Route path="/"            element={<Dashboard  session={session}/>}/>
        <Route path="/leads"       element={<Leads      session={session}/>}/>
        <Route path="/comments"    element={<Comments   session={session}/>}/>
        <Route path="/brand-voice" element={<BrandVoice session={session}/>}/>
        <Route path="/settings"    element={<Settings   session={session}/>}/>
        <Route path="*"            element={<Navigate to="/" replace/>}/>
      </Routes>
    </Layout>
  )
}
