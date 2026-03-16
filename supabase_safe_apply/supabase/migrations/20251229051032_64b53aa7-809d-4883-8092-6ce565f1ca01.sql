-- Add verification_notes column for reviewer comments
ALTER TABLE public.receipts 
ADD COLUMN IF NOT EXISTS verification_notes text;
-- Add comment explaining the column
COMMENT ON COLUMN public.receipts.verification_notes IS 'Notes from the reviewer when approving or rejecting the receipt';
