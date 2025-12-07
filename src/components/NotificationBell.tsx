import { useState, useEffect } from 'react';
import { Bell, X, AlertCircle, Info, BellRing, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useNotifications } from '@/hooks/useNotifications';
import { formatNotificationTime } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';
import { cleanupPushNotifications, getPushNotificationResourceStats } from '@/lib/pushNotifications';

export function NotificationBell() {
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    dismissNotification,
    clearAll,
    pushEnabled,
    isPushSupported,
    enablePushNotifications,
    disablePushNotifications,
  } = useNotifications();
  
  // Add cleanup on component unmount
  useEffect(() => {
    return () => {
      // Log resource usage for debugging
      const stats = getPushNotificationResourceStats();
      if (stats.activeContexts > 0) {
        logger.debug('NotificationBell unmounting, cleaning push resources:', stats);
        cleanupPushNotifications();
      }
    };
  }, []);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handlePushToggle = async (enabled: boolean) => {
    if (isLoading) return;
    setIsLoading(true);
    
    try {
      if (enabled) {
        const result = await enablePushNotifications();
        if (result.success) {
          toast({
            title: 'Notificações Push Ativadas',
            description: 'Você receberá notificações mesmo quando o app estiver fechado.',
          });
        } else {
          toast({
            title: 'Erro ao Ativar Notificações',
            description: `Não foi possível ativar as notificações push: ${result.error || 'Verifique as permissões.'}`,
            variant: 'destructive',
          });
        }
      } else {
        const success = await disablePushNotifications();
        if (success) {
          toast({
            title: 'Notificações Push Desativadas',
            description: 'Você não receberá mais notificações push.',
          });
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'reminder':
        return <Bell className="h-4 w-4" />;
      case 'alert':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'reminder':
        return 'text-primary';
      case 'alert':
        return 'text-warning';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative hover:bg-accent hover:text-accent-foreground hover:shadow-md hover:scale-105 transition-all duration-200 rounded-xl"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              variant="destructive"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notificações</h3>
          <div className="flex gap-2">
            {notifications.length > 0 && (
              <>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                    className="h-8 text-xs hover:bg-accent hover:text-accent-foreground hover:shadow-sm transition-all duration-200"
                  >
                    Marcar todas como lidas
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearAll}
                  className="h-8 w-8 hover:bg-accent hover:text-accent-foreground hover:shadow-sm transition-all duration-200 rounded-lg"
                  title="Limpar todas"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              className="h-8 w-8 hover:bg-accent hover:text-accent-foreground hover:shadow-sm transition-all duration-200 rounded-lg"
              title="Fechar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Push Notifications Toggle */}
        {isPushSupported && (
          <div className="flex items-center justify-between p-4 border-b bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2 flex-1">
              <BellRing className="h-4 w-4 text-primary" />
              <div className="flex flex-col flex-1">
                <Label htmlFor="push-notifications" className="cursor-pointer space-y-0.5">
                  <span className="text-sm font-medium block">Push Notifications</span>
                  <span className="text-xs text-muted-foreground font-normal block">
                    Receba alertas mesmo offline
                  </span>
                </Label>
              </div>
            </div>
            <Switch
              id="push-notifications"
              checked={pushEnabled}
              onCheckedChange={handlePushToggle}
              disabled={isLoading}
              className="data-[state=unchecked]:bg-muted data-[state=unchecked]:border data-[state=unchecked]:border-primary/50 ml-2"
            />
          </div>
        )}

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bell className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhuma notificação
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    'p-4 hover:bg-accent/50 hover:shadow-sm transition-all duration-200 cursor-pointer rounded-lg mx-2 my-1',
                    !notification.read && 'bg-muted/30'
                  )}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex gap-3">
                    <div className={cn('mt-1', getIconColor(notification.type))}>
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm">
                          {notification.title}
                        </p>
                        <div className="flex items-center gap-2">
                          {!notification.read && (
                            <div className="h-2 w-2 rounded-full bg-primary" />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 -mr-2 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissNotification(notification.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatNotificationTime(notification.date)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
