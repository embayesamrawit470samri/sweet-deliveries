import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, ImageIcon, Sparkles } from 'lucide-react';

interface Service {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  price_etb: number | null;
  is_active: boolean;
  display_order: number;
}

export default function Services() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', photo_url: '', price_etb: '',
    is_active: true, display_order: '0',
  });

  const load = async () => {
    const { data } = await supabase.from('services').select('*').order('display_order').order('created_at');
    setServices((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', description: '', photo_url: '', price_etb: '', is_active: true, display_order: '0' });
    setOpen(true);
  };

  const openEdit = (s: Service) => {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description ?? '',
      photo_url: s.photo_url ?? '',
      price_etb: s.price_etb !== null ? String(s.price_etb) : '',
      is_active: s.is_active,
      display_order: String(s.display_order),
    });
    setOpen(true);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('service-photos').upload(path, file);
    if (error) { toast({ title: 'Upload failed', description: error.message, variant: 'destructive' }); setUploading(false); return; }
    const { data } = supabase.storage.from('service-photos').getPublicUrl(path);
    setForm(f => ({ ...f, photo_url: data.publicUrl }));
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.name) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    const payload = {
      name: form.name,
      description: form.description || null,
      photo_url: form.photo_url || null,
      price_etb: form.price_etb ? parseFloat(form.price_etb) : null,
      is_active: form.is_active,
      display_order: parseInt(form.display_order) || 0,
      created_by: user!.id,
    };
    if (editing) {
      const { error } = await supabase.from('services').update(payload).eq('id', editing.id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    } else {
      const { error } = await supabase.from('services').insert(payload);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    }
    setOpen(false);
    load();
    toast({ title: editing ? 'Service updated' : 'Service created' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this service?')) return;
    await supabase.from('services').delete().eq('id', id);
    load();
    toast({ title: 'Service deleted' });
  };

  const toggleActive = async (s: Service) => {
    await supabase.from('services').update({ is_active: !s.is_active }).eq('id', s.id);
    load();
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-serif text-2xl"><Sparkles className="h-5 w-5 text-primary" /> Services</h2>
          <p className="text-sm text-muted-foreground">Promotional cards shown at the top of the public ordering page.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add Service</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-serif">{editing ? 'Edit Service' : 'New Service'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div><Label>Price (ETB) — optional</Label><Input type="number" min="0" step="0.01" value={form.price_etb} onChange={e => setForm(f => ({ ...f, price_etb: e.target.value }))} /></div>
              <div>
                <Label>Photo (optional)</Label>
                <Input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} />
                {uploading && <p className="mt-1 text-xs text-muted-foreground">Uploading...</p>}
                {form.photo_url && <img src={form.photo_url} alt="preview" className="mt-2 h-32 w-full rounded-md object-cover" />}
              </div>
              <div><Label>Display Order</Label><Input type="number" value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: e.target.value }))} /></div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="active">Active (visible to customers)</Label>
                <Switch id="active" checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              </div>
              <Button onClick={handleSave} className="w-full" disabled={uploading}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Photo</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : services.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No services yet — add one to feature it on the customer page.</TableCell></TableRow>
              ) : services.map(s => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.photo_url ? (
                      <img src={s.photo_url} alt={s.name} className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-muted"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{s.description ?? '-'}</TableCell>
                  <TableCell>{s.price_etb !== null ? `${Number(s.price_etb).toFixed(2)} ETB` : '-'}</TableCell>
                  <TableCell>{s.display_order}</TableCell>
                  <TableCell>
                    <Badge
                      onClick={() => toggleActive(s)}
                      className={`cursor-pointer ${s.is_active ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}`}
                    >
                      {s.is_active ? 'Active' : 'Hidden'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
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
