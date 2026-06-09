// Resolved Lucide-Icon fuer TASK_SOURCES.iconName
// 8 mögliche Werte: clipboard, pencil, package, handshake, user, barchart, message, hourglass

import React from 'react'
import { ClipboardList, PenLine, Package, Handshake, User, BarChart3, MessageSquare, Hourglass } from 'lucide-react'

const MAP = {
  clipboard: ClipboardList,
  pencil:    PenLine,
  package:   Package,
  handshake: Handshake,
  user:      User,
  barchart:  BarChart3,
  message:   MessageSquare,
  hourglass: Hourglass,
}

export default function TaskSourceIcon({ name, size = 14, strokeWidth = 1.75, ...rest }) {
  const Cmp = MAP[name]
  if (!Cmp) return null
  return <Cmp size={size} strokeWidth={strokeWidth} {...rest} />
}
