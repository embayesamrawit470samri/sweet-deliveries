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
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

interface Service { id: string; name: string; price_etb: number | null; }
interface OrderLine { service_id: string; quantity: number; }

export default function Orders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ customer_name: '', phone: '', needed_at: '' });
  const [lines, setLines] = useState<OrderLine[]>([{ service_id: '', quantity: 1 }]);

  const load = async () => {
    const [oRes, sRes] = await Promise.all([
      supabase.from('orders').select('*, order_items(*, categories(name), services(name))').order('created_at', { ascending: false }),
      supabase.from('services').select('id, name, price_etb').eq('is_active', true).order('display_order'),
    ]);
    setOrders(oRes.data ?? []);
    setServices((sRes.data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addLine = () => setLines(l => [...l, { service_id: '', quantity: 1 }]);
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, val: any) =>
    setLines(l => l.map((line, idx) => idx === i ? { ...line, [field]: val } : line));

  const calcTotal = () => lines.reduce((sum, l) => {
    const s = services.find(c => c.id === l.service_id);
    return sum + (s?.price_etb ? Number(s.price_etb) * l.quantity : 0);
  }, 0);

  const handleCreate = async () => {
    const validLines = lines.filter(l => l.service_id && l.quantity > 0);
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
      const s = services.find(c => c.id === l.service_id);
      return {
        order_id: order.id,
        service_id: l.service_id,
        item_name: s?.name ?? null,
        quantity: l.quantity,
        price_at_order: s?.price_etb ?? 0,
      };
    });
    await supabase.from('order_items').insert(itemsPayload as any);
    setDialogOpen(false);
    setForm({ customer_name: '', phone: '', needed_at: '' });
    setLines([{ service_id: '', quantity: 1 }]);
    load();
    toast({ title: 'Order placed!' });
  };

  const updateOrderStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('orders').update({ status } as any).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    load();
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

  const itemLabel = (it: any) => it.services?.name ?? it.item_name ?? it.categories?.name ?? '—';

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
                <Label>Items (from Services)</Label>
                {services.length === 0 && <p className="text-xs text-muted-foreground">No active services. Add some in the Services page.</p>}
                {lines.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" value={line.service_id}
                      onChange={e => updateLine(i, 'service_id', e.target.value)}>
                      <option value="">Select item</option>
                      {services.map(s => <option key={s.id} value={s.id}>{s.name}{s.price_etb !== null ? ` (${Number(s.price_etb).toFixed(2)} ETB)` : ''}</option>)}
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
                <TableHead>Items</TableHead>
                <TableHead>Total (ETB)</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : orders.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No orders yet</TableCell></TableRow>
              ) : orders.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.customer_name}</TableCell>
                  <TableCell>{o.phone ?? '-'}</TableCell>
                  <TableCell>{o.needed_at ?? '-'}</TableCell>
                  <TableCell className="max-w-xs">
                    {o.order_items?.map((it: any) => (
                      <span key={it.id} className="mr-2 text-sm">{itemLabel(it)} × {it.quantity}</span>
                    ))}
                  </TableCell>
                  <TableCell>{Number(o.total_etb).toFixed(2)}</TableCell>
                  <TableCell>
                    <Select value={o.status} onValueChange={(v) => updateOrderStatus(o.id, v)}>
                      <SelectTrigger className="h-8 w-32"><Badge className={statusColor(o.status)}>{o.status}</Badge></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">pending</SelectItem>
                        <SelectItem value="confirmed">confirmed</SelectItem>
                        <SelectItem value="ready">ready</SelectItem>
                        <SelectItem value="delivered">delivered</SelectItem>
                        <SelectItem value="cancelled">cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
