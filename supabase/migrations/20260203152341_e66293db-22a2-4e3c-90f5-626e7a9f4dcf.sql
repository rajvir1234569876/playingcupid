-- Add DELETE policy for participants to allow admins to remove spam responses
CREATE POLICY "Allow deletion of participants"
ON public.participants
FOR DELETE
USING (true);