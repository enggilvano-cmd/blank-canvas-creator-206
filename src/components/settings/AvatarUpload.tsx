import { useRef, useState, type ChangeEvent } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/errorUtils';
import { AVATAR_BUCKET, getAvatarStoragePath, prepareAvatarImage } from '@/lib/avatarUtils';

interface AvatarUploadProps {
  userId: string;
  avatarUrl?: string;
  fallback: string;
  onChange: () => Promise<void>;
}

export function AvatarUpload({ userId, avatarUrl, fallback, onChange }: AvatarUploadProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const removeFile = async (path: string | null) => {
    if (!path) {return;}

    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    if (error) {
      logger.warn('Error removing avatar file:', error);
    }
  };

  const saveAvatarUrl = async (url: string | null) => {
    const { error } = await supabase.rpc('update_own_avatar', { p_avatar_url: url });
    if (error) {throw error;}
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // Permite escolher o mesmo arquivo novamente
    if (!file) {return;}

    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      const image = await prepareAvatarImage(file);
      const extension = image.type.split('/')[1] || 'webp';
      const path = `${userId}/${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, image, { contentType: image.type, cacheControl: '31536000' });
      if (uploadError) {throw uploadError;}
      uploadedPath = path;

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      await saveAvatarUrl(data.publicUrl);
      await removeFile(getAvatarStoragePath(avatarUrl));
      await onChange();

      toast({ title: 'Sucesso', description: 'Foto de perfil atualizada' });
    } catch (error) {
      logger.error('Error uploading avatar:', error);
      await removeFile(uploadedPath);
      toast({
        title: 'Erro',
        description: getErrorMessage(error) || 'Erro ao atualizar foto de perfil',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await saveAvatarUrl(null);
      await removeFile(getAvatarStoragePath(avatarUrl));
      await onChange();

      toast({ title: 'Sucesso', description: 'Foto de perfil removida' });
    } catch (error) {
      logger.error('Error removing avatar:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao remover foto de perfil',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={avatarUrl ? 'Alterar foto de perfil' : 'Adicionar foto de perfil'}
        className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait"
      >
        <Avatar className="h-16 w-16 sm:h-20 sm:w-20">
          <AvatarImage src={avatarUrl} className="object-cover" />
          <AvatarFallback className="text-lg sm:text-xl">{fallback}</AvatarFallback>
        </Avatar>
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white">
            <Loader2 className="h-5 w-5 animate-spin" />
          </span>
        ) : (
          <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow transition-transform group-hover:scale-110">
            <Camera className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleFileChange(event)}
      />

      {avatarUrl && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void handleRemove()}
          disabled={busy}
          className="h-7 px-2 text-xs text-muted-foreground"
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Remover
        </Button>
      )}
    </div>
  );
}
