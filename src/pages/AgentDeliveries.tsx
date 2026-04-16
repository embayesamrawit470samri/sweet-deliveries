import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface DeliveryItem {
  id: string;
  category_id: string;
  quantity: number;
  price_at_delivery: number;
  sold_shift1: number;
  sold_shift2: number;
  categories: { name: string } | null;
}

interface Delivery {
  id: string;
  delivery_date: string;
  status: string;
  branches: { name: string; shift1_name: string; shift2_name: string | null } | null;
  delivery_items: DeliveryItem[];
}

export default function AgentDeliveries() {
  const { toast } = useToast();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingShift, setEditingShift] = useState<{ itemId: string; shift: 1 | 2; value: number } | null>(null);

  const load = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('deliveries')
      .select('*, branches(name, shift1_name, shift2_name), delivery_items(*, categories(name))')
      .eq('delivery_date', today)
      .order('created_at', { ascending: false });
    setDeliveries((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSoldUpdate = async (item: DeliveryItem, shift: 1 | 2, newSold: number) => {
    if (shift === 1) {
      if (newSold > item.quantity) {
        toast({ title: 'Error', description: 'Sold cannot exceed delivered quantity', variant: 'destructive' });
        return;
      }
      const { error } = await supabase.from('delivery_items').update({ sold_shift1: newSold }).eq('id', item.id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    } else {
      const remaining = item.quantity - item.sold_shift1;
      if (newSold > remaining) {
        toast({ title: 'Error', description: 'Sold cannot exceed remaining quantity', variant: 'destructive' });
        return;
      }
      const { error } = await supabase.from('delivery_items').update({ sold_shift2: newSold }).eq('id', item.id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    }
    load();
    toast({ title: 'Updated!' });
    setEditingShift(null);
  };

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div className="animate-fade-in space-y-4">
      <h2 className="font-serif text-2xl">Today's Deliveries</h2>
      {deliveries.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No deliveries assigned for today</CardContent></Card>
      ) : deliveries.map(d => (
        <Card key={d.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span>{d.branches?.name}</span>
              <Badge className="bg-secondary text-secondary-foreground">{d.status}</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Shift 1: {d.branches?.shift1_name} | Shift 2: {d.branches?.shift2_name ?? 'N/A'}
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {d.delivery_items.map(item => {
                const leftoverAfterS1 = item.quantity - item.sold_shift1;
                const leftoverFinal = leftoverAfterS1 - item.sold_shift2;
                return (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium">{item.categories?.name}</span>
                      <span className="text-sm text-muted-foreground">Delivered: {item.quantity} | {Number(item.price_at_delivery).toFixed(2)} ETB each</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Shift 1 Sold:</span>
                        {editingShift?.itemId === item.id && editingShift.shift === 1 ? (
                          <div className="mt-1 flex gap-2">
                            <Input type="number" min="0" max={item.quantity} className="h-8 w-20" value={editingShift.value}
                              onChange={e => setEditingShift({ ...editingShift, value: parseInt(e.target.value) || 0 })} />
                            <Button size="sm" variant="secondary" onClick={() => handleSoldUpdate(item, 1, editingShift.value)}>Save</Button>
                          </div>
                        ) : (
                          <span className="ml-2 cursor-pointer font-medium underline-offset-4 hover:underline"
                            onClick={() => setEditingShift({ itemId: item.id, shift: 1, value: item.sold_shift1 })}>
                            {item.sold_shift1}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Shift 2 Sold:</span>
                        {editingShift?.itemId === item.id && editingShift.shift === 2 ? (
                          <div className="mt-1 flex gap-2">
                            <Input type="number" min="0" max={leftoverAfterS1} className="h-8 w-20" value={editingShift.value}
                              onChange={e => setEditingShift({ ...editingShift, value: parseInt(e.target.value) || 0 })} />
                            <Button size="sm" variant="secondary" onClick={() => handleSoldUpdate(item, 2, editingShift.value)}>Save</Button>
                          </div>
                        ) : (
                          <span className="ml-2 cursor-pointer font-medium underline-offset-4 hover:underline"
                            onClick={() => setEditingShift({ itemId: item.id, shift: 2, value: item.sold_shift2 })}>
                            {item.sold_shift2}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex gap-4 text-sm">
                      <span>After Shift 1: <strong>{leftoverAfterS1}</strong></span>
                      <span>Final Leftover: <strong>{leftoverFinal}</strong></span>
                      <span className="text-primary">Income: <strong>{((item.sold_shift1 + item.sold_shift2) * Number(item.price_at_delivery)).toFixed(2)} ETB</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
