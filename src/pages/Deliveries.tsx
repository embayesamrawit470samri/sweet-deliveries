import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Truck } from 'lucide-react';

interface Branch { id: string; name: string; }
interface Category { id: string; name: string; price_etb: number; }
interface DeliveryItem { category_id: string; quantity: number; }

export default function Deliveries() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [autoFilled, setAutoFilled] = useState(false);

  const load = async () => {
    const [dRes, bRes, cRes] = await Promise.all([
      supabase.from('deliveries').select('*, branches(name), delivery_items(*, categories(name))').order('delivery_date', { ascending: false }),
      supabase.from('branches').select('id, name').order('name'),
      supabase.from('categories').select('id, name, price_etb').order('name'),
    ]);
    setDeliveries(dRes.data ?? []);
    setBranches(bRes.data ?? []);
    setCategories(cRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleBranchSelect = async (branchId: string) => {
    setSelectedBranch(branchId);
    // Auto-fill from previous day leftovers
    const { data } = await supabase.rpc('calculate_opening_stock', {
      p_branch_id: branchId,
      p_date: deliveryDate,
    });
    const leftover: Record<string, number> = (data as Record<string, number>) ?? {};
    const newItems = categories.map(c => ({
      category_id: c.id,
      quantity: leftover[c.id] ?? 0,
    }));
    setItems(newItems);
    setAutoFilled(Object.keys(leftover).length > 0);
  };

  const updateItemQty = (catId: string, qty: number) => {
    setItems(prev => prev.map(i => i.category_id === catId ? { ...i, quantity: Math.max(0, qty) } : i));
  };

  const handleCreate = async () => {
    const activeItems = items.filter(i => i.quantity > 0);
    if (!selectedBranch || activeItems.length === 0) {
      toast({ title: 'Error', description: 'Select a branch and add quantities', variant: 'destructive' });
      return;
    }
    const { data: delivery, error } = await supabase.from('deliveries').insert({
      branch_id: selectedBranch,
      delivery_date: deliveryDate,
      created_by: user!.id,
    }).select().single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }

    const itemsPayload = activeItems.map(i => {
      const cat = categories.find(c => c.id === i.category_id);
      return {
        delivery_id: delivery.id,
        category_id: i.category_id,
        quantity: i.quantity,
        price_at_delivery: cat?.price_etb ?? 0,
      };
    });
    const { error: itemsError } = await supabase.from('delivery_items').insert(itemsPayload);
    if (itemsError) { toast({ title: 'Error', description: itemsError.message, variant: 'destructive' }); return; }

    setDialogOpen(false);
    load();
    toast({ title: 'Delivery created!' });
  };

  const statusColor = (s: string) => s === 'completed' ? 'bg-success text-success-foreground' : s === 'confirmed' ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground';

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl">Deliveries</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Delivery</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-serif">Create Delivery</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Branch</Label>
                <Select value={selectedBranch} onValueChange={handleBranchSelect}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Delivery Date</Label>
                <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
              </div>
              {autoFilled && (
                <p className="text-sm text-accent">Previous day leftovers auto-filled. Adjust as needed.</p>
              )}
              {categories.length > 0 && (
                <div className="space-y-2">
                  <Label>Items & Quantities</Label>
                  {items.map(item => {
                    const cat = categories.find(c => c.id === item.category_id);
                    return (
                      <div key={item.category_id} className="flex items-center gap-3">
                        <span className="flex-1 text-sm">{cat?.name} ({Number(cat?.price_etb ?? 0).toFixed(2)} ETB)</span>
                        <Input type="number" min="0" className="w-24" value={item.quantity} onChange={e => updateItemQty(item.category_id, parseInt(e.target.value) || 0)} />
                      </div>
                    );
                  })}
                </div>
              )}
              <Button onClick={handleCreate} className="w-full">Create Delivery</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : deliveries.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No deliveries yet</TableCell></TableRow>
              ) : deliveries.map(d => (
                <TableRow key={d.id}>
                  <TableCell>{d.delivery_date}</TableCell>
                  <TableCell className="font-medium">{d.branches?.name}</TableCell>
                  <TableCell>
                    {d.delivery_items?.map((di: any) => (
                      <span key={di.id} className="mr-2 text-sm">{di.categories?.name}: {di.quantity}</span>
                    ))}
                  </TableCell>
                  <TableCell><Badge className={statusColor(d.status)}>{d.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
