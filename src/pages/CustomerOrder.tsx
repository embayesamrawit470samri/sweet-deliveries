import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Croissant, Plus, Trash2, CheckCircle, Sparkles, ImageIcon, Coffee, Cookie, Cake } from 'lucide-react';
import heroImage from '@/assets/bita-hero.jpg';

interface Service {
  id: string; name: string; description: string | null;
  photo_url: string | null; price_etb: number | null;
}
interface OrderLine { service_id: string; quantity: number; }

export default function CustomerOrder() {
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState({ customer_name: '', phone: '', needed_at: '', note: '' });
  const [lines, setLines] = useState<OrderLine[]>([{ service_id: '', quantity: 1 }]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from('services').select('*').eq('is_active', true).order('display_order').then(({ data }) => setServices((data as any) ?? []));
  }, []);

  const addLine = () => setLines(l => [...l, { service_id: '', quantity: 1 }]);
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, val: any) =>
    setLines(l => l.map((line, idx) => idx === i ? { ...line, [field]: val } : line));

  const calcTotal = () => lines.reduce((sum, l) => {
    const s = services.find(c => c.id === l.service_id);
    return sum + (s?.price_etb ? Number(s.price_etb) * l.quantity : 0);
  }, 0);

  const scrollToOrder = () => {
    document.getElementById('order-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto-fill order line from a service card click
  const quickAdd = (serviceId: string) => {
    setLines(prev => {
      // If service already in lines, just bump quantity
      const idx = prev.findIndex(l => l.service_id === serviceId);
      if (idx >= 0) {
        return prev.map((l, i) => i === idx ? { ...l, quantity: l.quantity + 1 } : l);
      }
      // Find first empty line, otherwise append
      const emptyIdx = prev.findIndex(l => !l.service_id);
      if (emptyIdx >= 0) {
        return prev.map((l, i) => i === emptyIdx ? { service_id: serviceId, quantity: 1 } : l);
      }
      return [...prev, { service_id: serviceId, quantity: 1 }];
    });
    scrollToOrder();
    toast({ title: 'Added to order' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter(l => l.service_id && l.quantity > 0);
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
            <Button className="mt-6" onClick={() => { setSubmitted(false); setForm({ customer_name: '', phone: '', needed_at: '', note: '' }); setLines([{ service_id: '', quantity: 1 }]); }}>
              Place Another Order
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* HERO */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImage} alt="Bita Bakery — fresh croissants, Ethiopian dabo and coffee" className="h-full w-full object-cover" width={1920} height={1080} />
          <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-background/30" />
        </div>

        {/* Floating animated icons */}
        <Croissant className="absolute left-[8%] top-[20%] h-10 w-10 text-accent/70 animate-float" style={{ animationDelay: '0s' }} />
        <Cookie className="absolute right-[12%] top-[28%] h-9 w-9 text-primary/60 animate-float" style={{ animationDelay: '1.2s' }} />
        <Cake className="absolute right-[22%] bottom-[18%] h-10 w-10 text-accent/60 animate-float" style={{ animationDelay: '2s' }} />
        <Coffee className="absolute left-[18%] bottom-[22%] h-9 w-9 text-primary/70 animate-float" style={{ animationDelay: '0.6s' }} />

        {/* Steam puffs */}
        <span className="absolute left-[45%] top-[45%] h-3 w-3 rounded-full bg-foreground/20 blur-sm animate-steam" />
        <span className="absolute left-[48%] top-[48%] h-2 w-2 rounded-full bg-foreground/15 blur-sm animate-steam" style={{ animationDelay: '0.8s' }} />
        <span className="absolute left-[42%] top-[50%] h-2 w-2 rounded-full bg-foreground/10 blur-sm animate-steam" style={{ animationDelay: '1.5s' }} />

        <div className="relative mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="max-w-xl space-y-6 animate-fade-in">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 animate-bounce-slow" /> Freshly Baked Daily
            </div>
            <h1 className="font-serif text-5xl leading-tight md:text-7xl">
              <span className="block">Bita</span>
              <span className="block bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-shimmer">
                Bakery
              </span>
            </h1>
            <p className="text-lg text-muted-foreground md:text-xl">
              Where every loaf tells a story. Ethiopian warmth, French finesse — baked with love and delivered fresh to your door.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={scrollToOrder} className="shadow-lg shadow-primary/20">
                <Croissant className="mr-2 h-5 w-5" /> Order Now
              </Button>
              <Button size="lg" variant="outline" onClick={() => document.getElementById('featured')?.scrollIntoView({ behavior: 'smooth' })}>
                See What's Fresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-4 py-12">
        {/* Featured Services — click to auto-add */}
        {services.length > 0 && (
          <section id="featured" className="animate-fade-in">
            <div className="mb-6 flex items-end justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-serif text-3xl">
                  <Sparkles className="h-6 w-6 text-accent" /> Featured Today
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Tap any item to add it straight to your order.</p>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {services.map(s => (
                <Card
                  key={s.id}
                  onClick={() => quickAdd(s.id)}
                  className="group cursor-pointer overflow-hidden border-border/60 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10"
                >
                  <div className="aspect-video w-full overflow-hidden bg-muted">
                    {s.photo_url ? (
                      <img src={s.photo_url} alt={s.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center"><ImageIcon className="h-10 w-10 text-muted-foreground" /></div>
                    )}
                  </div>
                  <CardContent className="space-y-2 p-5">
                    <h3 className="font-serif text-xl">{s.name}</h3>
                    {s.description && <p className="text-sm text-muted-foreground line-clamp-3">{s.description}</p>}
                    <div className="flex items-center justify-between pt-3">
                      {s.price_etb !== null && <span className="font-bold text-primary">{Number(s.price_etb).toFixed(2)} ETB</span>}
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); quickAdd(s.id); }}>
                        <Plus className="mr-1 h-3 w-3" /> Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Order form */}
        <Card id="order-form" className="animate-fade-in border-primary/20 shadow-xl shadow-primary/5">
          <CardHeader>
            <CardTitle className="font-serif text-3xl">Place Your Order</CardTitle>
            <CardDescription>Fresh baked goods, made with love</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Your Name</Label><Input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} required /></div>
                <div><Label>Phone Number</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              </div>
              <div><Label>When Do You Need It?</Label><Input value={form.needed_at} onChange={e => setForm(f => ({ ...f, needed_at: e.target.value }))} placeholder="e.g. Friday 2 PM, or 15/04/2026 10:00 AM" /></div>
              <div className="space-y-2">
                <Label>Items</Label>
                {services.length === 0 && <p className="text-xs text-muted-foreground">No items available yet.</p>}
                {lines.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" value={line.service_id}
                      onChange={e => updateLine(i, 'service_id', e.target.value)}>
                      <option value="">Select item</option>
                      {services.map(s => <option key={s.id} value={s.id}>{s.name}{s.price_etb !== null ? ` — ${Number(s.price_etb).toFixed(2)} ETB` : ''}</option>)}
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
      </main>

      <footer className="border-t border-border/50 bg-card/50 py-8 text-center text-sm text-muted-foreground">
        <p>© Bita Bakery — Baked with love in Ethiopia 🇪🇹</p>
      </footer>
    </div>
  );
}
