import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Pencil, Trash2, X } from 'lucide-react';

interface UserProfile {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  branch_name: string | null;
  branch_phone: string | null;
  shift1_name: string | null;
  shift2_name: string | null;
  manager_id: string | null;
  roles: string[];
}

type Role = 'admin' | 'manager' | 'agent' | 'customer';

const emptyForm = {
  email: '', password: '', full_name: '', phone: '',
  role: 'agent' as Role,
  branch_name: '', branch_phone: '', shift1_name: '', shift2_name: '',
};

export default function UserManagement() {
  const { hasRole, user } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole('admin');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: '', phone: '', branch_name: '', branch_phone: '',
    shift1_name: '', shift2_name: '', password: '',
  });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, phone, branch_name, branch_phone, shift1_name, shift2_name, manager_id');
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    if (profiles) {
      const roleMap: Record<string, string[]> = {};
      roles?.forEach(r => {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
        roleMap[r.user_id].push(r.role);
      });
      setUsers(profiles.map((p: any) => ({ ...p, roles: roleMap[p.user_id] ?? [] })));
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
    toast({ title: `Role "${role}" added` });
  };

  const revokeRole = async (userId: string, role: string) => {
    if (userId === user?.id && role === 'admin') {
      toast({ title: "You can't remove your own admin role", variant: 'destructive' });
      return;
    }
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { action: 'revoke_role', user_id: userId, role },
    });
    const errMsg = (data as any)?.error ?? error?.message ?? '';
    if (errMsg) { toast({ title: 'Failed to revoke role', description: errMsg, variant: 'destructive' }); return; }
    toast({ title: `Role "${role}" revoked` });
    load();
  };

  const createUser = async () => {
    if (!createForm.email || !createForm.password || createForm.password.length < 6) {
      toast({ title: 'Email and password (min 6 chars) required', variant: 'destructive' });
      return;
    }
    if (createForm.role === 'agent' && !createForm.branch_name) {
      toast({ title: 'Branch name is required for agents', variant: 'destructive' });
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke('admin-create-user', { body: createForm });
    setCreating(false);
    const errMsg = (data as any)?.error ?? error?.message ?? '';
    if (errMsg) {
      const friendly = /already been registered|already exists|email_exists/i.test(errMsg)
        ? `A user with email "${createForm.email}" already exists.`
        : errMsg;
      toast({ title: 'Failed to create user', description: friendly, variant: 'destructive' });
      return;
    }
    toast({ title: 'User created', description: `${createForm.email} added as ${createForm.role}` });
    setCreateOpen(false);
    setCreateForm(emptyForm);
    load();
  };

  const openEdit = (u: UserProfile) => {
    setEditing(u);
    setEditForm({
      full_name: u.full_name ?? '',
      phone: u.phone ?? '',
      branch_name: u.branch_name ?? '',
      branch_phone: u.branch_phone ?? '',
      shift1_name: u.shift1_name ?? '',
      shift2_name: u.shift2_name ?? '',
      password: '',
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    const payload: any = { action: 'update', user_id: editing.user_id, ...editForm };
    if (!payload.password) delete payload.password;
    const { data, error } = await supabase.functions.invoke('admin-create-user', { body: payload });
    setSaving(false);
    const errMsg = (data as any)?.error ?? error?.message ?? '';
    if (errMsg) { toast({ title: 'Update failed', description: errMsg, variant: 'destructive' }); return; }
    toast({ title: 'User updated' });
    setEditOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { action: 'delete', user_id: deleteTarget.user_id },
    });
    const errMsg = (data as any)?.error ?? error?.message ?? '';
    if (errMsg) { toast({ title: 'Delete failed', description: errMsg, variant: 'destructive' }); setDeleteTarget(null); return; }
    toast({ title: 'User deleted' });
    setDeleteTarget(null);
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

  const availableRoles: Role[] = isAdmin ? ['admin', 'manager', 'agent', 'customer'] : ['agent'];

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl">User Management</h2>
          <p className="text-sm text-muted-foreground">{isAdmin ? 'Create, edit and delete admins, managers, agents and customers.' : 'Create and manage your agents.'}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 h-4 w-4" /> Create User</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>{isAdmin ? 'Create any role.' : 'Create an agent assigned to you.'}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={createForm.role} onValueChange={(v: Role) => setCreateForm({ ...createForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableRoles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-name">Full Name</Label>
                <Input id="cu-name" value={createForm.full_name} onChange={e => setCreateForm({ ...createForm, full_name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-email">Email</Label>
                <Input id="cu-email" type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} placeholder="user@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-pass">Password</Label>
                <Input id="cu-pass" type="text" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} placeholder="Min 6 characters" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-phone">Phone (optional)</Label>
                <Input id="cu-phone" value={createForm.phone} onChange={e => setCreateForm({ ...createForm, phone: e.target.value })} placeholder="+251..." />
              </div>

              {createForm.role === 'agent' && (
                <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Branch / Shift Info</p>
                  <div className="space-y-1.5">
                    <Label>Branch Name</Label>
                    <Input value={createForm.branch_name} onChange={e => setCreateForm({ ...createForm, branch_name: e.target.value })} placeholder="e.g. Main Street Outlet" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Branch Phone</Label>
                    <Input value={createForm.branch_phone} onChange={e => setCreateForm({ ...createForm, branch_phone: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Shift 1 Name</Label>
                    <Input value={createForm.shift1_name} onChange={e => setCreateForm({ ...createForm, shift1_name: e.target.value })} placeholder="e.g. Morning - Abebe" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Shift 2 Name (optional)</Label>
                    <Input value={createForm.shift2_name} onChange={e => setCreateForm({ ...createForm, shift2_name: e.target.value })} placeholder="e.g. Evening - Mulu" />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
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
                <TableHead>Branch</TableHead>
                <TableHead>Shifts</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Roles</TableHead>
                {isAdmin && <TableHead>Add Role</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : users.map(u => (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">{u.full_name || 'Unnamed'}</TableCell>
                  <TableCell>{u.branch_name ?? '-'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.shift1_name && <div>S1: {u.shift1_name}</div>}
                    {u.shift2_name && <div>S2: {u.shift2_name}</div>}
                    {!u.shift1_name && !u.shift2_name && '-'}
                  </TableCell>
                  <TableCell>{u.phone ?? u.branch_phone ?? '-'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map(r => (
                        <Badge key={r} className={`${roleColor(r)} flex items-center gap-1`}>
                          {r}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => revokeRole(u.user_id, r)}
                              className="ml-0.5 rounded-full hover:bg-background/20"
                              aria-label={`Revoke ${r}`}
                              title={`Revoke ${r}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Select onValueChange={val => addRole(u.user_id, val)}>
                        <SelectTrigger className="w-32"><SelectValue placeholder="Add role" /></SelectTrigger>
                        <SelectContent>
                          {(['admin', 'manager', 'agent', 'customer'] as const)
                            .filter(r => !u.roles.includes(r))
                            .map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {isAdmin && u.user_id !== user?.id && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(u)} title="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update profile details. Leave password empty to keep it unchanged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Branch / Shift (agents)</p>
              <div className="space-y-1.5">
                <Label>Branch Name</Label>
                <Input value={editForm.branch_name} onChange={e => setEditForm({ ...editForm, branch_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Branch Phone</Label>
                <Input value={editForm.branch_phone} onChange={e => setEditForm({ ...editForm, branch_phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Shift 1 Name</Label>
                <Input value={editForm.shift1_name} onChange={e => setEditForm({ ...editForm, shift1_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Shift 2 Name</Label>
                <Input value={editForm.shift2_name} onChange={e => setEditForm({ ...editForm, shift2_name: e.target.value })} />
              </div>
            </div>
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>Reset Password (optional, min 6)</Label>
                <Input type="text" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder="Leave empty to keep current" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.full_name || 'this user'}</strong> and all their roles. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
