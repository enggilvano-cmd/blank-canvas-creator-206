-- Criar tabela para configurações de backup automático
CREATE TABLE IF NOT EXISTS public.backup_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_backup_at TIMESTAMPTZ,
  next_backup_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Habilitar RLS
ALTER TABLE public.backup_schedules ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view their own backup schedules"
  ON public.backup_schedules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own backup schedules"
  ON public.backup_schedules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own backup schedules"
  ON public.backup_schedules FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own backup schedules"
  ON public.backup_schedules FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_backup_schedules_updated_at
  BEFORE UPDATE ON public.backup_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Criar bucket de storage para backups
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'backups',
  'backups',
  false,
  52428800, -- 50MB
  ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/json']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage
CREATE POLICY "Users can view their own backups"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'backups' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own backups"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'backups' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own backups"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'backups' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Tabela para histórico de backups
CREATE TABLE IF NOT EXISTS public.backup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('manual', 'scheduled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view their own backup history"
  ON public.backup_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert backup history"
  ON public.backup_history FOR INSERT
  WITH CHECK (true);

-- Índices
CREATE INDEX idx_backup_schedules_user_id ON public.backup_schedules(user_id);
CREATE INDEX idx_backup_schedules_next_backup ON public.backup_schedules(next_backup_at) WHERE is_active = true;
CREATE INDEX idx_backup_history_user_id ON public.backup_history(user_id, created_at DESC);