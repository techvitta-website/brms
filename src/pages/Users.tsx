import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Shield,
  UserCheck,
  UserX,
  Key,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { UserDialog } from "@/components/users/UserDialog";
import { ViewProfileDialog } from "@/components/users/ViewProfileDialog";
import { EditUserDialog } from "@/components/users/EditUserDialog";
import { ManageRolesDialog } from "@/components/users/ManageRolesDialog";
import { useUsers, UserWithRoles } from "@/hooks/useUsers";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";

// Hash password using Web Crypto PBKDF2 (returns iterations:salt:hash in hex)
async function hashPassword(password: string) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  const derived = new Uint8Array(derivedBits);
  const toHex = (arr: Uint8Array) =>
    Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return `${iterations}:${toHex(salt)}:${toHex(derived)}`;
}

interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  roles: string[];
  status: "active" | "inactive";
  lastLogin: string;
  createdAt: string;
}


const roleColors: Record<string, string> = {
  super_admin: "bg-primary text-primary-foreground",
  admin: "bg-primary/80 text-primary-foreground",
  finance_manager: "bg-success/10 text-success border-success/20",
  accountant: "bg-info/10 text-info border-info/20",
  hr: "bg-warning/10 text-warning border-warning/20",
  employee: "bg-muted text-muted-foreground",
  auditor: "bg-secondary text-secondary-foreground",
};

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  finance_manager: "Finance Manager",
  accountant: "Accountant",
  hr: "HR",
  employee: "Employee",
  auditor: "Auditor",
};

const Users = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: usersData, isLoading } = useUsers();

  // Map database users to display format
  const mappedUsers = (usersData || []).map((user) => {
    return {
      id: user.id,
      name: user.full_name || user.email || "Unknown",
      email: user.email || "",
      avatar: user.full_name?.toLowerCase().replace(/\s+/g, "-") || user.email?.split("@")[0] || "user",
      roles: user.roles || [],
      status: "active" as const, // Assume active for now
      lastLogin: user.updated_at ? format(new Date(user.updated_at), "MMM d, yyyy HH:mm") : "Never",
      createdAt: user.created_at ? format(new Date(user.created_at), "MMM d, yyyy") : "Unknown",
    };
  });

  // Get unique roles
  const uniqueRoles = [...new Set(mappedUsers.flatMap((u) => u.roles))];

  // Filter users based on search query and filters
  const displayUsers = mappedUsers.filter((user) => {
    const matchesSearch =
      !searchQuery ||
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.roles.some((role) => role.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRole = roleFilter === "all" || user.roles.includes(roleFilter);
    const matchesStatus = statusFilter === "all" || user.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  const activeUsers = displayUsers.filter((u) => u.status === "active").length;
  const inactiveUsers = displayUsers.filter((u) => u.status === "inactive").length;

  const handleAddUser = () => {
    setSelectedUser(null);
    setDialogOpen(true);
  };

  const handleViewProfile = (displayUser: User) => {
    // Find the original user data from database
    const originalUser = usersData?.find((u) => u.id === displayUser.id);
    if (originalUser) {
      setSelectedUser(originalUser as UserWithRoles);
      setViewDialogOpen(true);
    }
  };

  const handleEditUser = (displayUser: User) => {
    // Find the original user data from database
    const originalUser = usersData?.find((u) => u.id === displayUser.id);
    if (originalUser) {
      setSelectedUser(originalUser as UserWithRoles);
      setEditDialogOpen(true);
    }
  };

  const handleManageRoles = (displayUser: User) => {
    // Find the original user data from database
    const originalUser = usersData?.find((u) => u.id === displayUser.id);
    if (originalUser) {
      setSelectedUser(originalUser as UserWithRoles);
      setRolesDialogOpen(true);
    }
  };

  const { isAdmin, user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<UserWithRoles | null>(null);
  const [resetPasswordValues, setResetPasswordValues] = useState({
    password: "",
    confirmPassword: "",
  });
  const [isResetting, setIsResetting] = useState(false);
  const passwordsMatch = resetPasswordValues.password === resetPasswordValues.confirmPassword;
  const passwordValidLength = resetPasswordValues.password.length >= 6;

  const openResetDialog = (displayUser: User) => {
    // Permission check: only admins can reset other users
    if (!isAdmin() && currentUser?.id !== displayUser.id) {
      toast({
        title: "Permission denied",
        description: "Only Admins can reset other users' passwords.",
        variant: "destructive",
      });
      return;
    }

    const originalUser = usersData?.find((u) => u.id === displayUser.id);
    setResetTargetUser(originalUser as UserWithRoles | null);
    setResetPasswordValues({ password: "", confirmPassword: "" });
    setResetDialogOpen(true);
  };

  const handleConfirmReset = async () => {
    if (!resetTargetUser) return;
    const newPassword = resetPasswordValues.password;
    const confirm = resetPasswordValues.confirmPassword;

    if (!newPassword || newPassword.length < 6) {
      toast({
        title: "Invalid password",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirm) {
      toast({
        title: "Password mismatch",
        description: "New password and confirm password do not match.",
        variant: "destructive",
      });
      return;
    }

    setIsResetting(true);
    try {
      // Change the real Supabase Auth password via the secure admin edge function.
      // (The old code wrote a hash into employees.password, which never affected login.)
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { targetUserId: resetTargetUser.id, newPassword },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (error) throw error;

      toast({
        title: "Password updated",
        description: `Password updated for ${resetTargetUser.email}`,
      });

      // Invalidate employees cache
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setResetDialogOpen(false);
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err?.message || "Failed to update password.",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <DashboardLayout>
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground">
              Manage users, roles, and permissions
            </p>
          </div>
          <Button onClick={handleAddUser}>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card variant="stat" className="p-4">
          <p className="text-sm text-muted-foreground">Total Users</p>
          <p className="text-2xl font-bold">{displayUsers.length}</p>
        </Card>
        <Card variant="stat" className="p-4">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="text-2xl font-bold text-success">{activeUsers}</p>
        </Card>
        <Card variant="stat" className="p-4">
          <p className="text-sm text-muted-foreground">Inactive</p>
          <p className="text-2xl font-bold text-muted-foreground">{inactiveUsers}</p>
        </Card>
        <Card variant="stat" className="p-4">
          <p className="text-sm text-muted-foreground">Admins</p>
          <p className="text-2xl font-bold">
            {displayUsers.filter((u) => u.roles.includes("super_admin") || u.roles.includes("admin")).length}
          </p>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Search users..." 
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {uniqueRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {roleLabels[role] || role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading users...
                  </TableCell>
                </TableRow>
              ) : displayUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No users found. Click "Add User" to get started.
                  </TableCell>
                </TableRow>
              ) : (
                displayUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.avatar}`}
                        />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge key={role} className={roleColors[role]}>
                          {roleLabels[role]}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.status === "active" ? (
                      <Badge variant="success" className="gap-1">
                        <UserCheck className="h-3 w-3" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="muted" className="gap-1">
                        <UserX className="h-3 w-3" />
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.lastLogin}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.createdAt}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewProfile(user)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditUser(user)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleManageRoles(user)}>
                          <Shield className="mr-2 h-4 w-4" />
                          Manage Roles
                        </DropdownMenuItem>
                        {(isAdmin() || currentUser?.id === user.id) && (
                          <DropdownMenuItem onClick={() => openResetDialog(user)}>
                            <Key className="mr-2 h-4 w-4" />
                            Reset Password
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Deactivate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* User Dialogs */}
      <UserDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <ViewProfileDialog
        user={selectedUser}
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
      />
      <EditUserDialog
        user={selectedUser}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
      <ManageRolesDialog
        user={selectedUser}
        open={rolesDialogOpen}
        onOpenChange={setRolesDialogOpen}
      />
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Set New Password</DialogTitle>
            <DialogDescription>
              Enter a new password for {resetTargetUser?.full_name || resetTargetUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={resetPasswordValues.password}
                onChange={(e) =>
                  setResetPasswordValues((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="Minimum 6 characters"
              />
              {resetPasswordValues.password && !passwordValidLength && (
                <p className="text-xs text-destructive">Password must be at least 6 characters</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={resetPasswordValues.confirmPassword}
                onChange={(e) =>
                  setResetPasswordValues((prev) => ({ ...prev, confirmPassword: e.target.value }))
                }
                placeholder="Confirm password"
              />
              {resetPasswordValues.confirmPassword && !passwordsMatch && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReset}
              disabled={isResetting || !passwordValidLength || !passwordsMatch}
            >
              {isResetting ? "Saving..." : "Save Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Users;
