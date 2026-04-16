import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Croissant, Plus, Trash2, CheckCircle } from 'lucide-react';

interface Category { id: string; name: string; price_etb: number; }
interface OrderLine { category_id: string; quantity: number; }

export default function CustomerOrder() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ customer_name: '', phone: '', needed_at: '' });
  const [lines, setLines] = useState<OrderLine[]>([{ category_id: '', quantity: 1 }]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from('categories').select('id, name, price_etb').order('name').then(({ data }) => setCategories(data ?? []));
  }, []);

  const addLine = () => setLines(l => [...l, { category_id: '', quantity: 1 }]);
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, val: any) =>
    setLines(l => l.map((line, idx) => idx === i ? { ...line, [field]: val } : line));

  const calcTotal = () => lines.reduce((sum, l) => {
    const cat = categories.find(c => c.id === l.category_id);
    return sum + (cat ? Number(cat.price_etb) * l.quantity : 0);
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter(l => l.category_id && l.quantity > 0);
    if (!form.customer_name || validLines.length === 0) {
      toast({ title: 'Error', description: 'Fill your name and select items', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const total = calcTotal();
    const { data: order, error } = await supabase.from('orders').insert({
      customer_name: form.customer_name,
      phone: form.phone || null,
      needed_at: form.needed_at || null,
      total_etb: total,
    }).select().single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); setSubmitting(false); return; }

    const itemsPayload = validLines.map(l => {
      const cat = categories.find(c => c.id === l.category_id);
      return { order_id: order.id, category_id: l.category_id, quantity: l.quantity, price_at_order: cat?.price_etb ?? 0 };
    });
    await supabase.from('order_items').insert(itemsPayload);
    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md animate-fade-in text-center">
          <CardContent className="py-12">
            <CheckCircle className="mx-auto mb-4 h-16 w-16 text-success" />
            <h2 className="mb-2 font-serif text-2xl">Order Placed!</h2>
            <p className="text-muted-foreground">Thank you, {form.customer_name}. We'll have it ready for you.</p>
            <Button className="mt-6" onClick={() => { setSubmitted(false); setForm({ customer_name: '', phone: '', needed_at: '' }); setLines([{ category_id: '', quantity: 1 }]); }}>
              Place Another Order
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg animate-fade-in">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Croissant className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="font-serif text-2xl">Place Your Order</CardTitle>
          <CardDescription>Fresh baked goods, made with love</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><Label>Your Name</Label><Input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} required /></div>
            <div><Label>Phone Number</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>When Do You Need It?</Label><Input value={form.needed_at} onChange={e => setForm(f => ({ ...f, needed_at: e.target.value }))} placeholder="e.g. Friday 2 PM, or 15/04/2026 10:00 AM" /></div>
            <div className="space-y-2">
              <Label>Items</Label>
              {lines.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" value={line.category_id}
                    onChange={e => updateLine(i, 'category_id', e.target.value)}>
                    <option value="">Select item</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name} — {Number(c.price_etb).toFixed(2)} ETB</option>)}
                  </select>
                  <Input type="number" min="1" className="w-20" value={line.quantity} onChange={e => updateLine(i, 'quantity', parseInt(e.target.value) || 1)} />
                  {lines.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="mr-1 h-3 w-3" /> Add Item</Button>
            </div>
            <div className="text-right text-lg font-bold">Total: {calcTotal().toFixed(2)} ETB</div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Placing Order...' : 'Place Order'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
