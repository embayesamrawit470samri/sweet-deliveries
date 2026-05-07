import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import {
  Croissant, LayoutDashboard, Truck, ShoppingCart, BarChart3,
  Users, Tags, LogOut, Menu, X, ChevronRight, Sparkles, Calculator, Languages
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-4 w-4" />, roles: ['admin', 'manager', 'agent'] },
  { label: 'Categories', href: '/categories', icon: <Tags className="h-4 w-4" />, roles: ['admin', 'manager'] },
  { label: 'Services', href: '/services', icon: <Sparkles className="h-4 w-4" />, roles: ['admin', 'manager'] },
  { label: 'Deliveries', href: '/deliveries', icon: <Truck className="h-4 w-4" />, roles: ['admin', 'manager'] },
  { label: 'My Deliveries', href: '/agent/deliveries', icon: <Truck className="h-4 w-4" />, roles: ['agent'] },
  { label: 'Orders', href: '/orders', icon: <ShoppingCart className="h-4 w-4" />, roles: ['admin', 'manager', 'agent'] },
  { label: 'Cashier', href: '/cashier', icon: <Calculator className="h-4 w-4" />, roles: ['admin', 'manager'] },
  { label: 'Reports', href: '/reports', icon: <BarChart3 className="h-4 w-4" />, roles: ['admin', 'manager'] },
  { label: 'Users', href: '/users', icon: <Users className="h-4 w-4" />, roles: ['admin', 'manager'] },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, roles, signOut } = useAuth();
  const { lang, setLang, t } = useI18n();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleItems = navItems.filter(item => item.roles.some(r => roles.includes(r as any)));

  return (
    <div className="flex min-h-screen">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-foreground/20 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform md:static md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <Croissant className="h-6 w-6 text-sidebar-primary" />
          <span className="font-serif text-lg text-sidebar-foreground">BakeryMS</span>
          <button className="ml-auto md:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5 text-sidebar-foreground" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {visibleItems.map(item => (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                location.pathname === item.href
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              {item.icon}
              {t(item.label)}
              {location.pathname === item.href && <ChevronRight className="ml-auto h-4 w-4" />}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3 space-y-2">
          <div className="truncate px-3 text-xs text-muted-foreground">{user?.email}</div>
          <div className="flex items-center gap-2 px-1">
            <Languages className="h-4 w-4 text-sidebar-foreground" />
            <Select value={lang} onValueChange={(v: any) => setLang(v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="am">አማርኛ</SelectItem>
                <SelectItem value="ti">ትግርኛ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={signOut}>
            <LogOut className="h-4 w-4" /> {t('Sign Out')}
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-4 md:px-6">
          <button className="md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="font-serif text-lg">
            {t(visibleItems.find(i => i.href === location.pathname)?.label ?? 'Dashboard')}
          </h1>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
