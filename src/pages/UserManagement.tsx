import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { UserPlus } from 'lucide-react';

interface UserProfile {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  roles: string[];
}

type Role = 'admin' | 'manager' | 'agent' | 'customer';

export default function UserManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone: '', role: 'agent' as Role });

  const load = async () => {
    const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, phone');
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    if (profiles) {
      const roleMap: Record<string, string[]> = {};
      roles?.forEach(r => {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
        roleMap[r.user_id].push(r.role);
      });
      setUsers(profiles.map(p => ({ ...p, roles: roleMap[p.user_id] ?? [] })));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addRole = async (userId: string, role: string) => {
    const { error } = await supabase.from('user_roles').insert({ user_id: userId, role } as any);
    if (error) {
      if (error.code === '23505') { toast({ title: 'Already has this role' }); return; }
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    load();
    toast({ title: `Role ${role} added` });
  };

  const createUser = async () => {
    if (!form.email || !form.password || form.password.length < 6) {
      toast({ title: 'Email and password (min 6 chars) required', variant: 'destructive' });
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: form,
    });
    setCreating(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Failed to create user', description: error?.message ?? (data as any)?.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'User created', description: `${form.email} added as ${form.role}` });
    setOpen(false);
    setForm({ email: '', password: '', full_name: '', phone: '', role: 'agent' });
    load();
  };

  const roleColor = (r: string) => {
    const map: Record<string, string> = {
      admin: 'bg-destructive text-destructive-foreground',
      manager: 'bg-primary text-primary-foreground',
      agent: 'bg-accent text-accent-foreground',
      customer: 'bg-secondary text-secondary-foreground',
    };
    return map[r] ?? '';
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl">User Management</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 h-4 w-4" /> Create User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>Create a manager, agent, admin or customer account.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cu-name">Full Name</Label>
                <Input id="cu-name" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-email">Email</Label>
                <Input id="cu-email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-pass">Password</Label>
                <Input id="cu-pass" type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-phone">Phone (optional)</Label>
                <Input id="cu-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+251..." />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v: Role) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={createUser} disabled={creating}>{creating ? 'Creating...' : 'Create User'}</Button>
            </DialogFooter>
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
                <TableHead>Roles</TableHead>
                <TableHead>Add Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : users.map(u => (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">{u.full_name || 'Unnamed'}</TableCell>
                  <TableCell>{u.phone ?? '-'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map(r => <Badge key={r} className={roleColor(r)}>{r}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select onValueChange={val => addRole(u.user_id, val)}>
                      <SelectTrigger className="w-32"><SelectValue placeholder="Add role" /></SelectTrigger>
                      <SelectContent>
                        {['admin', 'manager', 'agent', 'customer']
                          .filter(r => !u.roles.includes(r))
                          .map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
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
