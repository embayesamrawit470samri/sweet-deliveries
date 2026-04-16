import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

interface Category { id: string; name: string; price_etb: number; }
interface OrderLine { category_id: string; quantity: number; }

export default function Orders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ customer_name: '', phone: '', needed_at: '' });
  const [lines, setLines] = useState<OrderLine[]>([{ category_id: '', quantity: 1 }]);

  const load = async () => {
    const [oRes, cRes] = await Promise.all([
      supabase.from('orders').select('*, order_items(*, categories(name))').order('created_at', { ascending: false }),
      supabase.from('categories').select('id, name, price_etb').order('name'),
    ]);
    setOrders(oRes.data ?? []);
    setCategories(cRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addLine = () => setLines(l => [...l, { category_id: '', quantity: 1 }]);
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, val: any) =>
    setLines(l => l.map((line, idx) => idx === i ? { ...line, [field]: val } : line));

  const calcTotal = () => lines.reduce((sum, l) => {
    const cat = categories.find(c => c.id === l.category_id);
    return sum + (cat ? Number(cat.price_etb) * l.quantity : 0);
  }, 0);

  const handleCreate = async () => {
    const validLines = lines.filter(l => l.category_id && l.quantity > 0);
    if (!form.customer_name || validLines.length === 0) {
      toast({ title: 'Error', description: 'Fill customer name and add items', variant: 'destructive' });
      return;
    }
    const total = calcTotal();
    const { data: order, error } = await supabase.from('orders').insert({
      customer_name: form.customer_name,
      phone: form.phone || null,
      needed_at: form.needed_at || null,
      total_etb: total,
      created_by: user?.id ?? null,
    }).select().single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }

    const itemsPayload = validLines.map(l => {
      const cat = categories.find(c => c.id === l.category_id);
      return { order_id: order.id, category_id: l.category_id, quantity: l.quantity, price_at_order: cat?.price_etb ?? 0 };
    });
    await supabase.from('order_items').insert(itemsPayload);
    setDialogOpen(false);
    setForm({ customer_name: '', phone: '', needed_at: '' });
    setLines([{ category_id: '', quantity: 1 }]);
    load();
    toast({ title: 'Order placed!' });
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      pending: 'bg-secondary text-secondary-foreground',
      confirmed: 'bg-accent text-accent-foreground',
      ready: 'bg-success text-success-foreground',
      delivered: 'bg-primary text-primary-foreground',
      cancelled: 'bg-destructive text-destructive-foreground',
    };
    return map[s] ?? '';
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl">Orders</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Order</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle className="font-serif">New Order</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Customer Name</Label><Input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} required /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label>When Needed</Label><Input value={form.needed_at} onChange={e => setForm(f => ({ ...f, needed_at: e.target.value }))} placeholder="e.g. Friday 2 PM" /></div>
              <div className="space-y-2">
                <Label>Items</Label>
                {lines.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" value={line.category_id}
                      onChange={e => updateLine(i, 'category_id', e.target.value)}>
                      <option value="">Select item</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({Number(c.price_etb).toFixed(2)} ETB)</option>)}
                    </select>
                    <Input type="number" min="1" className="w-20" value={line.quantity} onChange={e => updateLine(i, 'quantity', parseInt(e.target.value) || 1)} />
                    {lines.length > 1 && <Button variant="ghost" size="icon" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addLine}><Plus className="mr-1 h-3 w-3" /> Add Item</Button>
              </div>
              <div className="text-right font-medium">Total: {calcTotal().toFixed(2)} ETB</div>
              <Button onClick={handleCreate} className="w-full">Place Order</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Total (ETB)</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : orders.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No orders yet</TableCell></TableRow>
              ) : orders.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.customer_name}</TableCell>
                  <TableCell>{o.phone ?? '-'}</TableCell>
                  <TableCell>{o.needed_at ?? '-'}</TableCell>
                  <TableCell>{Number(o.total_etb).toFixed(2)}</TableCell>
                  <TableCell><Badge className={statusColor(o.status)}>{o.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
