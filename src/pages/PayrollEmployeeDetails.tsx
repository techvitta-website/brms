import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/hooks/useCompany";
import { usePayslips } from "@/hooks/usePayslips";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ArrowLeft, Download, Eye, Loader2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { generatePayslipPDF, downloadPDF, Payslip } from "@/components/payroll/PayslipPDF";
import { PayslipDialog } from "@/components/payroll/PayslipDialog";

const statusLabel: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  processing: "Processing",
};

const PayrollEmployeeDetails = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { employeeId } = useParams<{ employeeId: string }>();
  const { data: company } = useCompany();
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const { data: payslipsData, isLoading } = usePayslips();
  const [basicInformation, setBasicInformation] = useState({
    name: "",
    emailAddress: "",
    mobileNumber: "",
    dateOfJoining: "",
    gender: "",
    workLocation: "",
    designation: "",
    departments: "",
  });
  const [personalInformation, setPersonalInformation] = useState({
    dateOfBirth: "",
    fathersName: "",
    pan: "",
    emailAddress: "",
    residentialAddress: "",
    differentlyAbledType: "",
  });
  const [paymentInformation, setPaymentInformation] = useState({
    paymentMode: "",
    accountNumber: "",
    accountHolderName: "",
    bankName: "",
    ifsc: "",
    accountType: "",
  });
  const [salaryDetails, setSalaryDetails] = useState({
    annualCtc: 0,
    conveyanceAllowance: 0,
    medicalReimbursement: 0,
    otherBenefit: 0,
    specialAllowance: 0,
  });
  const [isRevisingAnnualCtc, setIsRevisingAnnualCtc] = useState(false);
  const [annualCtcDraft, setAnnualCtcDraft] = useState("0");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  const [isPayslipDialogOpen, setIsPayslipDialogOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [employeeDetailsData, setEmployeeDetailsData] = useState<any>(null);
  const [customSalaryComponents, setCustomSalaryComponents] = useState<Array<{ id: string; label: string; monthly: number }>>([]);
  const [lastAddedComponentId, setLastAddedComponentId] = useState<string | null>(null);
  const componentRowRefs = useRef<{ [key: string]: HTMLTableRowElement | null }>({});
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [updatingStatusPayslipId, setUpdatingStatusPayslipId] = useState<string | null>(null);

  const employeePayslips = useMemo(() => {
    return (payslipsData || [])
      .filter((payslip) => payslip.employee_id === employeeId)
      .sort((a, b) => {
        const periodDiff = new Date(b.period_start).getTime() - new Date(a.period_start).getTime();
        if (periodDiff !== 0) return periodDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [employeeId, payslipsData]);

  const latestPayslip = employeePayslips[0];
  const employee = latestPayslip?.employees;
  const currency = company?.currency || "INR";

  // Calculate payslip values from employee_details for display in table
  const calculatePayslipValues = (payslipData: any) => {
    // Use employee_details if available, otherwise fallback to payslip data
    let basicMonthly: number;
    let houseRentMonthly: number;
    let conveyanceMonthly: number;
    let medicalMonthly: number;
    let otherBenefitMonthly: number;
    let specialAllowanceMonthly: number;
    
    if (employeeDetailsData) {
      // Use employee_details data directly
      basicMonthly = Number(employeeDetailsData.basic_monthly || 0);
      houseRentMonthly = Number(employeeDetailsData.house_rent_allowance_monthly || 0);
      conveyanceMonthly = Number(employeeDetailsData.conveyance_allowance_monthly || 0);
      medicalMonthly = Number(employeeDetailsData.medical_reimbursement_monthly || 0);
      otherBenefitMonthly = Number(employeeDetailsData.other_benefit_monthly || 0);
      specialAllowanceMonthly = Number(employeeDetailsData.special_allowance_monthly || 0);
    } else if (salaryDetails.annualCtc > 0) {
      // Fallback to calculated values from salaryDetails state
      basicMonthly = (salaryDetails.annualCtc / 12) * 0.5; // 50% of monthly CTC
      houseRentMonthly = basicMonthly * 0.4; // 40% of basic
      conveyanceMonthly = salaryDetails.conveyanceAllowance || 0;
      medicalMonthly = salaryDetails.medicalReimbursement || 0;
      otherBenefitMonthly = salaryDetails.otherBenefit || 0;
      specialAllowanceMonthly = salaryDetails.specialAllowance || 0;
    } else {
      // Final fallback to payslip data
      basicMonthly = Number(payslipData.basic_salary || 0);
      houseRentMonthly = basicMonthly * 0.4;
      conveyanceMonthly = 0;
      medicalMonthly = 0;
      otherBenefitMonthly = 0;
      specialAllowanceMonthly = 0;
    }
    
    const totalAllowances = houseRentMonthly + conveyanceMonthly + medicalMonthly + 
                 otherBenefitMonthly + specialAllowanceMonthly;
    const annualCtcForDeductions = Number(employeeDetailsData?.annual_ctc || salaryDetails.annualCtc || 0);
    const professionalTax = annualCtcForDeductions > 0 ? 200.00 : 0;
    const netPay = basicMonthly + totalAllowances - professionalTax;
    
    return {
      basic: basicMonthly,
      allowances: totalAllowances,
      deductions: professionalTax,
      netPay: netPay,
    };
  };

  useEffect(() => {
    setBasicInformation({
      name: employee?.full_name || "",
      emailAddress: employee?.email || "",
      mobileNumber: "",
      dateOfJoining: "",
      gender: "",
      workLocation: "",
      designation: employee?.position || "",
      departments: employee?.department || "",
    });

    setPersonalInformation({
      dateOfBirth: "",
      fathersName: "",
      pan: "",
      emailAddress: employee?.email || "",
      residentialAddress: "",
      differentlyAbledType: "",
    });

    setPaymentInformation({
      paymentMode: "Bank Transfer",
      accountNumber: "",
      accountHolderName: employee?.full_name || "",
      bankName: "",
      ifsc: "",
      accountType: "",
    });

    const annualCtc = Number(latestPayslip?.net_pay || 0) * 12;
    const monthlyCtc = annualCtc / 12;
    const basicMonthly = monthlyCtc * 0.5;
    const houseRentMonthly = basicMonthly * 0.4;
    const residual = Math.max(monthlyCtc - basicMonthly - houseRentMonthly, 0);

    setSalaryDetails({
      annualCtc,
      conveyanceAllowance: residual * 0.2,
      medicalReimbursement: residual * 0.15,
      otherBenefit: residual * 0.25,
      specialAllowance: residual * 0.4,
    });
    setAnnualCtcDraft(String(annualCtc));
    setIsRevisingAnnualCtc(false);
  }, [employee?.department, employee?.email, employee?.full_name, employee?.position]);

  const salaryBreakdown = useMemo(() => {
    if (!employeePayslips.length) {
      return {
        basicSalary: 0,
        averageAllowances: 0,
        averageDeductions: 0,
        averageNetPay: 0,
      };
    }

    const totalAllowances = employeePayslips.reduce((sum, payslip) => sum + Number(payslip.allowances || 0), 0);
    const totalDeductions = employeePayslips.reduce((sum, payslip) => sum + Number(payslip.deductions || 0), 0);
    const totalNetPay = employeePayslips.reduce((sum, payslip) => sum + Number(payslip.net_pay || 0), 0);

    return {
      basicSalary: Number(latestPayslip?.basic_salary || 0),
      averageAllowances: totalAllowances / employeePayslips.length,
      averageDeductions: totalDeductions / employeePayslips.length,
      averageNetPay: totalNetPay / employeePayslips.length,
    };
  }, [employeePayslips, latestPayslip?.basic_salary]);

  const canEditSalaryComponents = isAdmin();

  const handleUpdatePayslipStatus = async (payslipId: string, status: "paid" | "pending") => {
    try {
      setUpdatingStatusPayslipId(payslipId);

      const { error } = await supabase
        .from("payslips")
        .update({ status })
        .eq("id", payslipId);

      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payslips"] }),
        queryClient.invalidateQueries({ queryKey: ["payslip-stats"] }),
      ]);

      toast({
        title: "Status updated",
        description: `Payslip marked as ${statusLabel[status]}.`,
      });
    } catch (error: any) {
      console.error("Failed to update payslip status:", error);
      toast({
        title: "Failed to update status",
        description: error?.message || "Could not update payslip status.",
        variant: "destructive",
      });
    } finally {
      setUpdatingStatusPayslipId(null);
    }
  };

  const monthlyCtc = salaryDetails.annualCtc / 12;
  const basicMonthly = monthlyCtc * 0.5;
  const basicAnnual = basicMonthly * 12;
  const houseRentMonthly = basicMonthly * 0.4;
  const houseRentAnnual = houseRentMonthly * 12;

  const professionalTaxMonthly = salaryDetails.annualCtc > 0 ? 200.00 : 0;
  const professionalTaxAnnual = professionalTaxMonthly * 12;

  const salaryRows = [
    {
      key: "basic",
      label: "Basic",
      description: "50.00 % of CTC",
      monthly: basicMonthly,
      annual: basicAnnual,
      editable: false,
    },
    {
      key: "house-rent",
      label: "House Rent Allowance",
      description: "40.00 % of Basic Amount",
      monthly: houseRentMonthly,
      annual: houseRentAnnual,
      editable: false,
    },
    {
      key: "conveyance",
      label: "Conveyance Allowance",
      description: "Editable Component",
      monthly: salaryDetails.conveyanceAllowance,
      annual: salaryDetails.conveyanceAllowance * 12,
      editable: true,
      field: "conveyanceAllowance" as const,
    },
    {
      key: "medical",
      label: "Medical Reimbursement",
      description: "Editable Component",
      monthly: salaryDetails.medicalReimbursement,
      annual: salaryDetails.medicalReimbursement * 12,
      editable: true,
      field: "medicalReimbursement" as const,
    },
    {
      key: "other-benefit",
      label: "Other Benefit",
      description: "Editable Component",
      monthly: salaryDetails.otherBenefit,
      annual: salaryDetails.otherBenefit * 12,
      editable: true,
      field: "otherBenefit" as const,
    },
    {
      key: "special",
      label: "Special Allowance",
      description: "Editable Component",
      monthly: salaryDetails.specialAllowance,
      annual: salaryDetails.specialAllowance * 12,
      editable: true,
      field: "specialAllowance" as const,
    },
    {
      key: "professional-tax",
      label: "Professional Tax",
      description: "Constant Deduction",
      monthly: professionalTaxMonthly,
      annual: professionalTaxAnnual,
      editable: false,
      isDeduction: true,
    },
  ];

  // Add custom components to salary rows
  const allSalaryRows = [
    ...salaryRows,
    ...customSalaryComponents.map((component) => ({
      key: component.id,
      label: component.label,
      description: "Custom Component",
      monthly: component.monthly,
      annual: component.monthly * 12,
      editable: true,
      isCustom: true,
    })),
  ];

  const customComponentsTotal = customSalaryComponents.reduce((sum, comp) => sum + comp.monthly, 0);
  
  // CTC includes earnings only, not deductions like Professional Tax
  const totalMonthlyCtc =
    basicMonthly +
    houseRentMonthly +
    salaryDetails.conveyanceAllowance +
    salaryDetails.medicalReimbursement +
    salaryDetails.otherBenefit +
    salaryDetails.specialAllowance +
    customComponentsTotal;
  const totalAnnualCtc = salaryDetails.annualCtc;
  
  // Net Pay = CTC - Professional Tax
  const netPayMonthly = totalMonthlyCtc - professionalTaxMonthly;
  const netPayAnnual = totalAnnualCtc - professionalTaxAnnual;

  const parseCurrencyInput = (value: string) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 0;
    return Math.max(parsed, 0);
  };

  const handleAddCustomComponent = () => {
    const newComponent = {
      id: `custom-${Date.now()}`,
      label: "",
      monthly: 0,
    };
    setCustomSalaryComponents([...customSalaryComponents, newComponent]);
    setLastAddedComponentId(newComponent.id);
    
    // Scroll to the new row after a short delay to ensure DOM is updated
    setTimeout(() => {
      const rowElement = componentRowRefs.current[newComponent.id];
      if (rowElement) {
        rowElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  const handleRemoveCustomComponent = (id: string) => {
    setCustomSalaryComponents(customSalaryComponents.filter((comp) => comp.id !== id));
  };

  const handleUpdateCustomComponent = (id: string, field: "label" | "monthly", value: string | number) => {
    setCustomSalaryComponents(
      customSalaryComponents.map((comp) =>
        comp.id === id ? { ...comp, [field]: value } : comp
      )
    );
  };

  // Auto-save custom components when data is complete
  const autoSaveCustomComponents = async () => {
    if (!employeeId || !company?.id) return;
    
    // Filter out incomplete components (empty label or zero amount)
    const completeComponents = customSalaryComponents.filter(
      (comp) => comp.label.trim() && comp.monthly > 0
    );
    
    // Only save if there are complete custom components
    if (completeComponents.length === 0 && customSalaryComponents.length === 0) return;
    
    try {
      setIsAutoSaving(true);
      
      // Get existing employee_details record first
      const { data: existingData } = await (supabase as any)
        .from("employee_details")
        .select("*")
        .eq("employee_id", employeeId)
        .maybeSingle();

      const payload: any = {
        employee_id: employeeId,
        company_id: company.id,
        created_by: user?.id || null,
        custom_salary_components: completeComponents.length > 0 ? completeComponents : [],
      };

      // If employee_details record exists, update it; otherwise create new one
      const { error } = await (supabase as any)
        .from("employee_details")
        .upsert(payload, { onConflict: "employee_id" });

      if (error) {
        console.error("Auto-save failed:", error);
        // Don't show error toast for auto-save failures
      } else {
        // Clear the highlight after successful save
        if (lastAddedComponentId) {
          setTimeout(() => setLastAddedComponentId(null), 2000);
        }
      }
    } catch (error) {
      console.error("Auto-save failed:", error);
    } finally {
      setIsAutoSaving(false);
    }
  };

  // Auto-save when component data changes and is complete (debounced)
  useEffect(() => {
    if (customSalaryComponents.length > 0) {
      const hasCompleteComponents = customSalaryComponents.some(
        (comp) => comp.label.trim() && comp.monthly > 0
      );
      
      if (hasCompleteComponents) {
        // Debounce auto-save - wait 1.5 seconds after last change
        const timeoutId = setTimeout(() => {
          autoSaveCustomComponents();
        }, 1500);
        
        return () => clearTimeout(timeoutId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customSalaryComponents]);

  useEffect(() => {
    const loadEmployeeDetails = async () => {
      if (!employeeId || !company?.id) return;

      const { data, error } = await (supabase as any)
        .from("employee_details")
        .select("*")
        .eq("employee_id", employeeId)
        .maybeSingle();

      if (error) {
        console.error("Failed to load employee_details:", error);
        return;
      }

      if (!data) return;

      setBasicInformation({
        name: data.name || "",
        emailAddress: data.basic_email_address || "",
        mobileNumber: data.mobile_number || "",
        dateOfJoining: data.date_of_joining || "",
        gender: data.gender || "",
        workLocation: data.work_location || "",
        designation: data.designation || "",
        departments: data.departments || "",
      });

      setPersonalInformation({
        dateOfBirth: data.date_of_birth || "",
        fathersName: data.fathers_name || "",
        pan: data.pan || "",
        emailAddress: data.personal_email_address || "",
        residentialAddress: data.residential_address || "",
        differentlyAbledType: data.differently_abled_type || "",
      });

      setPaymentInformation({
        paymentMode: data.payment_mode || "",
        accountNumber: data.account_number || "",
        accountHolderName: data.account_holder_name || "",
        bankName: data.bank_name || "",
        ifsc: data.ifsc || "",
        accountType: data.account_type || "",
      });

      const loadedAnnualCtc = Number(data.annual_ctc || 0);
      setSalaryDetails({
        annualCtc: loadedAnnualCtc,
        conveyanceAllowance: Number(data.conveyance_allowance_monthly || 0),
        medicalReimbursement: Number(data.medical_reimbursement_monthly || 0),
        otherBenefit: Number(data.other_benefit_monthly || 0),
        specialAllowance: Number(data.special_allowance_monthly || 0),
      });
      setAnnualCtcDraft(String(loadedAnnualCtc));
      setEmployeeDetailsData(data); // Store the full employee_details data
      
      // Load custom salary components if they exist
      if (data.custom_salary_components && Array.isArray(data.custom_salary_components)) {
        setCustomSalaryComponents(data.custom_salary_components);
      } else {
        setCustomSalaryComponents([]);
      }
    };

    loadEmployeeDetails();
  }, [employeeId, company?.id]);

  // Calculate payslip breakdown from salary details - now async to fetch employee_details
  const calculatePayslipBreakdown = async (payslipData: any): Promise<Payslip> => {
    const periodStart = new Date(payslipData.period_start);
    const periodEnd = new Date(payslipData.period_end);
    const period = format(periodStart, "MMMM yyyy");
    
    // Calculate days in period
    const daysInMonth = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const paidDays = daysInMonth;
    const lopDays = 0;

    // Fetch employee_details directly - try multiple ways to get employee UUID
    let empDetails: any = null;
    let empUuid: string | null = employeeId || null;
    
    // If we don't have employeeId from route, try to get it from payslip
    if (!empUuid && payslipData.employee_id) {
      empUuid = payslipData.employee_id;
    }
    
    if (empUuid) {
      try {
        // Check if it's a UUID format, if not, it might be employee_number
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(empUuid);
        
        if (!isUUID) {
          // It's employee_number, get UUID from employees table
          const { data: empData } = await supabase
            .from("employees")
            .select("id")
            .eq("employee_number", empUuid)
            .maybeSingle();
          
          if (empData) {
            empUuid = empData.id;
          } else {
            console.error("Could not find employee with employee_number:", empUuid);
            empUuid = null;
          }
        }
        
        if (empUuid) {
          const { data } = await (supabase as any)
            .from("employee_details")
            .select("*")
            .eq("employee_id", empUuid)
            .maybeSingle();
          empDetails = data;
        }
      } catch (error) {
        console.error("Failed to fetch employee_details:", error);
      }
    }

    // Get salary components from employee_details or calculate from basic salary
    const basicMonthly = empDetails?.basic_monthly || Number(payslipData.basic_salary || 0);
    const houseRentMonthly = empDetails?.house_rent_allowance_monthly || (basicMonthly * 0.4); // 40% of basic
    const conveyanceMonthly = empDetails?.conveyance_allowance_monthly || salaryDetails.conveyanceAllowance || 0;
    const medicalMonthly = empDetails?.medical_reimbursement_monthly || salaryDetails.medicalReimbursement || 0;
    const otherBenefitMonthly = empDetails?.other_benefit_monthly || salaryDetails.otherBenefit || 0;
    const specialAllowanceMonthly = empDetails?.special_allowance_monthly || salaryDetails.specialAllowance || 0;

    const annualCtcForDeductions = Number(empDetails?.total_annual_ctc || empDetails?.annual_ctc || salaryDetails.annualCtc || 0);
    const professionalTax = annualCtcForDeductions > 0 ? 200.00 : 0;

    // Calculate YTD by summing all payslips from the start of the year up to this period
    const payslipYear = periodStart.getFullYear();
    const yearStart = new Date(payslipYear, 0, 1);
    
    // Get all payslips for this employee from the start of the year up to this period
    const ytdPayslips = employeePayslips.filter((p) => {
      const pDate = new Date(p.period_start);
      return pDate >= yearStart && pDate <= periodEnd;
    });
    
    // Calculate YTD values by summing all payslips
    const calculateYTD = (monthlyValue: number) => {
      return monthlyValue * ytdPayslips.length;
    };

    const earnings = {
      basic: basicMonthly,
      houseRentAllowance: houseRentMonthly,
      conveyanceAllowance: conveyanceMonthly,
      medicalReimbursement: medicalMonthly,
      otherBenefit: otherBenefitMonthly,
      specialAllowance: specialAllowanceMonthly,
    };

    const earningsYTD = {
      basic: calculateYTD(basicMonthly),
      houseRentAllowance: calculateYTD(houseRentMonthly),
      conveyanceAllowance: calculateYTD(conveyanceMonthly),
      medicalReimbursement: calculateYTD(medicalMonthly),
      otherBenefit: calculateYTD(otherBenefitMonthly),
      specialAllowance: calculateYTD(specialAllowanceMonthly),
    };

    const deductions = {
      professionalTax: professionalTax,
    };

    const deductionsYTD = {
      professionalTax: calculateYTD(professionalTax),
    };

    const grossEarnings = basicMonthly + houseRentMonthly + conveyanceMonthly + 
                          medicalMonthly + otherBenefitMonthly + specialAllowanceMonthly;
    const totalDeductions = professionalTax;
    const netPay = grossEarnings - totalDeductions;

    return {
      id: payslipData.id,
      employee: {
        name: empDetails?.name || employee?.full_name || "",
        position: empDetails?.designation || employee?.position || "",
        employeeId: employee?.employee_number || undefined,
        dateOfJoining: empDetails?.date_of_joining || basicInformation.dateOfJoining || employee?.hire_date || undefined,
        bankAccountNo: empDetails?.account_number || paymentInformation.accountNumber || undefined,
        avatar: employee?.email || employee?.full_name || "employee",
      },
      period,
      payDate: payslipData.pay_date || periodEnd.toISOString(),
      paidDays,
      lopDays,
      earnings,
      earningsYTD,
      deductions,
      deductionsYTD,
      grossEarnings,
      totalDeductions,
      netPay,
      status: (payslipData.status as "paid" | "pending" | "processing") || "pending",
    };
  };

  const handleViewPayslip = async (payslipData: any) => {
    const payslip = await calculatePayslipBreakdown(payslipData);
    setSelectedPayslip(payslip);
    setIsPayslipDialogOpen(true);
  };

  const handleDownloadPDF = async (payslipData: any) => {
    try {
      setDownloadingId(payslipData.id);
      
      const payslip = await calculatePayslipBreakdown(payslipData);
      const blob = await generatePayslipPDF(
        payslip,
        "Techvitta Innovations Pvt Ltd",
        "Plot No 19, Opp Cyber Pearl, Hitech City, Madhapur, Hyderabad Telangana 500081\nIndia"
      );
      
      const filename = `Payslip_${payslip.employee.employeeId || payslip.id}_${format(new Date(payslipData.period_start), "MMM_yyyy")}.pdf`;
      downloadPDF(blob, filename);
      
      toast({
        title: "PDF downloaded",
        description: `Payslip for ${payslip.employee.name} has been downloaded`,
      });
    } catch (error) {
      console.error("PDF generation failed:", error);
      toast({
        title: "Download failed",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSaveEmployeeDetails = async (sectionName: string) => {
    if (!employeeId || !company?.id) {
      toast({
        title: "Missing employee context",
        description: "Cannot save employee details right now.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSaving(true);

      const payload = {
        employee_id: employeeId,
        company_id: company.id,
        created_by: user?.id || null,

        name: basicInformation.name || "",
        basic_email_address: basicInformation.emailAddress || null,
        mobile_number: basicInformation.mobileNumber || null,
        date_of_joining: basicInformation.dateOfJoining || null,
        gender: basicInformation.gender || null,
        work_location: basicInformation.workLocation || null,
        designation: basicInformation.designation || null,
        departments: basicInformation.departments || null,

        date_of_birth: personalInformation.dateOfBirth || null,
        fathers_name: personalInformation.fathersName || null,
        pan: personalInformation.pan || null,
        personal_email_address: personalInformation.emailAddress || null,
        residential_address: personalInformation.residentialAddress || null,
        differently_abled_type: personalInformation.differentlyAbledType || null,

        payment_mode: paymentInformation.paymentMode || null,
        account_number: paymentInformation.accountNumber || null,
        account_holder_name: paymentInformation.accountHolderName || null,
        bank_name: paymentInformation.bankName || null,
        ifsc: paymentInformation.ifsc || null,
        account_type: paymentInformation.accountType || null,

        annual_ctc: totalAnnualCtc,
        monthly_ctc: monthlyCtc,
        basic_monthly: basicMonthly,
        basic_annual: basicAnnual,
        house_rent_allowance_monthly: houseRentMonthly,
        house_rent_allowance_annual: houseRentAnnual,
        conveyance_allowance_monthly: salaryDetails.conveyanceAllowance,
        medical_reimbursement_monthly: salaryDetails.medicalReimbursement,
        other_benefit_monthly: salaryDetails.otherBenefit,
        special_allowance_monthly: salaryDetails.specialAllowance,
        total_monthly_ctc: totalMonthlyCtc,
        total_annual_ctc: totalAnnualCtc,
        custom_salary_components: customSalaryComponents.length > 0 ? customSalaryComponents : null,
      };

      const { error } = await (supabase as any)
        .from("employee_details")
        .upsert(payload, { onConflict: "employee_id" });

      if (error) throw error;

      toast({
        title: "Saved",
        description: `${sectionName} saved to employee details.`,
      });
    } catch (error) {
      console.error("Failed to save employee_details:", error);
      toast({
        title: "Save failed",
        description: `Could not save ${sectionName.toLowerCase()}. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-6">
        <Button variant="outline" className="mb-4" onClick={() => navigate("/payroll")}> 
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Payroll
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">{employee?.full_name || "Employee Payroll"}</h1>
        <p className="text-muted-foreground">Payroll profile and payslip history</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="salary-details">Salary Details</TabsTrigger>
          <TabsTrigger value="payslips-forms">Payslips &amp; Forms</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="basic-name">Name</Label>
                <Input
                  id="basic-name"
                  value={basicInformation.name}
                  onChange={(event) =>
                    setBasicInformation((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="basic-email-address">Email Address</Label>
                <Input
                  id="basic-email-address"
                  type="email"
                  value={basicInformation.emailAddress}
                  onChange={(event) =>
                    setBasicInformation((prev) => ({ ...prev, emailAddress: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="basic-mobile-number">Mobile Number</Label>
                <Input
                  id="basic-mobile-number"
                  value={basicInformation.mobileNumber}
                  onChange={(event) =>
                    setBasicInformation((prev) => ({ ...prev, mobileNumber: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="basic-date-of-joining">Date of Joining</Label>
                <Input
                  id="basic-date-of-joining"
                  type="date"
                  value={basicInformation.dateOfJoining}
                  onChange={(event) =>
                    setBasicInformation((prev) => ({ ...prev, dateOfJoining: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="basic-gender">Gender</Label>
                <Input
                  id="basic-gender"
                  value={basicInformation.gender}
                  onChange={(event) =>
                    setBasicInformation((prev) => ({ ...prev, gender: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="basic-work-location">Work Location</Label>
                <Input
                  id="basic-work-location"
                  value={basicInformation.workLocation}
                  onChange={(event) =>
                    setBasicInformation((prev) => ({ ...prev, workLocation: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="basic-designation">Designation</Label>
                <Input
                  id="basic-designation"
                  value={basicInformation.designation}
                  onChange={(event) =>
                    setBasicInformation((prev) => ({ ...prev, designation: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="basic-departments">Departments</Label>
                <Input
                  id="basic-departments"
                  value={basicInformation.departments}
                  onChange={(event) =>
                    setBasicInformation((prev) => ({ ...prev, departments: event.target.value }))
                  }
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="button" disabled={isSaving} onClick={() => handleSaveEmployeeDetails("Basic Information")}>
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="personal-date-of-birth">Date of Birth</Label>
                <Input
                  id="personal-date-of-birth"
                  type="date"
                  value={personalInformation.dateOfBirth}
                  onChange={(event) =>
                    setPersonalInformation((prev) => ({ ...prev, dateOfBirth: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="personal-fathers-name">Father&apos;s Name</Label>
                <Input
                  id="personal-fathers-name"
                  value={personalInformation.fathersName}
                  onChange={(event) =>
                    setPersonalInformation((prev) => ({ ...prev, fathersName: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="personal-pan">PAN</Label>
                <Input
                  id="personal-pan"
                  value={personalInformation.pan}
                  onChange={(event) =>
                    setPersonalInformation((prev) => ({ ...prev, pan: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="personal-email-address">Email Address</Label>
                <Input
                  id="personal-email-address"
                  type="email"
                  value={personalInformation.emailAddress}
                  onChange={(event) =>
                    setPersonalInformation((prev) => ({ ...prev, emailAddress: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="personal-residential-address">Residential Address</Label>
                <Input
                  id="personal-residential-address"
                  value={personalInformation.residentialAddress}
                  onChange={(event) =>
                    setPersonalInformation((prev) => ({ ...prev, residentialAddress: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="personal-differently-abled-type">Differently Abled Type</Label>
                <Input
                  id="personal-differently-abled-type"
                  value={personalInformation.differentlyAbledType}
                  onChange={(event) =>
                    setPersonalInformation((prev) => ({ ...prev, differentlyAbledType: event.target.value }))
                  }
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="button" disabled={isSaving} onClick={() => handleSaveEmployeeDetails("Personal Information")}>
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="payment-mode">payment Mode</Label>
                <Input
                  id="payment-mode"
                  value={paymentInformation.paymentMode}
                  onChange={(event) =>
                    setPaymentInformation((prev) => ({ ...prev, paymentMode: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="payment-account-number">Account Number</Label>
                <Input
                  id="payment-account-number"
                  value={paymentInformation.accountNumber}
                  onChange={(event) =>
                    setPaymentInformation((prev) => ({ ...prev, accountNumber: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="payment-account-holder-name">Account Holder Name</Label>
                <Input
                  id="payment-account-holder-name"
                  value={paymentInformation.accountHolderName}
                  onChange={(event) =>
                    setPaymentInformation((prev) => ({ ...prev, accountHolderName: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="payment-bank-name">Bank Name</Label>
                <Input
                  id="payment-bank-name"
                  value={paymentInformation.bankName}
                  onChange={(event) =>
                    setPaymentInformation((prev) => ({ ...prev, bankName: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="payment-ifsc">IFSC</Label>
                <Input
                  id="payment-ifsc"
                  value={paymentInformation.ifsc}
                  onChange={(event) =>
                    setPaymentInformation((prev) => ({ ...prev, ifsc: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="payment-account-type">Account Type</Label>
                <Input
                  id="payment-account-type"
                  value={paymentInformation.accountType}
                  onChange={(event) =>
                    setPaymentInformation((prev) => ({ ...prev, accountType: event.target.value }))
                  }
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="button" disabled={isSaving} onClick={() => handleSaveEmployeeDetails("Payment Information")}>
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salary-details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Salary Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Annual CTC</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalAnnualCtc, currency)} per year</p>
                  {canEditSalaryComponents && !isRevisingAnnualCtc && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => setIsRevisingAnnualCtc(true)}
                    >
                      Revise
                    </Button>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monthly CTC</p>
                  <p className="text-2xl font-bold">{formatCurrency(monthlyCtc, currency)} per month</p>
                </div>
              </div>
              {canEditSalaryComponents && isRevisingAnnualCtc && (
                <div className="grid gap-3 sm:max-w-md">
                  <Label htmlFor="annual-ctc-revise">Revise Annual CTC</Label>
                  <Input
                    id="annual-ctc-revise"
                    type="number"
                    min="0"
                    value={annualCtcDraft}
                    onChange={(event) => setAnnualCtcDraft(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        const newAnnualCtc = parseCurrencyInput(annualCtcDraft);
                        setSalaryDetails((prev) => ({ ...prev, annualCtc: newAnnualCtc }));
                        setAnnualCtcDraft(String(newAnnualCtc));
                        setIsRevisingAnnualCtc(false);
                      }}
                    >
                      Apply
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setAnnualCtcDraft(String(salaryDetails.annualCtc));
                        setIsRevisingAnnualCtc(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {!canEditSalaryComponents && (
                <p className="text-xs text-muted-foreground">
                  Only Admin and Super Admin can edit salary components. Basic and House Rent Allowance are always formula-based.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
              <CardTitle>Salary Structure</CardTitle>
                  {isAutoSaving && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving...
                    </span>
                  )}
                </div>
                {canEditSalaryComponents && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddCustomComponent}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Others
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Salary Components</TableHead>
                    <TableHead className="text-right">Monthly Amount</TableHead>
                    <TableHead className="text-right">Annual Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allSalaryRows.map((row) => (
                    <TableRow 
                      key={row.key}
                      ref={(el) => {
                        if ((row as any).isCustom) {
                          componentRowRefs.current[row.key] = el;
                        }
                      }}
                      className={lastAddedComponentId === row.key ? "bg-muted/50" : ""}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {(row as any).isCustom && canEditSalaryComponents && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveCustomComponent(row.key)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          <div className="flex-1">
                            {(row as any).isCustom && canEditSalaryComponents ? (
                              // Custom component label: show input if editing or empty, otherwise show text
                              editingComponentId === row.key && editingField === "label" ? (
                                <>
                                  <Input
                                    type="text"
                                    className="w-48 font-medium mb-1"
                                    placeholder="Component name"
                                    value={row.label}
                                    onChange={(e) => handleUpdateCustomComponent(row.key, "label", e.target.value)}
                                    onBlur={() => {
                                      setEditingComponentId(null);
                                      setEditingField(null);
                                      // Auto-save when user clicks away after entering data
                                      autoSaveCustomComponents();
                                    }}
                                    autoFocus={lastAddedComponentId === row.key}
                                  />
                                  <p className="text-xs text-muted-foreground">{row.description}</p>
                                </>
                              ) : (
                                <>
                                  <p 
                                    className="font-medium cursor-pointer hover:bg-muted/50 px-2 py-1 rounded inline-block"
                                    onClick={() => {
                                      if (canEditSalaryComponents) {
                                        setEditingComponentId(row.key);
                                        setEditingField("label");
                                      }
                                    }}
                                  >
                                    {row.label || "Component name"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{row.description}</p>
                                </>
                              )
                            ) : (
                              <>
                        <p className="font-medium">{row.label}</p>
                        <p className="text-xs text-muted-foreground">{row.description}</p>
                              </>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.editable && (row as any).isCustom ? (
                          // Custom component: show formatted currency if saved, input if editing
                          editingComponentId === row.key && editingField === "monthly" ? (
                            <div className="flex justify-end">
                              <Input
                                type="number"
                                min="0"
                                className="w-36 text-right"
                                value={row.monthly}
                                disabled={!canEditSalaryComponents}
                                onChange={(event) => {
                                  if (!canEditSalaryComponents) return;
                                  const newValue = parseCurrencyInput(event.target.value);
                                  handleUpdateCustomComponent(row.key, "monthly", newValue);
                                }}
                                onBlur={() => {
                                  setEditingComponentId(null);
                                  setEditingField(null);
                                  // Auto-save when user clicks away after entering data
                                  autoSaveCustomComponents();
                                }}
                                autoFocus
                              />
                            </div>
                          ) : row.monthly > 0 ? (
                            // Show formatted currency with rupee symbol when saved
                            <span 
                              className="font-medium cursor-pointer hover:bg-muted/50 px-2 py-1 rounded"
                              onClick={() => {
                                if (canEditSalaryComponents) {
                                  setEditingComponentId(row.key);
                                  setEditingField("monthly");
                                }
                              }}
                            >
                              {formatCurrency(row.monthly, currency)}
                            </span>
                          ) : (
                            // Show input if not saved yet
                            <div className="flex justify-end">
                              <Input
                                type="number"
                                min="0"
                                className="w-36 text-right"
                                value={row.monthly}
                                disabled={!canEditSalaryComponents}
                                onChange={(event) => {
                                  if (!canEditSalaryComponents) return;
                                  const newValue = parseCurrencyInput(event.target.value);
                                  handleUpdateCustomComponent(row.key, "monthly", newValue);
                                }}
                                onBlur={() => {
                                  // Auto-save when user clicks away after entering data
                                  autoSaveCustomComponents();
                                }}
                              />
                            </div>
                          )
                        ) : row.editable && row.field ? (
                          // Regular editable component: show formatted currency with rupee symbol when saved, input if editing
                          editingComponentId === row.key && editingField === "monthly" ? (
                          <div className="flex justify-end">
                            <Input
                              type="number"
                              min="0"
                              className="w-36 text-right"
                              value={row.monthly}
                              disabled={!canEditSalaryComponents}
                              onChange={(event) => {
                                if (!canEditSalaryComponents) return;
                                const newValue = parseCurrencyInput(event.target.value);
                                setSalaryDetails((prev) => ({ ...prev, [row.field]: newValue }));
                              }}
                                onBlur={() => {
                                  setEditingComponentId(null);
                                  setEditingField(null);
                                }}
                                autoFocus
                            />
                          </div>
                          ) : (
                            <span 
                              className="font-medium cursor-pointer hover:bg-muted/50 px-2 py-1 rounded"
                              onClick={() => {
                                if (canEditSalaryComponents) {
                                  setEditingComponentId(row.key);
                                  setEditingField("monthly");
                                }
                              }}
                            >
                              {formatCurrency(row.monthly, currency)}
                            </span>
                          )
                        ) : (row as any).isDeduction ? (
                          <span className="font-medium text-destructive">-{formatCurrency(row.monthly, currency)}</span>
                        ) : (
                          <span className="font-medium">{formatCurrency(row.monthly, currency)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {(row as any).isDeduction ? (
                          <span className="text-destructive">-{formatCurrency(row.annual, currency)}</span>
                        ) : (
                          formatCurrency(row.annual, currency)
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell>
                      <p className="text-lg font-semibold">Cost to Company</p>
                    </TableCell>
                    <TableCell className="text-right text-lg font-semibold">{formatCurrency(totalMonthlyCtc, currency)}</TableCell>
                    <TableCell className="text-right text-lg font-semibold">{formatCurrency(totalAnnualCtc, currency)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <p className="text-lg font-semibold">Net Pay (After Deductions)</p>
                    </TableCell>
                    <TableCell className="text-right text-lg font-semibold">{formatCurrency(netPayMonthly, currency)}</TableCell>
                    <TableCell className="text-right text-lg font-semibold">{formatCurrency(netPayAnnual, currency)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {canEditSalaryComponents && (
            <div className="flex justify-end">
              <Button type="button" disabled={isSaving} onClick={() => handleSaveEmployeeDetails("Salary Details")}>
                Save Changes
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="payslips-forms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payslips &amp; Forms</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Basic Salary</TableHead>
                    <TableHead>Allowances</TableHead>
                    <TableHead>Deductions</TableHead>
                    <TableHead>Net Pay</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pay Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        Loading employee payslips...
                      </TableCell>
                    </TableRow>
                  ) : employeePayslips.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        No payslips available for this employee.
                      </TableCell>
                    </TableRow>
                  ) : (
                    employeePayslips.map((payslip) => {
                      const calculatedValues = calculatePayslipValues(payslip);
                      return (
                      <TableRow key={payslip.id}>
                        <TableCell>{format(new Date(payslip.period_start), "MMMM yyyy")}</TableCell>
                          <TableCell>{formatCurrency(calculatedValues.basic, currency)}</TableCell>
                          <TableCell className="text-success">+{formatCurrency(calculatedValues.allowances, currency)}</TableCell>
                          <TableCell className="text-destructive">-{formatCurrency(calculatedValues.deductions, currency)}</TableCell>
                          <TableCell className="font-semibold">{formatCurrency(calculatedValues.netPay, currency)}</TableCell>
                        <TableCell>
                          {canEditSalaryComponents ? (
                            <Select
                              value={(payslip.status || "pending") === "paid" ? "paid" : "pending"}
                              onValueChange={(value: "paid" | "pending") => {
                                if (value !== (payslip.status || "pending")) {
                                  handleUpdatePayslipStatus(payslip.id, value);
                                }
                              }}
                              disabled={updatingStatusPayslipId === payslip.id}
                            >
                              <SelectTrigger className="h-8 w-[120px]">
                                {updatingStatusPayslipId === payslip.id ? (
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Updating
                                  </div>
                                ) : (
                                  <SelectValue />
                                )}
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="paid">Paid</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant={payslip.status === "paid" ? "success" : "warning"}>
                              {statusLabel[payslip.status || "pending"]}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {payslip.pay_date ? format(new Date(payslip.pay_date), "MMM d, yyyy") : "N/A"}
                        </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewPayslip(payslip)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownloadPDF(payslip)}
                                disabled={downloadingId === payslip.id}
                              >
                                {downloadingId === payslip.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                      </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payslip Dialog */}
      {selectedPayslip && (
        <PayslipDialog
          payslip={selectedPayslip}
          open={isPayslipDialogOpen}
          onOpenChange={setIsPayslipDialogOpen}
        />
      )}
    </DashboardLayout>
  );
};

export default PayrollEmployeeDetails;
