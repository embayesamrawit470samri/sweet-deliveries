import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface UserProfile {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  roles: string[];
}

export default function UserManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

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
    const { error } = await supabase.from('user_roles').insert({ user_id: userId, role });
    if (error) {
      if (error.code === '23505') { toast({ title: 'Already has this role' }); return; }
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    load();
    toast({ title: `Role ${role} added` });
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
      <h2 className="font-serif text-2xl">User Management</h2>
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
