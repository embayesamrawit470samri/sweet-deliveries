import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Reports() {
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [deliveryData, setDeliveryData] = useState<any[]>([]);
  const [orderData, setOrderData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadReports = async () => {
    setLoading(true);
    const [dRes, oRes] = await Promise.all([
      supabase.from('deliveries')
        .select('*, branches(name), delivery_items(*, categories(name))')
        .gte('delivery_date', dateFrom)
        .lte('delivery_date', dateTo)
        .order('delivery_date'),
      supabase.from('orders')
        .select('*, order_items(*, categories(name))')
        .gte('created_at', dateFrom + 'T00:00:00')
        .lte('created_at', dateTo + 'T23:59:59')
        .order('created_at'),
    ]);
    setDeliveryData(dRes.data ?? []);
    setOrderData(oRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadReports(); }, [dateFrom, dateTo]);

  // Aggregate calculations
  const totalDelivered = deliveryData.reduce((sum, d) =>
    sum + (d.delivery_items?.reduce((s: number, di: any) => s + di.quantity * Number(di.price_at_delivery), 0) ?? 0), 0);

  const totalSold = deliveryData.reduce((sum, d) =>
    sum + (d.delivery_items?.reduce((s: number, di: any) =>
      s + (di.sold_shift1 + di.sold_shift2) * Number(di.price_at_delivery), 0) ?? 0), 0);

  const totalOrders = orderData.reduce((sum, o) => sum + Number(o.total_etb), 0);
  const totalLeftoverValue = totalDelivered - totalSold;

  return (
    <div className="animate-fade-in space-y-4">
      <h2 className="font-serif text-2xl">Reports</h2>
      <div className="flex flex-wrap gap-4">
        <div><Label>From</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><Label>To</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Delivered Value</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalDelivered.toFixed(2)} ETB</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Sold Value</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-success">{totalSold.toFixed(2)} ETB</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Order Value</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalOrders.toFixed(2)} ETB</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Unsold Value</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{totalLeftoverValue.toFixed(2)} ETB</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="deliveries">
        <TabsList>
          <TabsTrigger value="deliveries">Deliveries & Sales</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
        </TabsList>
        <TabsContent value="deliveries">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead>Sold (S1+S2)</TableHead>
                    <TableHead>Leftover</TableHead>
                    <TableHead>Income (ETB)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : deliveryData.flatMap(d =>
                    (d.delivery_items ?? []).map((di: any) => {
                      const sold = di.sold_shift1 + di.sold_shift2;
                      const leftover = di.quantity - sold;
                      return (
                        <TableRow key={di.id}>
                          <TableCell>{d.delivery_date}</TableCell>
                          <TableCell>{d.branches?.name}</TableCell>
                          <TableCell>{di.categories?.name}</TableCell>
                          <TableCell>{di.quantity}</TableCell>
                          <TableCell>{di.sold_shift1} + {di.sold_shift2} = {sold}</TableCell>
                          <TableCell>{leftover}</TableCell>
                          <TableCell>{(sold * Number(di.price_at_delivery)).toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="orders">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total (ETB)</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderData.map(o => (
                    <TableRow key={o.id}>
                      <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>{o.customer_name}</TableCell>
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
      </Tabs>
    </div>
  );
}
