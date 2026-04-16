import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Categories from "./pages/Categories";
import Branches from "./pages/Branches";
import Deliveries from "./pages/Deliveries";
import AgentDeliveries from "./pages/AgentDeliveries";
import Orders from "./pages/Orders";
import Reports from "./pages/Reports";
import UserManagement from "./pages/UserManagement";
import CustomerOrder from "./pages/CustomerOrder";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<CustomerOrder />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/categories" element={<ProtectedRoute><Categories /></ProtectedRoute>} />
            <Route path="/branches" element={<ProtectedRoute><Branches /></ProtectedRoute>} />
            <Route path="/deliveries" element={<ProtectedRoute><Deliveries /></ProtectedRoute>} />
            <Route path="/agent/deliveries" element={<ProtectedRoute><AgentDeliveries /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
