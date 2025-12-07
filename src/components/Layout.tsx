import { Home, CreditCard, ArrowLeftRight, BarChart3, Settings, Tag, Users, LogOut, User, Receipt, Calendar } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOfflineAuth } from "@/hooks/useOfflineAuth";
import { NotificationBell } from "@/components/NotificationBell";
import { InstallPWA } from "@/components/InstallPWA";
import { useExpirationNotifications } from "@/hooks/useExpirationNotifications";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate?: (page: string) => void;
  onPageChange?: (page: string) => void;
  onClearAllData?: () => Promise<void>;
  loading?: boolean;
  dashboardHeaderCallbacks?: {
    onTransfer: () => void;
    onAddExpense: () => void;
    onAddIncome: () => void;
    onAddCreditExpense: () => void;
  };
}

const getFirstName = (fullName?: string | null) => {
  if (!fullName) return null;
  return fullName.split(' ')[0];
};

const menuItems = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "accounts", label: "Contas", icon: CreditCard },
  { id: "categories", label: "Categorias", icon: Tag },
  { id: "credit-bills", label: "Faturas de Cartão", icon: Receipt },
  { id: "transactions", label: "Transações", icon: ArrowLeftRight },
  { id: "fixed", label: "Planejamento", icon: Calendar },
  { id: "analytics", label: "Análises", icon: BarChart3 },
];

function AppSidebar({ currentPage, onPageChange }: { currentPage: string; onPageChange: (page: string) => void }) {
  const { profile, isAdmin, signOut, getSubscriptionTimeRemaining } = useOfflineAuth();
  const { state: sidebarState, setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();
  const isCollapsed = sidebarState === "collapsed";
  const timeRemaining = getSubscriptionTimeRemaining();

  const handlePageChange = (page: string) => {
    onPageChange(page);
    // Auto-close sidebar after selecting menu item on mobile only
    if (isMobile) {
      setOpenMobile(false);
    }
    // On desktop, keep sidebar expanded after menu selection
  };

  return (
    <Sidebar 
      className={cn(
        "transition-all duration-300 ease-out",
        isMobile 
          ? "fixed inset-y-0 left-0 w-[280px] max-w-[85vw] z-[70]" 
          : isCollapsed 
            ? "w-[72px] z-[70]" 
            : "w-56 lg:w-64 xl:w-72 z-[70]"
      )}
      collapsible={isMobile ? "offcanvas" : "icon"}
      variant={isMobile ? "floating" : "sidebar"}
    >
      <SidebarContent 
        className={cn(
          "backdrop-blur-xl border-r shadow-lg h-full bg-sidebar border-sidebar-border"
        )}
      >
        {/* Header - Responsive design */}
        <div className={cn(
          "border-b border-border/30 flex items-center justify-end",
          isMobile 
            ? "px-4 py-4" 
            : isCollapsed 
              ? "px-3 pt-6 pb-4" 
              : "px-4 pt-6 pb-4"
        )}>
          <SidebarTrigger className={cn(
            "hover:bg-accent hover:text-accent-foreground rounded-xl transition-all duration-200 hover:scale-105 hover:shadow-md",
            isMobile ? "h-8 w-8" : "h-9 w-9"
          )} />
        </div>

        <SidebarGroup>
          <SidebarGroupContent className={cn(
            isMobile 
              ? "px-4" 
              : isCollapsed 
                ? "px-0" 
                : "px-4"
          )}>
            <SidebarMenu className={cn(
              "space-y-2", 
              isCollapsed && !isMobile && "space-y-3 items-center"
            )}>
              {menuItems.map((item, index) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      onClick={() => handlePageChange(item.id)}
                      isActive={isActive}
                      className={cn(
                        "w-full transition-all duration-300 group relative overflow-hidden",
                        isMobile
                          ? "h-12 rounded-2xl"
                          : isCollapsed 
                            ? "h-14 w-14 rounded-2xl justify-center items-center p-0 mx-auto flex shrink-0" 
                            : "h-12 rounded-2xl",
                        isActive
                          ? isMobile
                            ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-lg scale-[1.01]"
                            : isCollapsed
                              ? "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-xl scale-105 ring-2 ring-primary/20"
                              : "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-lg scale-[1.02]"
                          : isMobile
                            ? "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:scale-[1.01] hover:shadow-md"
                            : isCollapsed
                              ? "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:scale-110 hover:shadow-lg"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:scale-[1.01] hover:shadow-md"
                      )}
                      tooltip={isCollapsed && !isMobile ? item.label : undefined}
                    >
                      {isCollapsed && !isMobile ? (
                        <div className="flex w-full items-center justify-center">
                          <Icon
                            className={cn(
                              "h-6 w-6 flex-shrink-0 transition-all duration-300",
                              isActive
                                ? "text-primary-foreground"
                                : "text-muted-foreground group-hover:text-foreground"
                            )}
                          />
                        </div>
                      ) : (
                        <Icon
                          className={cn(
                            "transition-all duration-300",
                            isMobile ? "h-5 w-5 mr-3" : "h-5 w-5 mr-3",
                            isActive
                              ? "text-primary-foreground"
                              : "text-muted-foreground group-hover:text-foreground"
                          )}
                        />
                      )}
                      
                      {(!isCollapsed || isMobile) && (
                        <>
                          <span className={cn(
                            "font-medium transition-all duration-300",
                            isMobile ? "text-sm" : "text-sm"
                          )}>
                            {item.label}
                          </span>
                          {/* Active indicator for expanded state */}
                          {isActive && (
                            <div className="absolute right-3 w-2 h-2 rounded-full bg-primary-foreground/80" />
                          )}
                        </>
                      )}
                      
                      {/* Active indicator for collapsed state */}
                      {isActive && isCollapsed && !isMobile && (
                        <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-foreground rounded-l-full" />
                      )}
                    </SidebarMenuButton>
                    
                    {/* Separator between items when collapsed */}
                    {isCollapsed && !isMobile && index < menuItems.length - 1 && (
                      <div className="flex justify-center py-1">
                        <div className="w-6 h-px bg-border/50"></div>
                      </div>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* User Profile Section */}
        <div className={cn(
          "mt-auto border-t border-border/30",
           isMobile 
             ? "px-4 py-4" 
             : isCollapsed 
               ? "px-0 py-4 flex justify-center" 
               : "px-4 py-4"
        )}>
          <div className="mb-2">
            <InstallPWA />
          </div>
          {profile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className={cn(
                    "transition-all duration-200 hover:bg-accent hover:text-accent-foreground hover:shadow-md hover:scale-[1.02]",
                    isMobile
                      ? "w-full h-12 rounded-2xl justify-start gap-3"
                      : isCollapsed 
                        ? "h-14 w-14 rounded-2xl p-0 flex items-center justify-center"
                        : "w-full h-12 rounded-2xl justify-start gap-3"
                  )}
                >
                  <Avatar className={cn(
                    isMobile ? "h-8 w-8" : isCollapsed ? "h-10 w-10" : "h-8 w-8"
                  )}>
                    <AvatarImage src={profile.avatar_url} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {profile.full_name?.charAt(0) || profile.email.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  {(!isCollapsed || isMobile) && (
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate text-foreground">
                          {getFirstName(profile.full_name) || 'Usuário'}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {profile.role === 'admin' && '• Administrador'}
                          {profile.role === 'user' && '• Vitalício'}
                          {profile.role === 'subscriber' && '• Assinante'}
                          {profile.role === 'trial' && '• Trial'}
                        </span>
                      </div>
                      {!isAdmin() && timeRemaining && (
                        <span className="text-xs text-muted-foreground mt-0.5">
                          {timeRemaining}
                        </span>
                      )}
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => handlePageChange('profile')}>
                  <User className="mr-2 h-4 w-4" />
                  Perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlePageChange('settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </DropdownMenuItem>
                {isAdmin() && (
                  <>
                    <DropdownMenuItem onClick={() => handlePageChange('users')}>
                      <Users className="mr-2 h-4 w-4" />
                      Usuários
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePageChange('system-settings')}>
                      <Settings className="mr-2 h-4 w-4" />
                      Configurações do Sistema
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

function LayoutContent({ children, currentPage, onPageChange, onNavigate, dashboardHeaderCallbacks, pageHeaderButtons }: LayoutProps) {
  const isMobile = useIsMobile();
  const { profile, isAdmin, signOut } = useOfflineAuth();
  const { open } = useSidebar();
  
  // Use onNavigate if provided, otherwise use onPageChange
  const handlePageChange = onNavigate || onPageChange || (() => {});

  return (
    <>
      {/* Mobile Header - Fixed with safe area */}
      {isMobile && (
        <header className="safe-top fixed top-0 left-0 right-0 z-[60] h-14 bg-background/95 backdrop-blur-xl border-b border-border/50 shadow-sm">
          <div className="flex items-center justify-between h-full px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-10 w-10 hover:bg-accent hover:text-accent-foreground rounded-xl transition-all duration-200 hover:scale-105 hover:shadow-md flex items-center justify-center touch-target">
                <div className="w-5 h-5 flex flex-col justify-center gap-1">
                  <div className="w-full h-0.5 bg-foreground rounded-full"></div>
                  <div className="w-full h-0.5 bg-foreground rounded-full"></div>
                  <div className="w-full h-0.5 bg-foreground rounded-full"></div>
                </div>
              </SidebarTrigger>
              <div 
                className="flex items-center gap-2 cursor-pointer touch-target"
                onClick={() => handlePageChange('dashboard')}
              >
                <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center shadow-lg">
                  <BarChart3 className="h-4 w-4 text-yellow-400" />
                </div>
                <div>
                  <h1 className="text-base font-bold tracking-tight text-foreground">
                    PlaniFlow
                  </h1>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              {profile && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Avatar className="h-8 w-8 touch-target cursor-pointer">
                      <AvatarImage src={profile.avatar_url} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {profile.full_name?.charAt(0) || profile.email.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => handlePageChange('profile')}>
                      <User className="mr-2 h-4 w-4" />
                      Perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePageChange('settings')}>
                      <Settings className="mr-2 h-4 w-4" />
                      Configurações
                    </DropdownMenuItem>
                    {isAdmin() && (
                      <>
                        <DropdownMenuItem onClick={() => handlePageChange('users')}>
                          <Users className="mr-2 h-4 w-4" />
                          Usuários
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePageChange('system-settings')}>
                          <Settings className="mr-2 h-4 w-4" />
                          Configurações do Sistema
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </header>
      )}

      <div className={cn(
        "flex flex-1 w-full",
        isMobile ? "pt-14" : "min-h-screen"
      )}>
        <AppSidebar currentPage={currentPage} onPageChange={handlePageChange} />
        
        {/* Main content with responsive padding and safe areas */}
          <main className={cn(
            "flex-1 w-full overflow-x-hidden overflow-y-auto",
            "safe-bottom"
          )}>
          {/* Desktop Header - Fixed bar with same style as mobile */}
          {!isMobile && (
            <header className="fixed top-0 left-0 right-0 z-[60] h-14 bg-background/95 backdrop-blur-xl border-b border-border/50 shadow-sm transition-all duration-300">
              <div className="flex items-center justify-center h-full px-4 transition-all duration-300"
                style={{
                  marginLeft: open ? 'var(--sidebar-width, 224px)' : '72px',
                  width: open ? 'calc(100% - var(--sidebar-width, 224px))' : 'calc(100% - 72px)',
                  position: 'relative'
                }}>
                {/* Center: All elements in one line - buttons, logo, notification */}
                <div className="flex items-center gap-3">
                  {/* Action buttons */}
                  {currentPage === 'dashboard' && dashboardHeaderCallbacks && (
                    <DashboardHeader
                      onTransfer={dashboardHeaderCallbacks.onTransfer}
                      onAddExpense={dashboardHeaderCallbacks.onAddExpense}
                      onAddIncome={dashboardHeaderCallbacks.onAddIncome}
                      onAddCreditExpense={dashboardHeaderCallbacks.onAddCreditExpense}
                      isHeaderVersion={true}
                    />
                  )}
                  {currentPage !== 'dashboard' && pageHeaderButtons && (
                    <div className="flex items-center gap-1 [&>button]:h-8 [&>button]:text-xs [&>button]:px-2">
                      {pageHeaderButtons}
                    </div>
                  )}

                  {/* Divider */}
                  <div className="w-px h-6 bg-border/30"></div>

                  {/* Logo */}
                  <div className="flex items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-105"
                    onClick={() => handlePageChange('dashboard')}
                  >
                    <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center shadow-lg flex-shrink-0">
                      <BarChart3 className="h-4 w-4 text-yellow-400" />
                    </div>
                    <div>
                      <h1 className="text-base font-bold tracking-tight text-foreground">
                        PlaniFlow
                      </h1>
                    </div>
                  </div>

                  {/* Notification */}
                  <div className="text-foreground">
                    <NotificationBell />
                  </div>
                </div>
              </div>
            </header>
          )}
          
          {/* Mobile Header Buttons */}
          {isMobile && pageHeaderButtons && (
            <div className="fixed top-14 left-0 right-0 z-40 flex items-center justify-center gap-1 px-2 py-1 border-b h-[58px]">
              <div className="flex items-center gap-1 [&>button]:h-8 [&>button]:text-xs [&>button]:px-2">
                {pageHeaderButtons}
              </div>
            </div>
          )}
          
          <div className={cn(
            "w-full h-full transition-all duration-300",
            isMobile 
              ? "px-3 py-1 pt-[72px]" 
              : "px-[52px] py-[52px] pt-[72px]"
          )}
          >
            <div className={cn(
              "mx-auto w-full",
              isMobile 
                ? "max-w-full" 
                : "max-w-7xl 2xl:max-w-[1600px]"
            )}>
              {children}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

export function Layout({ children, currentPage, onPageChange, onNavigate, dashboardHeaderCallbacks, ...rest }: LayoutProps) {
  const isMobile = useIsMobile();
  useExpirationNotifications();
  
  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <div className="h-screen flex w-full bg-[#EDF2F7] dark:bg-gradient-surface overflow-hidden">
        <LayoutContent 
          currentPage={currentPage} 
          onPageChange={onPageChange} 
          onNavigate={onNavigate}
          dashboardHeaderCallbacks={dashboardHeaderCallbacks}
          {...rest}
        >
          {children}
        </LayoutContent>
      </div>
    </SidebarProvider>
  );
}