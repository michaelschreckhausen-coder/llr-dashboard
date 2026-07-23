-- P2: Präsenz-Tabellen (SSI, Profil-Checker) brand-scopen statt user/team.
-- Zugriff folgt dem Marken-Zugriff (has_brand_access) → geteilte Marke ist für
-- berechtigte Kollegen sichtbar; markenlose Alt-Zeilen (brand_voice_id NULL)
-- bleiben privat beim Ersteller. Keine Datenlücke zwischen den Ebenen.

-- ssi_scores
drop policy if exists ssi_scores_own on ssi_scores;
drop policy if exists ssi_brand on ssi_scores;
create policy ssi_brand on ssi_scores for all
  using      (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()))
  with check (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()));

-- profile_checks
drop policy if exists pc_own on profile_checks;
drop policy if exists pc_team_read on profile_checks;
drop policy if exists pc_brand on profile_checks;
create policy pc_brand on profile_checks for all
  using      (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()))
  with check (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()));

grant all on ssi_scores, profile_checks to authenticated;
notify pgrst, 'reload schema';
