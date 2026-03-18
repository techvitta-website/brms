import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { NotificationListener } from "@/components/notifications/NotificationListener";
import Dashboard from "./pages/Dashboard";
// import Quotations from "./pages/Quotations";
import Receipts from "./pages/Receipts";
import Invoices from "./pages/Invoices";
import Expenses from "./pages/Expenses";
import ExternalExpenses from "./pages/ExternalExpenses";
import Employees from "./pages/Employees";
import Payroll from "./pages/Payroll";
import PayrollEmployeeDetails from "./pages/PayrollEmployeeDetails";
import Statement from "./pages/Statement";
import StatementTransactions from "./pages/StatementTransactions";
import Transactions from "./pages/Transactions";
import CategoryTransactions from "./pages/CategoryTransactions";
// import Reports from "./pages/Reports";
// import AuditLogs from "./pages/AuditLogs";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Viewstatement from "./Viewstatement";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <NotificationListener />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            {/* <Route
              path="/quotations"
              element={
                <ProtectedRoute requiredRoles={["super_admin", "admin", "finance_manager", "accountant"]}>
                  <Quotations />
                </ProtectedRoute>
              }
            /> */}
            <Route
            path='/view-statement'
            element={
              <ProtectedRoute >
                <Viewstatement />
              </ProtectedRoute>
            }
            />
            <Route
              path="/receipts"
              element={
                <ProtectedRoute>
                  <Receipts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/invoices"
              element={
                <ProtectedRoute requiredRoles={["super_admin", "admin", "finance_manager", "accountant"]}>
                  <Invoices />
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                  <Expenses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/external-expenses"
              element={
                <ProtectedRoute>
                  <ExternalExpenses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payroll"
              element={
                <ProtectedRoute requiredRoles={["super_admin", "admin", "finance_manager", "hr"]}>
                  <Payroll />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payroll/employee/:employeeId"
              element={
                <ProtectedRoute requiredRoles={["super_admin", "admin", "finance_manager", "hr"]}>
                  <PayrollEmployeeDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/statement"
              element={
                <ProtectedRoute requiredRoles={["super_admin", "admin", "finance_manager", "accountant"]}>
                  <Statement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/statement/:statementId/transactions"
              element={
                <ProtectedRoute requiredRoles={["super_admin", "admin", "finance_manager", "accountant"]}>
                  <StatementTransactions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/transactions"
              element={
                <ProtectedRoute requiredRoles={["super_admin", "admin", "finance_manager", "accountant", "auditor"]}>
                  <Transactions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/category-transactions"
              element={
                <ProtectedRoute>
                  <CategoryTransactions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/employees"
              element={
                <ProtectedRoute requiredRoles={["super_admin", "admin", "hr"]}>
                  <Employees />
                </ProtectedRoute>
              }
            />
            {/* <Route
              path="/reports"
              element={
                <ProtectedRoute requiredRoles={["super_admin", "admin", "finance_manager", "accountant", "auditor"]}>
                  <Reports />
                </ProtectedRoute>
              }
            /> */}
            {/* <Route
              path="/audit-logs"
              element={
                <ProtectedRoute requiredRoles={["super_admin", "admin", "auditor"]}>
                  <AuditLogs />
                </ProtectedRoute>
              }
            /> */}
            <Route
              path="/users"
              element={
                <ProtectedRoute requiredRoles={["super_admin", "admin"]}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute requiredRoles={["super_admin", "admin"]}>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute requiredRoles={["super_admin", "admin", "finance_manager", "accountant"]}>
                  <Notifications />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
