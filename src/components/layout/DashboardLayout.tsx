import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { 
  LucideIcon,
  LayoutDashboard,
  Receipt,
  FileText,
  CreditCard,
  Users,
  UserCog,
  FileBarChart,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  LogOut,
  Building2,
  Wallet,
  Menu,
  X,
  FileSpreadsheet,
  ListChecks
  // FileCheck
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { useNotifications, useClearNotifications } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { Trash2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  requiredRoles?: ("super_admin" | "admin" | "finance_manager" | "accountant" | "hr" | "employee" | "auditor")[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  // { label: "Quotations", href: "/quotations", icon: FileCheck },
  { label: "Receipts", href: "/receipts", icon: Receipt },
  { label: "Invoices", href: "/invoices", icon: FileText, requiredRoles: ["super_admin", "admin", "finance_manager", "accountant"] },
  { label: "Expenses", href: "/expenses", icon: CreditCard },
  { label: "External Expenses", href: "/external-expenses", icon: CreditCard },
  { label: "Payroll", href: "/payroll", icon: Wallet, requiredRoles: ["super_admin", "admin", "finance_manager", "hr"] },
  { label: "Statement", href: "/statement", icon: FileSpreadsheet, requiredRoles: ["super_admin", "admin", "finance_manager", "accountant"] },
  { label: "Transactions", href: "/transactions", icon: ListChecks, requiredRoles: ["super_admin", "admin", "finance_manager", "accountant", "auditor"] },
  { label: "Employees", href: "/employees", icon: Users, requiredRoles: ["super_admin", "admin", "hr"] },
  // { label: "Reports", href: "/reports", icon: FileBarChart, requiredRoles: ["super_admin", "admin", "finance_manager", "accountant", "auditor"] },
  { label: "Notifications", href: "/notifications", icon: Bell, requiredRoles: ["super_admin", "admin", "finance_manager", "accountant"] },
  // { label: "Audit Logs", href: "/audit-logs", icon: ScrollText, requiredRoles: ["super_admin", "admin", "auditor"] },
  { label: "Users", href: "/users", icon: UserCog, requiredRoles: ["super_admin", "admin"] },
  { label: "Settings", href: "/settings", icon: Settings, requiredRoles: ["super_admin", "admin"] },
];

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: company } = useCompany();
  const companyName = company?.name || "FinanceHub";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, roles, signOut, hasRole } = useAuth();
  const { data: notifications } = useNotifications(5);
  const clearNotifications = useClearNotifications();

  // Filter nav items based on user roles
  const filteredNavItems = navItems.filter((item) => {
    if (!item.requiredRoles || item.requiredRoles.length === 0) {
      return true; // No role restriction, show to everyone
    }
    // Check if user has at least one of the required roles
    return item.requiredRoles.some((role) => hasRole(role));
  });

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const getRoleDisplay = () => {
    if (roles.includes("super_admin")) return "Super Admin";
    if (roles.includes("admin")) return "Admin";
    if (roles.includes("finance_manager")) return "Finance Manager";
    if (roles.includes("accountant")) return "Accountant";
    if (roles.includes("hr")) return "HR";
    if (roles.includes("auditor")) return "Auditor";
    return "Employee";
  };
  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen transition-all duration-300 gradient-hero",
          collapsed ? "w-20" : "w-64",
          "lg:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            {!collapsed && (
              <div className="animate-fade-in">
                <h1 className="text-lg font-bold text-white">{companyName}</h1>
                <p className="text-[10px] text-white/60">Enterprise Suite</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-6 px-3">
          <ul className="space-y-1.5">
            {filteredNavItems.map((item, index) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.href} className="animate-slide-in-left" style={{ animationDelay: `${index * 0.05}s` }}>
                  <Link
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-white text-primary shadow-lg"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary" : "")} />
                    {(!collapsed || mobileMenuOpen) && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <span className={cn(
                            "flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
                            isActive ? "bg-primary text-white" : "bg-white/20 text-white"
                          )}>
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Collapse Button */}
        <div className="absolute bottom-4 left-0 right-0 px-3">
          <Button
            variant="glass"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className={cn("w-full justify-center", collapsed && "px-0")}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className={cn(
        "flex-1 transition-all duration-300",
        collapsed ? "lg:ml-20" : "lg:ml-64",
        "w-full"
      )}>
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="flex h-full items-center justify-between px-4 sm:px-6 gap-2">
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>

            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-10 bg-secondary/50 border-0 focus-visible:ring-1 w-full"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 sm:gap-3">
              {/* Notifications */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {notifications && notifications.length > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                        {notifications.length}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                    {notifications && notifications.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Are you sure you want to clear all notifications?")) {
                            clearNotifications.mutate();
                          }
                        }}
                        disabled={clearNotifications.isPending}
                      >
                        {clearNotifications.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="mr-1 h-3 w-3" />
                            Clear
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  {notifications && notifications.length > 0 ? (
                    <>
                      {notifications.slice(0, 5).map((notification) => (
                        <DropdownMenuItem
                          key={notification.id}
                          className="flex flex-col items-start gap-1 p-3 cursor-pointer"
                          onClick={() => navigate("/notifications")}
                        >
                          <span className="text-sm font-medium">{notification.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </DropdownMenuItem>
                      ))}
                      {notifications.length > 5 && (
                        <DropdownMenuItem
                          className="text-center justify-center text-sm font-medium text-primary cursor-pointer"
                          onClick={() => navigate("/notifications")}
                        >
                          View all notifications
                        </DropdownMenuItem>
                      )}
                    </>
                  ) : (
                    <DropdownMenuItem disabled className="text-center justify-center py-4">
                      <span className="text-sm text-muted-foreground">No notifications</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Profile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 px-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.email || 'user'}`} />
                      <AvatarFallback>{profile?.full_name?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="hidden text-left sm:block">
                      <p className="text-sm font-medium">{profile?.full_name || 'User'}</p>
                      <p className="text-xs text-muted-foreground hidden md:block">{getRoleDisplay()}</p>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/settings?tab=profile")}>
                    Profile Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings?tab=company")}>
                    Company Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings?tab=billing")}>
                    Billing
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
