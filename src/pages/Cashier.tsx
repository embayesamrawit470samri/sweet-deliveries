import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Minus, Trash2, Printer, Settings as SettingsIcon, Receipt } from 'lucide-react';

interface Category { id: string; name: string; price_etb: number; photo_url: string | null; }
interface CartItem { category_id: string; name: string; unit_price: number; quantity: number; }
interface CompanySettings {
  id?: string;
  company_name: string;
  address: string | null;
  phone: string | null;
  footer_note: string | null;
  service_charge_pct: number;
}

export default function Cashier() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shift, setShift] = useState<'shift1' | 'shift2'>('shift1');
  const [settings, setSettings] = useState<CompanySettings>({
    company_name: 'Bita Bakery', address: '', phone: '', footer_note: '', service_charge_pct: 0,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastSale, setLastSale] = useState<{
    items: CartItem[]; subtotal: number; service: number; total: number;
    customer: string; phone: string; cashierName: string; saleId: string; date: Date;
  } | null>(null);
  const [todayTotal, setTodayTotal] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  const loadCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('name');
    setCategories((data as any) ?? []);
  };
  const loadSettings = async () => {
    const { data } = await supabase.from('company_settings' as any).select('*').limit(1).maybeSingle();
    if (data) setSettings(data as any);
  };
  const loadTodayStats = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('cashier_sales' as any).select('total').eq('sale_date', today);
    const rows = (data as any[]) ?? [];
    setTodayTotal(rows.reduce((s, r) => s + Number(r.total || 0), 0));
    setTodayCount(rows.length);
  };

  useEffect(() => { loadCategories(); loadSettings(); loadTodayStats(); }, []);

  const addToCart = (c: Category) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.category_id === c.id);
      if (idx >= 0) return prev.map((it, i) => i === idx ? { ...it, quantity: it.quantity + 1 } : it);
      return [...prev, { category_id: c.id, name: c.name, unit_price: Number(c.price_etb), quantity: 1 }];
    });
  };
  const updateQty = (id: string, delta: number) =>
    setCart(prev => prev.flatMap(it => {
      if (it.category_id !== id) return [it];
      const q = it.quantity + delta;
      return q <= 0 ? [] : [{ ...it, quantity: q }];
    }));
  const removeItem = (id: string) => setCart(prev => prev.filter(i => i.category_id !== id));

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const serviceCharge = useMemo(() => subtotal * (Number(settings.service_charge_pct) / 100), [subtotal, settings.service_charge_pct]);
  const total = subtotal + serviceCharge;

  const handlePay = async () => {
    if (cart.length === 0) { toast({ title: 'Cart is empty', variant: 'destructive' }); return; }
    if (!user) return;
    setSubmitting(true);
    const { data: sale, error } = await supabase.from('cashier_sales' as any).insert({
      cashier_id: user.id,
      customer_name: customerName || 'Walk-in',
      customer_phone: customerPhone || null,
      shift,
      subtotal,
      service_charge: serviceCharge,
      total,
      paid: true,
    }).select().single();
    if (error || !sale) {
      toast({ title: 'Sale failed', description: error?.message, variant: 'destructive' });
      setSubmitting(false); return;
    }
    const items = cart.map(c => ({
      sale_id: (sale as any).id,
      category_id: c.category_id,
      quantity: c.quantity,
      unit_price: c.unit_price,
      line_total: c.unit_price * c.quantity,
    }));
    const { error: itemsErr } = await supabase.from('cashier_sale_items' as any).insert(items);
    if (itemsErr) {
      toast({ title: 'Items failed', description: itemsErr.message, variant: 'destructive' });
      setSubmitting(false); return;
    }

    setLastSale({
      items: [...cart], subtotal, service: serviceCharge, total,
      customer: customerName || 'Walk-in', phone: customerPhone,
      cashierName: user.email ?? 'Cashier',
      saleId: (sale as any).id, date: new Date(),
    });
    setReceiptOpen(true);
    setCart([]); setCustomerName('Walk-in'); setCustomerPhone('');
    loadTodayStats();
    setSubmitting(false);
  };

  const handlePrint = () => {
    const node = receiptRef.current;
    if (!node) return;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`
      <html><head><title>Receipt</title>
      <style>
        @page { size: 80mm auto; margin: 4mm; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0; color:#000; }
        h1,h2,h3 { margin: 2px 0; text-align: center; }
        .row { display: flex; justify-content: space-between; }
        .sep { border-top: 1px dashed #000; margin: 6px 0; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 1px 0; vertical-align: top; }
      </style></head><body>${node.innerHTML}</body></html>
    `);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); w.close(); }, 250);
  };

  const saveSettings = async () => {
    const payload: any = { ...settings, updated_by: user?.id };
    let res;
    if (settings.id) {
      res = await supabase.from('company_settings' as any).update(payload).eq('id', settings.id);
    } else {
      res = await supabase.from('company_settings' as any).insert(payload);
    }
    if (res.error) toast({ title: 'Save failed', description: res.error.message, variant: 'destructive' });
    else { toast({ title: 'Settings saved' }); setSettingsOpen(false); loadSettings(); }
  };

  return (
    <div className="space-y-4">
      {/* Top stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Today's sales</p>
          <p className="font-serif text-2xl">{todayTotal.toFixed(2)} ETB</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Transactions</p>
          <p className="font-serif text-2xl">{todayCount}</p>
        </CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Company</p>
            <p className="font-serif text-lg">{settings.company_name}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon className="mr-1 h-4 w-4" /> Edit
          </Button>
        </CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Categories grid */}
        <Card>
          <CardHeader><CardTitle>Tap an item to add</CardTitle></CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No categories yet — add some in Categories.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {categories.map(c => (
                  <button key={c.id} onClick={() => addToCart(c)}
                    className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md">
                    <div className="aspect-square w-full bg-muted">
                      {c.photo_url
                        ? <img src={c.photo_url} alt={c.name} className="h-full w-full object-cover" loading="lazy" />
                        : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>}
                    </div>
                    <div className="p-2">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-primary">{Number(c.price_etb).toFixed(2)} ETB</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cart panel */}
        <Card className="h-fit lg:sticky lg:top-4">
          <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Current Sale</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Customer</Label>
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Shift</Label>
              <Select value={shift} onValueChange={(v: any) => setShift(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shift1">Shift 1 (Morning)</SelectItem>
                  <SelectItem value="shift2">Shift 2 (Afternoon)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-2">
              {cart.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Cart is empty</p>}
              {cart.map(it => (
                <div key={it.category_id} className="flex items-center gap-2 rounded border bg-card p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="text-xs text-muted-foreground">{it.unit_price.toFixed(2)} × {it.quantity}</p>
                  </div>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(it.category_id, -1)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-6 text-center text-sm">{it.quantity}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(it.category_id, 1)}><Plus className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(it.category_id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{subtotal.toFixed(2)} ETB</span></div>
              {settings.service_charge_pct > 0 && (
                <div className="flex justify-between text-muted-foreground"><span>Service ({settings.service_charge_pct}%)</span><span>{serviceCharge.toFixed(2)} ETB</span></div>
              )}
              <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span>{total.toFixed(2)} ETB</span></div>
            </div>
            <Button className="w-full" size="lg" onClick={handlePay} disabled={submitting || cart.length === 0}>
              {submitting ? 'Processing…' : 'Tap to Pay'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Receipt dialog */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Receipt</DialogTitle></DialogHeader>
          {lastSale && (
            <div ref={receiptRef} className="rounded border bg-white p-3 font-mono text-xs text-black">
              <h2 className="text-center text-base font-bold">{settings.company_name}</h2>
              {settings.address && <p className="text-center">{settings.address}</p>}
              {settings.phone && <p className="text-center">Tel: {settings.phone}</p>}
              <div className="my-2 border-t border-dashed" />
              <p>Date: {lastSale.date.toLocaleString()}</p>
              <p>Receipt #: {lastSale.saleId.slice(0, 8).toUpperCase()}</p>
              <p>Cashier: {lastSale.cashierName}</p>
              <p>Customer: {lastSale.customer}{lastSale.phone ? ` (${lastSale.phone})` : ''}</p>
              <div className="my-2 border-t border-dashed" />
              <table className="w-full">
                <tbody>
                  {lastSale.items.map(i => (
                    <tr key={i.category_id}>
                      <td>{i.name}<br /><span className="text-[10px]">{i.quantity} × {i.unit_price.toFixed(2)}</span></td>
                      <td className="text-right align-top">{(i.unit_price * i.quantity).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="my-2 border-t border-dashed" />
              <div className="flex justify-between"><span>Subtotal</span><span>{lastSale.subtotal.toFixed(2)}</span></div>
              {lastSale.service > 0 && <div className="flex justify-between"><span>Service</span><span>{lastSale.service.toFixed(2)}</span></div>}
              <div className="flex justify-between font-bold"><span>TOTAL ETB</span><span>{lastSale.total.toFixed(2)}</span></div>
              <div className="my-2 border-t border-dashed" />
              <p className="text-center">{settings.footer_note ?? 'Thank you!'}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptOpen(false)}>Close</Button>
            <Button onClick={handlePrint}><Printer className="mr-1 h-4 w-4" /> Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Company / Receipt settings</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Company name</Label><Input value={settings.company_name} onChange={e => setSettings(s => ({ ...s, company_name: e.target.value }))} /></div>
            <div><Label>Address</Label><Input value={settings.address ?? ''} onChange={e => setSettings(s => ({ ...s, address: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={settings.phone ?? ''} onChange={e => setSettings(s => ({ ...s, phone: e.target.value }))} /></div>
            <div><Label>Service charge %</Label><Input type="number" step="0.1" value={settings.service_charge_pct} onChange={e => setSettings(s => ({ ...s, service_charge_pct: parseFloat(e.target.value) || 0 }))} /></div>
            <div><Label>Footer note</Label><Input value={settings.footer_note ?? ''} onChange={e => setSettings(s => ({ ...s, footer_note: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button onClick={saveSettings}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
