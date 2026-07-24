-- „LinkedIn-Automatisierung"-Addon umwidmen: es ist die Abrechnungs-Hülle für eine
-- ZUSÄTZLICHE LinkedIn-Verknüpfung (alles läuft über Unipile, nicht nur Automatisierung).
-- Slug bleibt 'automation' (Billing/Allowance/Stripe hängen daran).
UPDATE public.addons SET
  name = 'Zusätzliche LinkedIn-Verknüpfung',
  price_monthly_cents = 599,
  short_description = 'Jede weitere LinkedIn-Anbindung 5,99 €/Monat — serverseitig über Unipile (Analyse, Nachrichten, Vernetzung, Content).',
  long_description = 'Deine Lizenz enthält 1 LinkedIn-Verknüpfung. Buche pro weiterem LinkedIn-Profil eine zusätzliche Anbindung für 5,99 €/Monat. Läuft komplett serverseitig über Unipile — ganz ohne Browser-Extension.'
WHERE slug = 'automation';
