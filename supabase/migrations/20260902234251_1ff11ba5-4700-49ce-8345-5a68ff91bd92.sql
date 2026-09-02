CREATE POLICY "case_evidence_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'case-evidence' AND public.has_business_access(((storage.foldername(name))[1])::uuid));

CREATE POLICY "case_evidence_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'case-evidence' AND public.has_business_access(((storage.foldername(name))[1])::uuid));

CREATE POLICY "case_evidence_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'case-evidence' AND public.has_business_access(((storage.foldername(name))[1])::uuid));