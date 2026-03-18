import { format } from "date-fns";
import { numberToWords } from "@/lib/utils";

interface PayslipEarnings {
  basic: number;
  houseRentAllowance: number;
  conveyanceAllowance: number;
  medicalReimbursement: number;
  otherBenefit: number;
  specialAllowance: number;
}

interface PayslipEarningsYTD {
  basic: number;
  houseRentAllowance: number;
  conveyanceAllowance: number;
  medicalReimbursement: number;
  otherBenefit: number;
  specialAllowance: number;
}

interface PayslipDeductions {
  professionalTax: number;
}

interface PayslipDeductionsYTD {
  professionalTax: number;
}

interface Payslip {
  id: string;
  employee: {
    name: string;
    position: string;
    employeeId?: string;
    dateOfJoining?: string;
    bankAccountNo?: string;
    avatar: string;
  };
  period: string;
  payDate: string;
  paidDays: number;
  lopDays: number;
  earnings: PayslipEarnings;
  earningsYTD: PayslipEarningsYTD;
  deductions: PayslipDeductions;
  deductionsYTD: PayslipDeductionsYTD;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  status: "paid" | "pending" | "processing";
}

const FIXED_COMPANY_NAME = "Techvitta Innovations Pvt Ltd";
const FIXED_COMPANY_ADDRESS =
  "Plot No 19, Opp Cyber Pearl, Hitech City, Madhapur, Hyderabad Telangana 500081 India";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatCurrency = (amount: number) => {
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
  return `₹${formatted}`;
};

const toDateDDMMYYYY = (value?: string) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return format(date, "dd/MM/yyyy");
};

const getPayslipHtml = (payslip: Payslip) => {
  const employeeName = escapeHtml(payslip.employee.name || "N/A");
  const designation = escapeHtml(payslip.employee.position || "N/A");
  const employeeId = escapeHtml(payslip.employee.employeeId || "N/A");
  const dateOfJoining = escapeHtml(toDateDDMMYYYY(payslip.employee.dateOfJoining));
  const payPeriod = escapeHtml(payslip.period || "N/A");
  const payDate = escapeHtml(toDateDDMMYYYY(payslip.payDate));
  const bankAccountNo = escapeHtml(payslip.employee.bankAccountNo || "N/A");

  const netPay = formatCurrency(payslip.netPay);
  const amountInWords = `Indian Rupee ${numberToWords(payslip.netPay)} Only`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>Employee Payslip - ${employeeId}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
            font-size: 11px;
            color: #333;
            margin: 0;
            padding: 30px;
            background-color: #f9f9f9;
        }

        .payslip-container {
            width: 800px;
            margin: 0 auto;
            background-color: #ffffff;
            padding: 40px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }

        @media print {
            body {
                background-color: #ffffff;
                padding: 0;
                margin: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .payslip-container {
                width: 100%;
                box-shadow: none;
                padding: 20px;
            }
            .no-print { display: none; }
        }

        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
        }
        .company-name { font-size: 16px; font-weight: bold; color: #000; }
        .company-address { font-size: 10px; color: #666; margin-top: 4px; display: block; }
        .payslip-title { font-size: 13px; font-weight: bold; text-align: right; color: #000; }

        .summary-section {
            border-top: 1px solid #eee;
            padding-top: 15px;
            margin-bottom: 25px;
        }
        .section-title { font-weight: bold; font-size: 11px; margin-bottom: 12px; display: block; text-transform: uppercase; }
        .upper-summary { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
        .details-col { width: 62%; }
        .detail-row { display: flex; margin-bottom: 6px; align-items: baseline; }
        .label { font-weight: normal; width: 130px; color: #555; }
        .value { font-weight: bold; color: #000; flex: 1; }

        .net-pay-highlight-box {
            width: 220px;
            border: 1px solid #ddd;
            border-radius: 12px;
            overflow: hidden;
        }
        .box-top-part { background-color: #f4f7f9; padding: 15px 18px; }
        .box-bottom-part { background-color: #ffffff; padding: 10px 18px 15px 18px; }
        .net-label { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #666; }
        .net-amount { font-size: 22px; font-weight: bold; color: #000; margin: 3px 0; }
        .box-separator { border-top: 1px solid #eee; }
        .vertical-info { font-size: 10px; line-height: 1.6; color: #333; font-weight: bold; }

        .full-dotted-line { border-top: 1px dotted #bbb; margin: 15px 0; width: 100%; }

        .salary-box-container {
            border: 1px solid #ddd;
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 20px;
        }
        .financial-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .financial-table th { text-align: left; padding: 12px 10px; background-color: #fcfcfc; border-bottom: 1px solid #eee; font-weight: bold; color: #555; }
        .financial-table td { padding: 8px 10px; vertical-align: top; text-align: left; border-bottom: 1px solid #f0f0f0; }
        .bold-val { font-weight: bold; color: #000; }
        .total-row { font-weight: bold; border-top: 1px solid #eee; background-color: #f9f9f9; }

        .final-net-box {
            border: 1px solid #ddd;
            margin-top: 20px;
            border-radius: 12px;
            display: flex;
            align-items: stretch;
            overflow: hidden;
        }
        .final-net-label-group { padding: 15px 20px; flex: 1; background-color: #ffffff; }
        .vertical-divider { width: 1px; background-color: #ddd; }
        .final-amount-section {
            padding: 15px 30px;
            text-align: right;
            min-width: 130px;
            background-color: #f4f7f9;
            display: flex;
            align-items: center;
            justify-content: flex-end;
        }
        .final-net-val { font-weight: bold; font-size: 20px; color: #000; }

        .footer-info { margin-top: 15px; }
        .amount-words { font-size: 11px; color: #333; margin-bottom: 15px; }
        .final-separator { border-top: 1px solid #eee; margin: 20px 0; width: 100%; }
        .system-note { font-size: 9px; color: #aaa; text-align: center; }
    </style>
</head>
<body>
    <div class="payslip-container">
        <div class="header-top">
            <div class="company-info">
                <span class="company-name">${escapeHtml(FIXED_COMPANY_NAME)}</span>
                <span class="company-address">${escapeHtml(FIXED_COMPANY_ADDRESS)}</span>
            </div>
            <div class="payslip-title">Payslip For the Month ${payPeriod}</div>
        </div>

        <div class="summary-section">
            <span class="section-title">EMPLOYEE SUMMARY</span>
            <div class="upper-summary">
                <div class="details-col">
                    <div class="detail-row"><span class="label">Employee Name</span><span class="value">: ${employeeName}</span></div>
                    <div class="detail-row"><span class="label">Designation</span><span class="value">: ${designation}</span></div>
                    <div class="detail-row"><span class="label">Employee ID</span><span class="value">: ${employeeId}</span></div>
                    <div class="detail-row"><span class="label">Date of Joining</span><span class="value">: ${dateOfJoining}</span></div>
                    <div class="detail-row"><span class="label">Pay Period</span><span class="value">: ${payPeriod}</span></div>
                    <div class="detail-row"><span class="label">Pay Date</span><span class="value">: ${payDate}</span></div>
                </div>

                <div class="net-pay-highlight-box">
                    <div class="box-top-part">
                        <div class="net-label">Total Net Pay</div>
                        <div class="net-amount">${netPay}</div>
                    </div>
                    <div class="box-separator"></div>
                    <div class="box-bottom-part">
                        <div class="vertical-info">PAID DAYS: ${payslip.paidDays}<br>LOP DAYS: ${payslip.lopDays}</div>
                    </div>
                </div>
            </div>

            <div class="full-dotted-line"></div>

            <div class="detail-row">
                <span class="label">Bank Account No</span>
                <span class="value">: ${bankAccountNo}</span>
            </div>
        </div>

        <div class="salary-box-container">
            <table class="financial-table">
                <thead>
                    <tr>
                        <th style="width: 25%;">EARNINGS</th>
                        <th style="width: 15%;">AMOUNT</th>
                        <th style="width: 15%;">YTD</th>
                        <th style="width: 25%; padding-left: 20px;">DEDUCTIONS</th>
                        <th style="width: 20%;">AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>Basic</td><td class="bold-val">${formatCurrency(payslip.earnings.basic)}</td><td class="bold-val">${formatCurrency(payslip.earningsYTD.basic)}</td><td style="padding-left: 20px;">Professional Tax</td><td class="bold-val">${formatCurrency(payslip.deductions.professionalTax)}</td></tr>
                    <tr><td>House Rent Allowance</td><td class="bold-val">${formatCurrency(payslip.earnings.houseRentAllowance)}</td><td class="bold-val">${formatCurrency(payslip.earningsYTD.houseRentAllowance)}</td><td style="padding-left: 20px;"></td><td></td></tr>
                    <tr><td>Conveyance Allowance</td><td class="bold-val">${formatCurrency(payslip.earnings.conveyanceAllowance)}</td><td class="bold-val">${formatCurrency(payslip.earningsYTD.conveyanceAllowance)}</td><td style="padding-left: 20px;"></td><td></td></tr>
                    <tr><td>Medical Reimbursement</td><td class="bold-val">${formatCurrency(payslip.earnings.medicalReimbursement)}</td><td class="bold-val">${formatCurrency(payslip.earningsYTD.medicalReimbursement)}</td><td style="padding-left: 20px;"></td><td></td></tr>
                    <tr><td>Other Benefit</td><td class="bold-val">${formatCurrency(payslip.earnings.otherBenefit)}</td><td class="bold-val">${formatCurrency(payslip.earningsYTD.otherBenefit)}</td><td style="padding-left: 20px;"></td><td></td></tr>
                    <tr><td>Special Allowance</td><td class="bold-val">${formatCurrency(payslip.earnings.specialAllowance)}</td><td class="bold-val">${formatCurrency(payslip.earningsYTD.specialAllowance)}</td><td style="padding-left: 20px;"></td><td></td></tr>
                    <tr class="total-row"><td>Gross Earnings</td><td class="bold-val">${formatCurrency(payslip.grossEarnings)}</td><td></td><td style="padding-left: 20px;">Total Deductions</td><td class="bold-val">${formatCurrency(payslip.totalDeductions)}</td></tr>
                </tbody>
            </table>
        </div>

        <div class="final-net-box">
            <div class="final-net-label-group">
                <span style="font-weight: bold; font-size: 12px;">TOTAL NET PAYABLE</span>
                <span style="font-size: 10px; color: #555; display: block; margin-top: 2px;">Gross Earnings - Total Deductions</span>
            </div>
            <div class="vertical-divider"></div>
            <div class="final-amount-section">
                <span class="final-net-val">${netPay}</span>
            </div>
        </div>

        <div class="footer-info">
            <div class="amount-words"><strong>Amount In Words:</strong> ${escapeHtml(amountInWords)}</div>
            <div class="final-separator"></div>
        </div>

        <div class="system-note">- This is a system-generated document. --</div>
    </div>
</body>
</html>`;
};

export async function generatePayslipPDF(
  payslip: Payslip,
  _companyName?: string,
  _companyAddress?: string
): Promise<Blob> {
  const html2pdfModule = (await import("html2pdf.js")) as any;
  const html2pdf = html2pdfModule.default || html2pdfModule;

  const parsed = new DOMParser().parseFromString(getPayslipHtml(payslip), "text/html");
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";

  const styleTags = parsed.head.querySelectorAll("style");
  styleTags.forEach((styleTag) => {
    wrapper.appendChild(styleTag.cloneNode(true));
  });

  const container = parsed.body.querySelector(".payslip-container") as HTMLElement | null;
  if (!container) {
    throw new Error("Failed to render payslip template");
  }

  wrapper.appendChild(container.cloneNode(true));
  document.body.appendChild(wrapper);

  try {
    const sourceElement = wrapper.querySelector(".payslip-container") as HTMLElement;

    const blob = await html2pdf()
      .set({
        margin: 0,
        filename: "payslip.pdf",
        image: { type: "jpeg", quality: 1 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(sourceElement)
      .outputPdf("blob");

    return blob as Blob;
  } finally {
    if (wrapper.parentNode) {
      document.body.removeChild(wrapper);
    }
  }
}

export function downloadPDF(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export type {
  Payslip,
  PayslipEarnings,
  PayslipEarningsYTD,
  PayslipDeductions,
  PayslipDeductionsYTD,
};
