import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';
import { formatEthiopian } from '@/lib/ethiopianDate';
import { useI18n } from '@/lib/i18n';

function downloadCsv(filename: string, rows: any[]) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

type Period = 'daily' | 'weekly' | 'monthly';

function startOfPeriod(period: Period, ref: Date): Date {
  const d = new Date(ref);
  if (period === 'daily') return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === 'weekly') {
    const day = d.getDay();
    const diff = (day + 6) % 7; // Monday start
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
  }
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfPeriod(period: Period, ref: Date): Date {
  const start = startOfPeriod(period, ref);
  const e = new Date(start);
  if (period === 'daily') e.setDate(e.getDate() + 1);
  else if (period === 'weekly') e.setDate(e.getDate() + 7);
  else e.setMonth(e.getMonth() + 1);
  return e;
}

export default function Reports() {
  const { lang } = useI18n();
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [deliveryData, setDeliveryData] = useState<any[]>([]);
  const [agentMap, setAgentMap] = useState<Record<string, { branch_name: string | null; full_name: string | null }>>({});
  const [orderPeriod, setOrderPeriod] = useState<Period>('daily');
  const [orderRefDate, setOrderRefDate] = useState(new Date().toISOString().split('T')[0]);
  const [orderData, setOrderData] = useState<any[]>([]);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDeliveries = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('deliveries')
      .select('*, delivery_items(*, categories(name))')
      .gte('delivery_date', dateFrom)
      .lte('delivery_date', dateTo)
      .order('delivery_date');
    const list = (data as any) ?? [];
    setDeliveryData(list);

    const ids = Array.from(new Set(list.map((d: any) => d.agent_id).filter(Boolean)));
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles').select('user_id, branch_name, full_name').in('user_id', ids as string[]);
      const map: Record<string, any> = {};
      (profiles ?? []).forEach((p: any) => { map[p.user_id] = p; });
      setAgentMap(map);
    } else {
      setAgentMap({});
    }
    setLoading(false);
  };

  const loadOrders = async () => {
    const ref = new Date(orderRefDate);
    const start = startOfPeriod(orderPeriod, ref);
    const end = endOfPeriod(orderPeriod, ref);
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, categories(name))')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at');
    setOrderData((data as any) ?? []);
  };

  const loadPriceHistory = async () => {
    const { data } = await supabase
      .from('category_price_history')
      .select('id, category_id, price_etb, effective_from, categories(name)')
      .order('effective_from', { ascending: false });
    setPriceHistory((data as any) ?? []);
  };

  useEffect(() => { loadDeliveries(); }, [dateFrom, dateTo]);
  useEffect(() => { loadOrders(); }, [orderPeriod, orderRefDate]);
  useEffect(() => { loadPriceHistory(); }, []);

  // Aggregations for deliveries
  const deliveryRows = deliveryData.flatMap(d =>
    (d.delivery_items ?? []).map((di: any) => {
      const sold = di.sold_shift1 + di.sold_shift2;
      const defective = (di.defective_shift1 ?? 0) + (di.defective_shift2 ?? 0);
      const leftover = Math.max(di.quantity - sold - defective, 0);
      const income = sold * Number(di.price_at_delivery);
      return {
        date: d.delivery_date,
        branch: agentMap[d.agent_id]?.branch_name ?? '—',
        item: di.categories?.name ?? '—',
        delivered: di.quantity,
        sold,
        defective,
        leftover,
        income,
      };
    })
  );

  const totalDelivered = deliveryRows.reduce((s, r) => s + r.delivered * 0, 0); // value below
  const totalSoldValue = deliveryRows.reduce((s, r) => s + r.income, 0);
  const totalDefective = deliveryRows.reduce((s, r) => s + r.defective, 0);
  const totalLeftover = deliveryRows.reduce((s, r) => s + r.leftover, 0);
  const deliveredValue = deliveryData.reduce((sum, d) =>
    sum + (d.delivery_items?.reduce((s: number, di: any) => s + di.quantity * Number(di.price_at_delivery), 0) ?? 0), 0);

  const totalOrdersValue = orderData.reduce((sum, o) => sum + Number(o.total_etb), 0);

  const downloadDeliveryPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Deliveries Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${dateFrom} to ${dateTo}`, 14, 22);
    doc.text(`Delivered Value: ${deliveredValue.toFixed(2)} ETB | Sold Value: ${totalSoldValue.toFixed(2)} ETB | Defective Qty: ${totalDefective} | Leftover Qty: ${totalLeftover}`, 14, 28);
    autoTable(doc, {
      startY: 34,
      head: [['Date', 'Agent/Branch', 'Item', 'Delivered', 'Sold', 'Defective', 'Leftover', 'Income (ETB)']],
      body: deliveryRows.map(r => [formatEthiopian(r.date, lang), r.branch, r.item, r.delivered, r.sold, r.defective, r.leftover, r.income.toFixed(2)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [180, 100, 50] },
    });
    doc.save(`deliveries_${dateFrom}_to_${dateTo}.pdf`);
  };

  const downloadOrdersPdf = () => {
    const doc = new jsPDF();
    const ref = new Date(orderRefDate);
    const start = startOfPeriod(orderPeriod, ref);
    const end = endOfPeriod(orderPeriod, ref);
    const endDisp = new Date(end); endDisp.setDate(endDisp.getDate() - 1);
    doc.setFontSize(16);
    doc.text(`Orders Report (${orderPeriod})`, 14, 15);
    doc.setFontSize(10);
    doc.text(`From ${start.toISOString().split('T')[0]} to ${endDisp.toISOString().split('T')[0]}`, 14, 22);
    doc.text(`Total Orders: ${orderData.length} | Total Value: ${totalOrdersValue.toFixed(2)} ETB`, 14, 28);
    autoTable(doc, {
      startY: 34,
      head: [['Date', 'Customer', 'Phone', 'Items', 'Total (ETB)', 'Status']],
      body: orderData.map(o => [
        formatEthiopian(o.created_at, lang),
        o.customer_name,
        o.phone ?? '-',
        (o.order_items ?? []).map((oi: any) => `${oi.categories?.name} x${oi.quantity}`).join(', '),
        Number(o.total_etb).toFixed(2),
        o.status,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [180, 100, 50] },
    });
    doc.save(`orders_${orderPeriod}_${orderRefDate}.pdf`);
  };

  const downloadDeliveryCsv = () => {
    downloadCsv(`deliveries_${dateFrom}_to_${dateTo}.csv`, deliveryRows.map(r => ({
      Date: formatEthiopian(r.date, lang), Branch: r.branch, Item: r.item,
      Delivered: r.delivered, Sold: r.sold, Defective: r.defective,
      Leftover: r.leftover, 'Income (ETB)': r.income.toFixed(2),
    })));
  };

  const downloadOrdersCsv = () => {
    downloadCsv(`orders_${orderPeriod}_${orderRefDate}.csv`, orderData.map(o => ({
      Date: formatEthiopian(o.created_at, lang),
      Customer: o.customer_name,
      Phone: o.phone ?? '',
      Items: (o.order_items ?? []).map((oi: any) => `${oi.categories?.name} x${oi.quantity}`).join('; '),
      'Total (ETB)': Number(o.total_etb).toFixed(2),
      Status: o.status,
    })));
  };

  const priceHistoryRows = priceHistory.map((p: any) => ({
    'Effective From': new Date(p.effective_from).toLocaleString(),
    Category: p.categories?.name ?? '—',
    'Price (ETB)': Number(p.price_etb).toFixed(2),
  }));

  const downloadPriceHistoryPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Category Price History', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [['Effective From', 'Category', 'Price (ETB)']],
      body: priceHistoryRows.map(r => [r['Effective From'], r.Category, r['Price (ETB)']]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [180, 100, 50] },
    });
    doc.save('category_price_history.pdf');
  };

  const downloadPriceHistoryCsv = () =>
    downloadCsv('category_price_history.csv', priceHistoryRows);


  return (
    <div className="animate-fade-in space-y-4">
      <h2 className="font-serif text-2xl">Reports</h2>

      <Tabs defaultValue="deliveries">
        <TabsList>
          <TabsTrigger value="deliveries">Deliveries (income)</TabsTrigger>
          <TabsTrigger value="orders">Orders (daily/weekly/monthly)</TabsTrigger>
          <TabsTrigger value="prices">Price History</TabsTrigger>
        </TabsList>

        <TabsContent value="deliveries" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div><Label>From</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
            <Button onClick={downloadDeliveryPdf} variant="outline"><Download className="mr-2 h-4 w-4" /> PDF</Button>
            <Button onClick={downloadDeliveryCsv} variant="outline"><FileText className="mr-2 h-4 w-4" /> CSV</Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Delivered Value</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{deliveredValue.toFixed(2)} ETB</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Sold Value (Income)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-success">{totalSoldValue.toFixed(2)} ETB</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Defective (qty)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{totalDefective}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Leftover (qty)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totalLeftover}</div></CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Agent/Branch</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead>Sold</TableHead>
                    <TableHead>Defective</TableHead>
                    <TableHead>Leftover</TableHead>
                    <TableHead>Income (ETB)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : deliveryRows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No deliveries in this range</TableCell></TableRow>
                  ) : deliveryRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{formatEthiopian(r.date, lang)}</TableCell>
                      <TableCell>{r.branch}</TableCell>
                      <TableCell>{r.item}</TableCell>
                      <TableCell>{r.delivered}</TableCell>
                      <TableCell>{r.sold}</TableCell>
                      <TableCell className="text-destructive">{r.defective}</TableCell>
                      <TableCell>{r.leftover}</TableCell>
                      <TableCell>{r.income.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Period</Label>
              <select className="block rounded-md border bg-background px-3 py-2 text-sm" value={orderPeriod} onChange={e => setOrderPeriod(e.target.value as Period)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div><Label>Reference date</Label><Input type="date" value={orderRefDate} onChange={e => setOrderRefDate(e.target.value)} /></div>
            <Button onClick={downloadOrdersPdf} variant="outline"><Download className="mr-2 h-4 w-4" /> PDF</Button>
            <Button onClick={downloadOrdersCsv} variant="outline"><FileText className="mr-2 h-4 w-4" /> CSV</Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Orders</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{orderData.length}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Value</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{totalOrdersValue.toFixed(2)} ETB</div></CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total (ETB)</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderData.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No orders in this period</TableCell></TableRow>
                  ) : orderData.map(o => (
                    <TableRow key={o.id}>
                      <TableCell>{formatEthiopian(o.created_at, lang)}</TableCell>
                      <TableCell>{o.customer_name}</TableCell>
                      <TableCell>{o.phone ?? '-'}</TableCell>
                      <TableCell>
                        {o.order_items?.map((oi: any) => `${oi.categories?.name} x${oi.quantity}`).join(', ')}
                      </TableCell>
                      <TableCell>{Number(o.total_etb).toFixed(2)}</TableCell>
                      <TableCell>{o.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prices" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="text-sm text-muted-foreground">All recorded category price changes (most recent first).</div>
            <div className="ml-auto flex gap-2">
              <Button onClick={downloadPriceHistoryPdf} variant="outline"><Download className="mr-2 h-4 w-4" /> PDF</Button>
              <Button onClick={downloadPriceHistoryCsv} variant="outline"><FileText className="mr-2 h-4 w-4" /> CSV</Button>
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Effective From</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Price (ETB)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceHistoryRows.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No price history yet</TableCell></TableRow>
                  ) : priceHistoryRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r['Effective From']}</TableCell>
                      <TableCell>{r.Category}</TableCell>
                      <TableCell className="font-medium">{r['Price (ETB)']}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
