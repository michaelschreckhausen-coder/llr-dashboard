-- 20260629320000_affiliate_marketing_assets_seeds.sql
-- Affiliate-System Phase 9 — Initial-Text-Asset-Seeds. {{code}} → Affiliate-Code
-- (Frontend interpoliert live). Banner-Bilder NICHT geseedet (Admin-Upload via UI).
-- Idempotent: nur einfügen wenn (kind,title_de) noch nicht existiert.

BEGIN;

INSERT INTO public.affiliate_marketing_assets (kind, title_de, title_en, description_de, description_en, content_de, content_en, sort_order)
SELECT v.* FROM (VALUES
  -- social_caption (5)
  ('social_caption', 'LinkedIn-Post Empfehlung', 'LinkedIn recommendation post',
   'Längerer Post für dein LinkedIn-Profil', 'Longer post for your LinkedIn feed',
   'Ich arbeite seit einer Weile mit Leadesk für LinkedIn-Leadgenerierung & CRM — und bin überzeugt. Wenn du deinen Vertrieb auf LinkedIn skalieren willst, schau es dir an:' || E'\n' || 'https://app.leadesk.de/signup?ref={{code}}',
   'I''ve been using Leadesk for LinkedIn lead generation & CRM for a while now — and I''m sold. If you want to scale your LinkedIn sales, check it out:' || E'\n' || 'https://app.leadesk.de/signup?ref={{code}}', 10),
  ('social_caption', 'Twitter/X-Post Kurz', 'Twitter/X short post',
   'Knackiger Tweet', 'Punchy tweet',
   'LinkedIn-Vertrieb + CRM in einem Tool. Spart mir jede Woche Stunden. 👉 https://app.leadesk.de/signup?ref={{code}}',
   'LinkedIn sales + CRM in one tool. Saves me hours every week. 👉 https://app.leadesk.de/signup?ref={{code}}', 20),
  ('social_caption', 'Instagram-Caption (Story)', 'Instagram caption (story)',
   'Für Story/Post mit Link-Sticker', 'For story/post with link sticker',
   'Mein Geheimtipp für LinkedIn-Leads & CRM: Leadesk. Link in Bio / Sticker → ref-Code {{code}} 🚀',
   'My secret weapon for LinkedIn leads & CRM: Leadesk. Link in bio / sticker → ref code {{code}} 🚀', 30),
  ('social_caption', 'Email-Signatur Inline', 'Email signature inline',
   'Eine Zeile für deine Mail-Signatur', 'One line for your email signature',
   'PS: Ich empfehle Leadesk für LinkedIn-Vertrieb → https://app.leadesk.de/signup?ref={{code}}',
   'PS: I recommend Leadesk for LinkedIn sales → https://app.leadesk.de/signup?ref={{code}}', 40),
  ('social_caption', 'Slack/WhatsApp-Empfehlung', 'Slack/WhatsApp recommendation',
   'Direkte 1:1-Empfehlung', 'Direct 1:1 recommendation',
   'Hey, du wolltest doch deinen LinkedIn-Vertrieb aufbauen — schau dir Leadesk an, nutze ich selbst: https://app.leadesk.de/signup?ref={{code}}',
   'Hey, you wanted to build out your LinkedIn sales — check out Leadesk, I use it myself: https://app.leadesk.de/signup?ref={{code}}', 50),
  -- email_snippet (2)
  ('email_snippet', 'Newsletter-Banner-Block', 'Newsletter banner block',
   'HTML-Block für deinen Newsletter', 'HTML block for your newsletter',
   '<div style="border:1px solid #E5E7EB;border-radius:10px;padding:16px;font-family:sans-serif"><strong>Mein Tool-Tipp: Leadesk</strong><br/>LinkedIn-Leadgenerierung &amp; CRM in einem. <a href="https://app.leadesk.de/signup?ref={{code}}">Jetzt testen →</a></div>',
   '<div style="border:1px solid #E5E7EB;border-radius:10px;padding:16px;font-family:sans-serif"><strong>My tool tip: Leadesk</strong><br/>LinkedIn lead gen &amp; CRM in one. <a href="https://app.leadesk.de/signup?ref={{code}}">Try it now →</a></div>', 10),
  ('email_snippet', 'Empfehlung-Mail-Body', 'Recommendation email body',
   'Kompletter Mail-Text zum Anpassen', 'Full email body to adapt',
   'Hallo,' || E'\n\n' || 'falls du deinen LinkedIn-Vertrieb professionalisieren willst: ich nutze Leadesk (Leadgenerierung + CRM + KI) und kann es klar empfehlen. Über meinen Link bekommst du direkt Zugang:' || E'\n' || 'https://app.leadesk.de/signup?ref={{code}}' || E'\n\n' || 'Viele Grüße',
   'Hi,' || E'\n\n' || 'if you want to professionalize your LinkedIn sales: I use Leadesk (lead gen + CRM + AI) and can clearly recommend it. Get access via my link:' || E'\n' || 'https://app.leadesk.de/signup?ref={{code}}' || E'\n\n' || 'Best regards', 20),
  -- youtube_description (1)
  ('youtube_description', 'Standard YouTube-Description', 'Standard YouTube description',
   'Für die Videobeschreibung', 'For the video description',
   '🔧 Das Tool aus dem Video: Leadesk — LinkedIn-Vertrieb, CRM & KI in einem.' || E'\n' || '➡️ Jetzt testen: https://app.leadesk.de/signup?ref={{code}}' || E'\n\n' || '(Affiliate-Link — du unterstützt den Kanal ohne Mehrkosten.)',
   '🔧 The tool from the video: Leadesk — LinkedIn sales, CRM & AI in one.' || E'\n' || '➡️ Try it now: https://app.leadesk.de/signup?ref={{code}}' || E'\n\n' || '(Affiliate link — you support the channel at no extra cost.)', 10)
) AS v(kind, title_de, title_en, description_de, description_en, content_de, content_en, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.affiliate_marketing_assets a WHERE a.kind = v.kind AND a.title_de = v.title_de
);

COMMIT;
