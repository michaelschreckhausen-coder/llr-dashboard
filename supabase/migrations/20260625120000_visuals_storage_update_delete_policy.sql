-- Fix: Der visuals-Storage-Bucket hatte nur SELECT + INSERT Policies.
-- uploadDesignRender() nutzt upsert:true mit festem Pfad (<team_id>/designs/<visual_id>.png).
-- Beim zweiten Speichern eines Designs wird daraus ein UPDATE auf storage.objects →
-- ohne UPDATE-Policy schlägt das mit "new row violates row-level security policy" fehl.
-- Ergänzt team-scoped UPDATE + DELETE analog zu visuals_storage_read/_write.

DROP POLICY IF EXISTS visuals_storage_update ON storage.objects;
CREATE POLICY visuals_storage_update ON storage.objects
  FOR UPDATE
  USING (
    (bucket_id = 'visuals')
    AND (((storage.foldername(name))[1])::uuid IN (
      SELECT team_members.team_id FROM team_members WHERE team_members.user_id = auth.uid()
    ))
  )
  WITH CHECK (
    (bucket_id = 'visuals')
    AND (((storage.foldername(name))[1])::uuid IN (
      SELECT team_members.team_id FROM team_members WHERE team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS visuals_storage_delete ON storage.objects;
CREATE POLICY visuals_storage_delete ON storage.objects
  FOR DELETE
  USING (
    (bucket_id = 'visuals')
    AND (((storage.foldername(name))[1])::uuid IN (
      SELECT team_members.team_id FROM team_members WHERE team_members.user_id = auth.uid()
    ))
  );
