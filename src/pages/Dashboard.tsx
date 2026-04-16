import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingCart, Truck, Tags, Package } from 'lucide-react';

export default function Dashboard() {
  const { hasRole } = useAuth();
  const [stats, setStats] = useState({ categories: 0, branches: 0, orders: 0, deliveries: 0 });

  useEffect(() => {
    const load = async () => {
      const [c, b, o, d] = await Promise.all([
        supabase.from('categories').select('id', { count: 'exact', head: true }),
        supabase.from('branches').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        supabase.from('deliveries').select('id', { count: 'exact', head: true }),
      ]);
      setStats({
        categories: c.count ?? 0,
        branches: b.count ?? 0,
        orders: o.count ?? 0,
        deliveries: d.count ?? 0,
      });
    };
    load();
  }, []);

  const cards = [
    { label: 'Categories', value: stats.categories, icon: <Tags className="h-5 w-5 text-primary" />, show: hasRole('admin') || hasRole('manager') },
    { label: 'Branches', value: stats.branches, icon: <Package className="h-5 w-5 text-primary" />, show: hasRole('admin') || hasRole('manager') },
    { label: 'Orders', value: stats.orders, icon: <ShoppingCart className="h-5 w-5 text-accent" />, show: true },
    { label: 'Deliveries', value: stats.deliveries, icon: <Truck className="h-5 w-5 text-accent" />, show: hasRole('admin') || hasRole('manager') || hasRole('agent') },
  ].filter(c => c.show);

  return (
    <div className="animate-fade-in space-y-6">
      <h2 className="font-serif text-2xl">Overview</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              {c.icon}
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
