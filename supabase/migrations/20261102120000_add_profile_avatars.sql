-- Foto de perfil: bucket público de leitura, com escrita restrita à pasta do próprio usuário

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Users can view their own avatar files" ON storage.objects
FOR SELECT TO authenticated
USING ((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));

CREATE POLICY "Users can upload their own avatar files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK ((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));

CREATE POLICY "Users can delete their own avatar files" ON storage.objects
FOR DELETE TO authenticated
USING ((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));

-- profiles não tem policy de UPDATE para o próprio usuário, pois a linha guarda
-- trial_expires_at e subscription_expires_at. Esta função altera apenas o avatar.
CREATE OR REPLACE FUNCTION public.update_own_avatar(p_avatar_url text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_avatar_url IS NOT NULL
     AND p_avatar_url !~ ('^https?://[^/]+/storage/v1/object/public/avatars/' || v_user_id::text || '/[^/?#]+$') THEN
    RAISE EXCEPTION 'Invalid avatar URL';
  END IF;

  UPDATE public.profiles
  SET avatar_url = p_avatar_url
  WHERE user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_avatar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_own_avatar(text) TO authenticated;
