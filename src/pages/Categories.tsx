import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, ImageIcon } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  price_etb: number;
  description: string | null;
  photo_url: string | null;
}

export default function Categories() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', price_etb: '', description: '', photo_url: '' });
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('categories').select('*').order('name');
    setCategories((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', price_etb: '', description: '', photo_url: '' });
    setDialogOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, price_etb: String(c.price_etb), description: c.description ?? '', photo_url: c.photo_url ?? '' });
    setDialogOpen(true);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('category-photos').upload(path, file);
    if (error) { toast({ title: 'Upload failed', description: error.message, variant: 'destructive' }); setUploading(false); return; }
    const { data } = supabase.storage.from('category-photos').getPublicUrl(path);
    setForm(f => ({ ...f, photo_url: data.publicUrl }));
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    const price = parseFloat(form.price_etb);
    if (isNaN(price) || price < 0) { toast({ title: 'Invalid price', description: 'Enter a valid price (>= 0)', variant: 'destructive' }); return; }

    // Verify auth before mutating to give a clearer error than RLS
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({ title: 'Not signed in', description: 'Please sign in again as admin or manager.', variant: 'destructive' });
      return;
    }

    const payload = {
      name: form.name.trim(),
      price_etb: price,
      description: form.description || null,
      photo_url: form.photo_url || null,
    };
    if (editing) {
      const { error } = await supabase.from('categories').update(payload).eq('id', editing.id);
      if (error) {
        const msg = error.message.includes('row-level security')
          ? 'You don\'t have permission. Make sure you\'re signed in as admin or manager.'
          : error.message;
        toast({ title: 'Update failed', description: msg, variant: 'destructive' }); return;
      }
    } else {
      const { error } = await supabase.from('categories').insert(payload);
      if (error) {
        const msg = error.message.includes('row-level security')
          ? 'You don\'t have permission. Make sure you\'re signed in as admin or manager.'
          : error.message;
        toast({ title: 'Create failed', description: msg, variant: 'destructive' }); return;
      }
    }
    setDialogOpen(false);
    load();
    toast({ title: editing ? 'Category updated' : 'Category created' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    await supabase.from('categories').delete().eq('id', id);
    load();
    toast({ title: 'Category deleted' });
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl">Food Categories</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add Category</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-serif">{editing ? 'Edit Category' : 'New Category'}</DialogTitle>
              <DialogDescription>Set the name, price, and an optional photo for this bakery item.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Price (ETB)</Label><Input type="number" min="0" step="0.01" value={form.price_etb} onChange={e => setForm(f => ({ ...f, price_etb: e.target.value }))} /></div>
              <div><Label>Description (optional)</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div>
                <Label>Photo (optional)</Label>
                <Input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} />
                {uploading && <p className="mt-1 text-xs text-muted-foreground">Uploading...</p>}
                {form.photo_url && <img src={form.photo_url} alt="preview" className="mt-2 h-24 w-24 rounded-md object-cover" />}
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
                <TableHead>Price (ETB)</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : categories.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No categories yet</TableCell></TableRow>
              ) : categories.map(c => (
                <TableRow key={c.id}>
                  <TableCell>
                    {c.photo_url ? (
                      <img src={c.photo_url} alt={c.name} className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-muted"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{Number(c.price_etb).toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{c.description ?? '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
