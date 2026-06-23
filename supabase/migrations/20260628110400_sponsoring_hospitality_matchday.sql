-- ============================================================================
-- Phase 5 / Hospitality: Saison-/Spieltag-Ebene + Kapazitaets-Freigabe + Upload
-- ----------------------------------------------------------------------------
-- Feedback Kap. 13.7: Event-Datum -> Saison + Spiel-Ebene; Umrechnung Kapazitaet
-- auf Spieltag + Freigabe von Zusatzkapazitaeten; Bild-Upload Loge/Business-Seat.
-- 'capacity' (phase2) bleibt = Saison-Grundkapazitaet. Idempotent.
-- ============================================================================

begin;

alter table sponsoring.hospitality_assets add column if not exists season             text;
alter table sponsoring.hospitality_assets add column if not exists matchday           text;       -- z.B. "Spieltag 12 vs. ..."
alter table sponsoring.hospitality_assets add column if not exists matchday_capacity  int;        -- auf Spieltag umgerechnet
alter table sponsoring.hospitality_assets add column if not exists extra_capacity     int not null default 0;
alter table sponsoring.hospitality_assets add column if not exists extra_capacity_approved boolean not null default false;
alter table sponsoring.hospitality_assets add column if not exists image_path         text;       -- Bucket 'sponsoring-hospitality'

-- abgeleitete verfuegbare Spieltag-Kapazitaet (nur freigegebene Zusatzkapazitaet zaehlt)
drop view if exists sponsoring.v_hospitality_matchday;
create view sponsoring.v_hospitality_matchday
  with (security_invoker = true)
as
select a.id,
       a.team_id,
       a.name,
       a.season,
       a.matchday,
       coalesce(a.matchday_capacity, a.capacity) as base_matchday_capacity,
       case when a.extra_capacity_approved then a.extra_capacity else 0 end as approved_extra,
       coalesce(a.matchday_capacity, a.capacity)
         + case when a.extra_capacity_approved then a.extra_capacity else 0 end as effective_capacity
from sponsoring.hospitality_assets a;

grant select on sponsoring.v_hospitality_matchday to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
