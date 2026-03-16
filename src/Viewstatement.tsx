import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'; // Adjust imports
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Button } from './components/ui/button';
import { Download, ArrowLeft, Eye, X, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface Transaction {
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
}

interface BankStatement {
  id: string;
  file_name: string;
  file_url: string;
  bank_name?: string;
  account_number?: string;
  statement_period_start?: string;
  statement_period_end?: string;
  opening_balance: number;
  closing_balance: number;
  total_credits: number;
  total_debits: number;
  currency: string;
  metadata: {
    transactions?: Transaction[];
    // Add other metadata fields as needed
  };
  created_at: string;
}

const Viewstatement: React.FC = () => {
  const { id } = useParams<{ id: string }>(); // Assuming route like /view-statement/:id
  const [statement, setStatement] = useState<BankStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [excelData, setExcelData] = useState<any[]>([]);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [documentMetadata, setDocumentMetadata] = useState<any>(null);

  const getFileExtension = (fileName: string) => {
    return fileName.split('.').pop()?.toLowerCase() || '';
  };

  const isExcelFile = (fileName: string) => {
    const ext = getFileExtension(fileName);
    return ['xlsx', 'xls', 'csv'].includes(ext);
  };

  const isUnsafeLocalhostUrl = (url: string) => {
    try {
      const parsed = new URL(url, window.location.origin);
      const localhostHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
      return localhostHosts.has(parsed.hostname) && parsed.origin !== window.location.origin;
    } catch {
      return false;
    }
  };

  const formatCurrency = (amount: number | null, currency: string = 'INR') => {
    if (amount === null || amount === undefined) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
    }).format(amount);
  };

  const extractBalanceFromSummary = (data: any[][], headerRowIndex: number, summaryInfo: any) => {
    // Extract opening and closing balance from the summary section directly
    if (!summaryInfo || !summaryInfo.data) {
      return { opening: null, closing: null };
    }

    const summaryData = summaryInfo.data;
    let opening: number | null = null;
    let closing: number | null = null;

    // Search the summary row for opening and closing balance values
    // Look for patterns like "Opening Balance: 5000" or just numeric values after "Opening Balance"
    const summaryText = summaryData.map((cell: any) => String(cell || "").toLowerCase()).join(" ");

    // Find opening balance
    for (let i = 0; i < summaryData.length; i++) {
      const cell = String(summaryData[i] || "").toLowerCase().trim();
      const nextCell = summaryData[i + 1];

      if (cell.includes("opening") && nextCell) {
        const nextCellStr = String(nextCell).trim();
        const parsed = parseFloat(nextCellStr.replace(/[^0-9.-]/g, ""));
        if (!isNaN(parsed)) {
          opening = parsed;
          break;
        }
      }
    }

    // Find closing balance
    for (let i = 0; i < summaryData.length; i++) {
      const cell = String(summaryData[i] || "").toLowerCase().trim();
      const nextCell = summaryData[i + 1];

      if ((cell.includes("closing") || cell.includes("final")) && nextCell) {
        const nextCellStr = String(nextCell).trim();
        const parsed = parseFloat(nextCellStr.replace(/[^0-9.-]/g, ""));
        if (!isNaN(parsed)) {
          closing = parsed;
          break;
        }
      }
    }

    return { opening, closing };
  };

  const extractSummaryAndCustomerInfo = (data: any[][]) => {
    const result: any = {
      customerInfo: [],
      summaryInfo: null,
      headerRowIndex: -1,
      transactionStartRow: -1,
      allRowsBeforeHeader: [], // Store all non-empty rows for debugging
    };

    if (data.length < 2) return result;

    // Find header row - use improved logic to skip title and summary rows
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(30, data.length); i++) {
      const row = data[i] as any[];
      if (!row || row.length === 0) continue;

      // Skip title/document header rows
      const rowText = row.map(cell => String(cell || "").toLowerCase().trim()).join(" ");
      
      // Skip obvious title rows
      const isTitleRow = rowText.includes("statement of account") ||
                        rowText.includes("account statement") ||
                        (rowText.length < 30 && (rowText.includes("statement") || rowText.includes("account")) && row.length === 1);
      
      // Skip summary rows that contain "opening", "closing", "total", "summary"
      const isSummaryRow = (rowText.includes("opening") && rowText.includes("balance")) ||
                          (rowText.includes("closing") && rowText.includes("balance")) ||
                          (rowText.includes("total") && (rowText.includes("debit") || rowText.includes("credit"))) ||
                          rowText.includes("summary");
      
      if (isTitleRow || isSummaryRow) {
        continue;
      }

      // Check if this row looks like transaction headers
      const transactionHeaderKeywords = ['date', 'description', 'narration', 'particulars', 'debit', 'credit', 'transaction'];
      const commonHeaderKeywords = ['value date', 'ref', 'reference', 'amount', 'balance'];
      
      const hasTransactionHeaders = transactionHeaderKeywords.filter(keyword => rowText.includes(keyword)).length >= 2;
      const totalHeaderCount = transactionHeaderKeywords.filter(keyword => rowText.includes(keyword)).length +
                              commonHeaderKeywords.filter(keyword => rowText.includes(keyword)).length;
      
      // Require at least 2 transaction-specific headers OR at least 3 total headers
      if (hasTransactionHeaders || (totalHeaderCount >= 3 && transactionHeaderKeywords.filter(keyword => rowText.includes(keyword)).length >= 1)) {
        headerRowIndex = i;
        result.headerRowIndex = i;
        break;
      }
    }

    // If no header found, try to find a row with mostly populated cells (likely the header)
    if (headerRowIndex === -1) {
      let maxPopulatedCount = 0;
      let bestRowIndex = -1;
      for (let i = 0; i < Math.min(30, data.length); i++) {
        const row = data[i] as any[];
        if (!row) continue;
        
        // Count non-empty cells
        const populatedCount = row.filter(cell => cell !== undefined && cell !== null && String(cell).trim() !== "").length;
        
        // Skip single-cell rows (likely titles)
        if (populatedCount === 1 && row.length > 3) continue;
        
        if (populatedCount > maxPopulatedCount && populatedCount >= 3) {
          maxPopulatedCount = populatedCount;
          bestRowIndex = i;
        }
      }
      
      if (bestRowIndex >= 0) {
        headerRowIndex = bestRowIndex;
        result.headerRowIndex = bestRowIndex;
      } else {
        // Final fallback
        headerRowIndex = 0;
        result.headerRowIndex = 0;
      }
    }

    // Extract all non-empty rows before header and classify them
    const rowsBeforeHeader: any[] = [];
    for (let i = 0; i < headerRowIndex; i++) {
      const row = data[i] as any[];
      
      // Skip completely empty rows
      const hasContent = row && row.some((cell) => {
        const cellStr = String(cell || "").trim();
        return cellStr !== "" && cellStr !== "undefined" && cellStr !== "null";
      });
      
      if (!hasContent) continue;

      rowsBeforeHeader.push({
        rowIndex: i,
        data: row,
        text: row.map((cell) => String(cell || "").toLowerCase()).join(" "),
      });
    }

    result.allRowsBeforeHeader = rowsBeforeHeader;

    // Now classify rows into customer info only (exclude summary rows)
    // Strategy: Look for rows that have label-value patterns or multiple numeric values
    rowsBeforeHeader.forEach((rowInfo) => {
      const rowText = rowInfo.text;
      
      // Strong indicators for summary row - exclude these from customerInfo
      const summaryIndicators = [
        "opening balance",
        "closing balance",
        "total debit",
        "total credit",
        "total debits",
        "total credits",
      ];
      
      const hasSummaryIndicator = summaryIndicators.some((indicator) =>
        rowText.includes(indicator)
      );

      // Only add non-summary rows as customer info
      if (!hasSummaryIndicator) {
        result.customerInfo.push({
          rowIndex: rowInfo.rowIndex,
          data: rowInfo.data,
        });
      }
    });

    result.transactionStartRow = headerRowIndex + 1;
    return result;
  };

  const loadExcelFile = async (fileUrl: string) => {
    try {
      setLoadingDocument(true);
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Get all data including empty cells
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1, 
        defval: '',
        blankrows: false 
      }) as any[][];
      
      // Find the maximum number of columns
      const maxCols = Math.max(...jsonData.map(row => row.length), 0);
      
      // Pad all rows to have the same number of columns
      const paddedData = jsonData.map(row => {
        const paddedRow = [...row];
        while (paddedRow.length < maxCols) {
          paddedRow.push('');
        }
        return paddedRow;
      });
      
      setExcelData(paddedData);
      
      // Extract metadata: customer info and summary info
      const metadata = extractSummaryAndCustomerInfo(paddedData);
      setDocumentMetadata(metadata);
    } catch (err) {
      console.error('Error loading Excel file:', err);
      setExcelData([]);
      setDocumentMetadata(null);
    } finally {
      setLoadingDocument(false);
    }
  };

  const handleViewDocument = async () => {
    if (statement && isExcelFile(statement.file_name)) {
      await loadExcelFile(statement.file_url);
    }
    setViewerOpen(true);
  };

  useEffect(() => {
    const fetchStatement = async () => {
      if (!id) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('bank_statements' as any)
        .select('*')
        .eq('id', id)
        .single() as { data: BankStatement | null; error: any };

      if (error) {
        setError(error.message);
      } else {
        setStatement(data as BankStatement | null);
      }
      setLoading(false);
    };

    fetchStatement();
  }, [id]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!statement) return <div>Statement not found</div>;

  const transactions = statement.metadata?.transactions || [];

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">View Statement</h1>
      </div>

      {/* Document Viewer Modal */}
      {viewerOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">{statement?.file_name}</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setViewerOpen(false);
                  setExcelData([]);
                  setDocumentMetadata(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto">
              {loadingDocument ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Loading document...</p>
                </div>
              ) : statement && isExcelFile(statement.file_name) ? (
                // Excel file view
                excelData.length > 0 ? (
                  <div className="p-4 overflow-x-auto space-y-6">
                    {/* Customer Information Section - Display all rows before summary */}
                    {documentMetadata?.customerInfo && documentMetadata.customerInfo.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-4 text-blue-900">Customer Information</h3>
                        <div className="space-y-4">
                          {documentMetadata.customerInfo.map((info: any, idx: number) => {
                            // Extract customer info pairs only up to "currency"
                            const customerPairs = [];
                            const processedIndices = new Set<number>();
                            
                            for (let i = 0; i < info.data.length; i++) {
                              if (processedIndices.has(i)) continue;
                              
                              const cell = String(info.data[i] || "").trim();
                              if (!cell) continue;
                              
                              const cellLower = cell.toLowerCase();
                              const isLabel = /^[a-zA-Z\s:()]+$/.test(cell);
                              
                              if (isLabel) {
                                const nextCell = info.data[i + 1] ? String(info.data[i + 1] || "").trim() : null;
                                if (nextCell) {
                                  customerPairs.push({
                                    label: cell,
                                    value: nextCell,
                                    idx: i
                                  });
                                  processedIndices.add(i);
                                  processedIndices.add(i + 1);
                                  
                                  // Stop if we've reached currency
                                  if (cellLower.includes("currency")) {
                                    break;
                                  }
                                }
                              }
                            }
                            
                            return (
                              <div key={idx} className="bg-white rounded p-4 border border-blue-100">
                                {customerPairs.map((pair: any) => (
                                  <div key={pair.idx} className="flex justify-between py-2 border-b border-blue-100 last:border-0">
                                    <span className="text-sm font-medium text-blue-700">{pair.label}:</span>
                                    <span className="text-sm text-blue-900 font-semibold">{pair.value}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Transactions Table */}
                    {documentMetadata?.transactionStartRow !== undefined && (
                      <div>
                        {(() => {
                          // Count actual transaction rows (non-empty rows)
                          const transactionRows = excelData.slice(documentMetadata.transactionStartRow);
                          const validTransactionCount = transactionRows.filter((row: any) =>
                            row.some((cell: any) => cell !== undefined && cell !== null && String(cell).trim() !== "")
                          ).length;

                          return (
                            <>
                              <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold">Transactions</h3>
                                <span className="text-sm font-medium bg-blue-100 text-blue-900 px-3 py-1 rounded-full">
                                  {validTransactionCount} rows
                                </span>
                              </div>
                              <Table className="text-sm border-collapse border border-gray-300">
                                <TableHeader>
                                  <TableRow className="bg-gray-100">
                                    {excelData[documentMetadata.headerRowIndex || 0]?.map((header: any, idx: number) => (
                                      <TableHead key={idx} className="border border-gray-300 p-2 text-left font-semibold min-w-max">{header || `Col ${idx + 1}`}</TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {transactionRows.map((row: any, rowIdx: number) => {
                                    // Skip completely empty rows
                                    const hasData = row.some((cell: any) => cell !== undefined && cell !== null && String(cell).trim() !== "");
                                    if (!hasData) return null;
                                    
                                    return (
                                      <TableRow key={rowIdx} className="hover:bg-gray-50">
                                        {row.map((cell: any, cellIdx: number) => (
                                          <TableCell key={cellIdx} className="border border-gray-300 p-2 text-xs align-top break-words">
                                            {cell !== undefined && cell !== null ? String(cell) : '—'}
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Full Data View (optional - collapsible) */}
                    <details className="mt-6 border rounded p-4">
                      <summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
                        Show Full Raw Data
                      </summary>
                      <div className="mt-4 overflow-x-auto">
                        <Table className="text-sm border-collapse border border-gray-300">
                          <TableHeader>
                            <TableRow className="bg-gray-100">
                              {excelData[0]?.map((header: any, idx: number) => (
                                <TableHead key={idx} className="border border-gray-300 p-2 text-left font-semibold min-w-max">{header || `Col ${idx + 1}`}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {excelData.slice(1).map((row: any, rowIdx: number) => (
                              <TableRow key={rowIdx} className="hover:bg-gray-50">
                                {row.map((cell: any, cellIdx: number) => (
                                  <TableCell key={cellIdx} className="border border-gray-300 p-2 text-xs align-top break-words">
                                    {cell !== undefined && cell !== null ? String(cell) : '—'}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                    <AlertCircle className="h-12 w-12 text-yellow-600" />
                    <p>Could not parse Excel file</p>
                  </div>
                )
              ) : (
                // PDF/Image view
                statement?.file_url && isUnsafeLocalhostUrl(statement.file_url) ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-6 text-center">
                    <AlertCircle className="h-12 w-12 text-yellow-600" />
                    <p>Blocked unsafe localhost URL for preview.</p>
                    <p className="text-sm">Use a valid Supabase storage URL or open the app on the same localhost origin.</p>
                  </div>
                ) : (
                  <iframe
                    src={statement?.file_url}
                    className="w-full h-full"
                    title={statement?.file_name}
                  />
                )
              )}
            </div>
          </div>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{statement.file_name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p><strong>Bank Name:</strong> {statement.bank_name || 'N/A'}</p>
              <p><strong>Account Number:</strong> {statement.account_number || 'N/A'}</p>
              <p><strong>Period:</strong> {statement.statement_period_start && statement.statement_period_end ? 
                `${format(new Date(statement.statement_period_start), 'MMM d, yyyy')} - ${format(new Date(statement.statement_period_end), 'MMM d, yyyy')}` : 'N/A'}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button asChild>
              <a href={statement.file_url} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4 mr-2" />
                Download Original File
              </a>
            </Button>
            <Button onClick={handleViewDocument} variant="secondary">
              <Eye className="h-4 w-4 mr-2" />
              View Document
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn, index) => (
                  <TableRow key={index}>
                    <TableCell>{format(new Date(txn.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{txn.description}</TableCell>
                    <TableCell>
                      <span className={txn.type === 'credit' ? 'text-green-600' : 'text-red-600'}>
                        {txn.type.charAt(0).toUpperCase() + txn.type.slice(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(txn.amount, statement.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p>No transactions found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Viewstatement;