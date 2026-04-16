import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  phone: string | null;
  shift1_name: string;
  shift2_name: string | null;
}

export default function Branches() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', shift1_name: '', shift2_name: '' });

  const load = async () => {
    const { data } = await supabase.from('branches').select('*').order('name');
    setBranches(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', phone: '', shift1_name: '', shift2_name: '' });
    setDialogOpen(true);
  };

  const openEdit = (b: Branch) => {
    setEditing(b);
    setForm({ name: b.name, phone: b.phone ?? '', shift1_name: b.shift1_name, shift2_name: b.shift2_name ?? '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      name: form.name,
      phone: form.phone || null,
      shift1_name: form.shift1_name,
      shift2_name: form.shift2_name || null,
      created_by: user!.id,
    };
    if (editing) {
      const { error } = await supabase.from('branches').update(payload).eq('id', editing.id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    } else {
      const { error } = await supabase.from('branches').insert(payload);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    }
    setDialogOpen(false);
    load();
    toast({ title: editing ? 'Branch updated' : 'Branch created' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this branch?')) return;
    await supabase.from('branches').delete().eq('id', id);
    load();
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl">Branches & Agents</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add Branch</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif">{editing ? 'Edit Branch' : 'New Branch'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div><Label>Branch Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label>Shift 1 Agent Name</Label><Input value={form.shift1_name} onChange={e => setForm(f => ({ ...f, shift1_name: e.target.value }))} required /></div>
              <div><Label>Shift 2 Agent Name (optional)</Label><Input value={form.shift2_name} onChange={e => setForm(f => ({ ...f, shift2_name: e.target.value }))} /></div>
              <Button onClick={handleSave} className="w-full">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Shift 1</TableHead>
                <TableHead>Shift 2</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : branches.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No branches yet</TableCell></TableRow>
              ) : branches.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>{b.phone ?? '-'}</TableCell>
                  <TableCell>{b.shift1_name}</TableCell>
                  <TableCell>{b.shift2_name ?? '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
