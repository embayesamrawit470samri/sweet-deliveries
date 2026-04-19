import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  defective_shift1: number;
  defective_shift2: number;
  categories: { name: string } | null;
}

interface Delivery {
  id: string;
  delivery_date: string;
  status: string;
  agent_id: string;
  delivery_items: DeliveryItem[];
}

interface AgentProfile {
  branch_name: string | null;
  shift1_name: string | null;
  shift2_name: string | null;
}

// Draft now uses defective + leftover (sold = qty - def - leftover)
type Draft = { def1: number; left1: number; def2: number; left2: number };

export default function AgentDeliveries() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const load = async () => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const [pRes, dRes] = await Promise.all([
      supabase.from('profiles').select('branch_name, shift1_name, shift2_name').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('deliveries')
        .select('*, delivery_items(*, categories(name))')
        .eq('delivery_date', today)
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false }),
    ]);
    setProfile((pRes.data as any) ?? null);
    const list: Delivery[] = (dRes.data as any) ?? [];
    setDeliveries(list);
    const initial: Record<string, Draft> = {};
    list.forEach(d => d.delivery_items.forEach(it => {
      // Reconstruct leftover from sold + defective; leftover_total = qty - sold - def
      const leftoverTotal = Math.max(it.quantity - it.sold_shift1 - it.sold_shift2 - it.defective_shift1 - it.defective_shift2, 0);
      // Split leftover: any remainder after shift 1 belongs to whichever shift had data; default left2 holds leftover.
      const remainingAfterS1 = Math.max(it.quantity - it.sold_shift1 - it.defective_shift1, 0);
      const left1 = it.sold_shift2 + it.defective_shift2 > 0 ? 0 : leftoverTotal === remainingAfterS1 ? leftoverTotal : 0;
      const left2 = leftoverTotal - left1;
      initial[it.id] = {
        def1: it.defective_shift1, left1,
        def2: it.defective_shift2, left2,
      };
    }));
    setDrafts(initial);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const updateDraft = (itemId: string, key: keyof Draft, value: number) => {
    setDrafts(d => ({ ...d, [itemId]: { ...d[itemId], [key]: Math.max(0, value) } }));
  };

  const computeSold = (item: DeliveryItem, draft: Draft) => {
    const sold1 = Math.max(item.quantity - draft.def1 - draft.left1, 0);
    // For shift 2, baseline is whatever is left after shift 1
    const remaining = Math.max(item.quantity - sold1 - draft.def1 - draft.left1, 0);
    const sold2 = Math.max(remaining - draft.def2 - draft.left2, 0);
    return { sold1, sold2 };
  };

  const saveItem = async (item: DeliveryItem) => {
    const draft = drafts[item.id];
    if (!draft) return;
    if (draft.def1 + draft.left1 > item.quantity) {
      toast({ title: 'Shift 1: defective + leftover cannot exceed delivered', variant: 'destructive' });
      return;
    }
    const { sold1, sold2 } = computeSold(item, draft);
    const remainingForS2 = item.quantity - sold1 - draft.def1 - draft.left1;
    if (draft.def2 + draft.left2 > remainingForS2) {
      toast({ title: 'Shift 2: defective + leftover cannot exceed remaining', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('delivery_items').update({
      sold_shift1: sold1,
      sold_shift2: sold2,
      defective_shift1: draft.def1,
      defective_shift2: draft.def2,
    } as any).eq('id', item.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Saved' });
    load();
  };

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div className="animate-fade-in space-y-4">
      <h2 className="font-serif text-2xl">Today's Deliveries</h2>
      <p className="text-sm text-muted-foreground">
        Just enter <strong>Defective</strong> and <strong>Leftover</strong> for each shift — sold is calculated automatically.
      </p>
      {deliveries.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No deliveries assigned for today</CardContent></Card>
      ) : deliveries.map(d => (
        <Card key={d.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span>{profile?.branch_name ?? 'My Branch'}</span>
              <Badge className="bg-secondary text-secondary-foreground">{d.status}</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Shift 1: {profile?.shift1_name ?? 'N/A'} | Shift 2: {profile?.shift2_name ?? 'N/A'}
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {d.delivery_items.map(item => {
                const draft = drafts[item.id] ?? { def1: 0, left1: 0, def2: 0, left2: 0 };
                const { sold1, sold2 } = computeSold(item, draft);
                const totalDef = draft.def1 + draft.def2;
                const totalLeft = draft.left1 + draft.left2;
                const totalSold = sold1 + sold2;
                const income = totalSold * Number(item.price_at_delivery);
                return (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-medium">{item.categories?.name}</span>
                      <span className="text-sm text-muted-foreground">Delivered: {item.quantity} | {Number(item.price_at_delivery).toFixed(2)} ETB each</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded bg-muted/30 p-2">
                        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Shift 1 — Sold: <span className="text-foreground">{sold1}</span></p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Defective</Label>
                            <Input type="number" min="0" className="h-8" value={draft.def1}
                              onChange={e => updateDraft(item.id, 'def1', parseInt(e.target.value) || 0)} />
                          </div>
                          <div>
                            <Label className="text-xs">Leftover</Label>
                            <Input type="number" min="0" className="h-8" value={draft.left1}
                              onChange={e => updateDraft(item.id, 'left1', parseInt(e.target.value) || 0)} />
                          </div>
                        </div>
                      </div>
                      <div className="rounded bg-muted/30 p-2">
                        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Shift 2 — Sold: <span className="text-foreground">{sold2}</span></p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Defective</Label>
                            <Input type="number" min="0" className="h-8" value={draft.def2}
                              onChange={e => updateDraft(item.id, 'def2', parseInt(e.target.value) || 0)} />
                          </div>
                          <div>
                            <Label className="text-xs">Leftover</Label>
                            <Input type="number" min="0" className="h-8" value={draft.left2}
                              onChange={e => updateDraft(item.id, 'left2', parseInt(e.target.value) || 0)} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="flex flex-wrap gap-3">
                        <span>Sold: <strong>{totalSold}</strong></span>
                        <span>Leftover: <strong>{totalLeft}</strong></span>
                        <span className="text-destructive">Defective: <strong>{totalDef}</strong></span>
                        <span className="text-primary">Income: <strong>{income.toFixed(2)} ETB</strong></span>
                      </div>
                      <Button size="sm" onClick={() => saveItem(item)}>Save</Button>
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
