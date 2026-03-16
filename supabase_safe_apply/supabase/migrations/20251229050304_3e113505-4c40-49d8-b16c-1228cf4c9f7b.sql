-- Create storage bucket for receipt files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
);
-- Allow authenticated users to upload their own receipts
CREATE POLICY "Users can upload receipts"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'receipts' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);
-- Allow users to view their own receipts
CREATE POLICY "Users can view their own receipts"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'receipts' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_finance_access(auth.uid())
    OR is_admin(auth.uid())
  )
);
-- Allow users to update their own receipts
CREATE POLICY "Users can update their own receipts"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'receipts' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_finance_access(auth.uid())
  )
);
-- Allow admins to delete receipts
CREATE POLICY "Admins can delete receipts"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'receipts' 
  AND is_admin(auth.uid())
);
